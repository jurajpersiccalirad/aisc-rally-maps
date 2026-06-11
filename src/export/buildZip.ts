import saveAs from 'file-saver';
import JSZip from 'jszip';
import { REQUIRED_STAGE_CATEGORIES } from '../classify/categoryMeta';
import polygonClipping from 'polygon-clipping';
import { CATEGORY_ORDER } from '../classify/categoryMeta';
import type { RingMP } from '../geometry/bufferStage';
import {
  effectiveCategory,
  getEffectivePointStages,
  getStageDerivedGeometry,
  getStageLengthKm,
} from '../state/selectors';
import type { StageGeometry } from '../state/useStageGeometry';
import type { PointCategory, ProjectState } from '../types';
import { csvSummary, type StageSummaryRow } from './csvSummary';
import { stagePolygonGeoJson } from './geojsonWriter';
import { gpxForStage } from './gpxWriter';
import {
  projectJsonFilename,
  serializeProject,
} from './projectJson';
import { credentialsSql, type CredentialSqlRow, type CredRole } from './credentialsSql';
import { deviceSql, type DeviceRow } from './deviceSql';
import { eventSql } from './eventSql';
import { hashPassword } from '../lib/password';
import { startEndPointsTxt, type StageStartEnd } from './startEndPointsTxt';
import { stagesSql, type StageTableRow } from './stagesSql';
import {
  forceMultiPolygonToWkt,
  lineStringToWkt,
  multiPolygonToWkt,
} from './wktWriter';

export interface ZipPlan {
  filename: string;
  paths: string[];
  warnings: string[];
  errors: string[];
}

export function slugForFilename(name: string): string {
  return (
    name
      .replace(/\s+/g, '-')
      .replace(/[^A-Za-z0-9\-_.]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '') || 'event'
  );
}

export function planExport(
  state: ProjectState,
  geometry: StageGeometry,
): ZipPlan {
  const eventSlug = slugForFilename(state.eventName);
  const paths: string[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];

  if (state.stages.length === 0) {
    errors.push('No stages to export. Add a stage first.');
  }
  const seen = new Set<string>();
  for (const s of state.stages) {
    if (seen.has(s.exportName)) {
      errors.push(`Duplicate stage name "${s.exportName}".`);
    }
    seen.add(s.exportName);
    if (!geometry.buffered.has(s.id)) {
      errors.push(`Stage "${s.exportName}" has no buffered geometry.`);
    }
  }

  // C25 — warn on missing required controls per stage
  for (const s of state.stages) {
    const assigned = state.points.filter((p) => {
      if (p.stageOverride !== undefined) return p.stageOverride === s.id;
      const cat = p.categoryOverride ?? p.category;
      return cat !== 'other';
    });
    const presentCats = new Set(assigned.map((p) => p.categoryOverride ?? p.category));
    const missing = REQUIRED_STAGE_CATEGORIES.filter((c) => !presentCats.has(c));
    if (missing.length > 0) {
      warnings.push(
        `Stage "${s.exportName}" is missing: ${missing.join(', ')}. Assign these control points before finalising.`,
      );
    }
  }

  const overlapCount = state.stages.filter(
    (s) => (geometry.overlapsFor.get(s.id) ?? []).length > 0,
  ).length;
  if (overlapCount > 0) {
    warnings.push(
      `${overlapCount} stage${overlapCount > 1 ? 's' : ''} have buffer overlaps — combined ${eventSlug}.wkt dissolves them via polygon-clipping union.`,
    );
  }

  paths.push('start_end_points.txt');
  paths.push('summary.csv');
  paths.push('db/stages_table.sql');
  paths.push('db/event_table.sql');
  paths.push('db/devices_table.sql');
  paths.push('db/credentials_table.sql');
  paths.push('db/all_tables.sql');
  paths.push('db/credentials/<per-user .txt files>');
  paths.push(projectJsonFilename(state.eventName));
  paths.push(`wkt/${eventSlug}/${eventSlug}.wkt`);
  for (const s of state.stages) {
    paths.push(`wkt/${eventSlug}/${s.exportName}.wkt`);
    paths.push(`wkt/${eventSlug}/${s.exportName}-gj.wkt`);
    paths.push(`geojson/${eventSlug}/${s.exportName}.geojson`);
    paths.push(`gpx/${eventSlug}/${s.exportName}.gpx`);
  }

  return { filename: `${eventSlug}.zip`, paths, warnings, errors };
}

type ClippingGeom = Parameters<typeof polygonClipping.union>[0];

function unionAll(mps: RingMP[]): RingMP {
  if (mps.length === 0) return [];
  if (mps.length === 1) {
    try {
      return polygonClipping.union(mps[0] as ClippingGeom) as RingMP;
    } catch {
      return mps[0];
    }
  }
  try {
    return polygonClipping.union(
      mps[0] as ClippingGeom,
      ...(mps.slice(1) as ClippingGeom[]),
    ) as RingMP;
  } catch {
    return mps[0];
  }
}

export interface BuildZipResult {
  filename: string;
  blob: Blob;
}

export interface CredRow {
  username: string;
  plainPassword: string;
  role: CredRole;
}

export interface DbExportOptions {
  stageStartingId: number;
  eventId: number;
  eventStartDt: string;
  eventEndDt: string;
  unitSystem: 'imperial' | 'metric';
  deviceStartingId: number;
  selectedDevices: DeviceRow[];
  credStartingId: number;
  credEventId: number | null;
  appUrl: string;
  credRows: CredRow[];
  onHashProgress?: (done: number, total: number) => void;
}

export async function buildExportZip(
  state: ProjectState,
  geometry: StageGeometry,
  db: DbExportOptions,
): Promise<BuildZipResult> {
  const eventSlug = slugForFilename(state.eventName);
  const zip = new JSZip();
  const wktDir = zip.folder(`wkt/${eventSlug}`);
  const geojsonDir = zip.folder(`geojson/${eventSlug}`);
  const gpxDir = zip.folder(`gpx/${eventSlug}`);
  if (!wktDir || !geojsonDir || !gpxDir) {
    throw new Error('Failed to create ZIP folder structure.');
  }

  const stageMap = getEffectivePointStages(state);

  const startEndRows: StageStartEnd[] = [];
  const summaryRows: StageSummaryRow[] = [];
  const tableRows: StageTableRow[] = [];
  const allBufferedMps: RingMP[] = [];

  const overlapNamesFor = (stageId: string): string[] =>
    (geometry.overlapsFor.get(stageId) ?? [])
      .map((id) => state.stages.find((s) => s.id === id)?.exportName)
      .filter((n): n is string => !!n);

  for (const s of state.stages) {
    const derived = getStageDerivedGeometry(state, s.id);
    if (!derived || derived.length < 2) continue;
    const mp = geometry.buffered.get(s.id);
    if (!mp) continue;

    const overlapNames = overlapNamesFor(s.id);
    const lengthKm = getStageLengthKm(state, s.id);
    const start = derived[0];
    const end = derived[derived.length - 1];

    wktDir.file(`${s.exportName}.wkt`, multiPolygonToWkt(mp));
    wktDir.file(`${s.exportName}-gj.wkt`, lineStringToWkt(derived));

    geojsonDir.file(`${s.exportName}.geojson`, stagePolygonGeoJson(mp));

    const assignedPoints = state.points.filter(
      (p) => stageMap.get(p.id) === s.id,
    );
    gpxDir.file(
      `${s.exportName}.gpx`,
      gpxForStage(s.exportName, derived, assignedPoints, effectiveCategory),
    );

    const pointCounts = new Map<PointCategory, number>();
    for (const p of assignedPoints) {
      const cat = effectiveCategory(p);
      pointCounts.set(cat, (pointCounts.get(cat) ?? 0) + 1);
    }
    for (const c of CATEGORY_ORDER)
      if (!pointCounts.has(c)) pointCounts.set(c, 0);

    summaryRows.push({
      exportName: s.exportName,
      lengthKm,
      start,
      end,
      bufferM: s.bufferRadiusM,
      pointCounts,
      overlapsWith: overlapNames,
    });
    startEndRows.push({ exportName: s.exportName, start, end });
    tableRows.push({
      name: s.exportName,
      lengthM: Math.round(lengthKm * 1000),
      start,
      end,
    });
    allBufferedMps.push(mp);
  }

  // Combined <event>.wkt — union of all repaired stage buffers.
  const combinedMp = unionAll(allBufferedMps);
  wktDir.file(`${eventSlug}.wkt`, forceMultiPolygonToWkt(combinedMp));

  zip.file('start_end_points.txt', startEndPointsTxt(startEndRows));
  zip.file('summary.csv', csvSummary(summaryRows));
  zip.file(projectJsonFilename(state.eventName), serializeProject(state));

  // DB SQL files
  const dbDir = zip.folder('db');
  if (!dbDir) throw new Error('Failed to create db/ folder.');

  const stageSqlStr = stagesSql(tableRows, db.stageStartingId, db.eventId);
  const eventSqlStr = eventSql(db.eventId, state.eventName, db.eventStartDt, db.eventEndDt, db.unitSystem);
  const deviceSqlStr = deviceSql(db.selectedDevices, db.deviceStartingId, db.eventId);
  dbDir.file('stages_table.sql', stageSqlStr);
  dbDir.file('event_table.sql', eventSqlStr);
  dbDir.file('devices_table.sql', deviceSqlStr);

  // Hash passwords then write credentials SQL + per-user txt files
  const credDir = dbDir.folder('credentials');
  if (!credDir) throw new Error('Failed to create db/credentials/ folder.');
  const hashedRows: CredentialSqlRow[] = [];
  const total = db.credRows.length;
  for (let i = 0; i < total; i++) {
    const row = db.credRows[i];
    db.onHashProgress?.(i, total);
    const hashed = await hashPassword(row.plainPassword);
    hashedRows.push({ username: row.username, hashedPassword: hashed, role: row.role, eventId: db.credEventId });
    const txtName = `${eventSlug}_${row.username}_aisc_credentials.txt`;
    const txtContent = `URL: ${db.appUrl}\nUsername: ${row.username}\nPassword: ${row.plainPassword}\n`;
    credDir.file(txtName, txtContent);
  }
  db.onHashProgress?.(total, total);
  const credSqlStr = credentialsSql(hashedRows, db.credStartingId);
  dbDir.file('credentials_table.sql', credSqlStr);
  dbDir.file('all_tables.sql', [eventSqlStr, stageSqlStr, deviceSqlStr, credSqlStr].join('\n'));

  const blob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
  });
  return { filename: `${eventSlug}.zip`, blob };
}

export async function downloadExportZip(
  state: ProjectState,
  geometry: StageGeometry,
  db: DbExportOptions,
): Promise<void> {
  const { filename, blob } = await buildExportZip(state, geometry, db);
  saveAs(blob, filename);
}
