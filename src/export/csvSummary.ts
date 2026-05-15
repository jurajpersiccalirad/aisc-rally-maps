import { CATEGORY_ORDER } from '../classify/categoryMeta';
import type { LngLatAlt, PointCategory } from '../types';

export interface StageSummaryRow {
  exportName: string;
  lengthKm: number;
  start: LngLatAlt;
  end: LngLatAlt;
  bufferM: number;
  pointCounts: ReadonlyMap<PointCategory, number>;
  overlapsWith: string[];
}

function escape(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function csvSummary(rows: StageSummaryRow[]): string {
  const categoryCols = CATEGORY_ORDER.map((c) => `points_${c}`);
  const header = [
    'stage',
    'length_km',
    'start_lng',
    'start_lat',
    'end_lng',
    'end_lat',
    'buffer_m',
    ...categoryCols,
    'overlap_with',
  ].join(',');

  const lines = rows.map((r) => {
    const cats = CATEGORY_ORDER.map((c) =>
      (r.pointCounts.get(c) ?? 0).toString(),
    );
    return [
      escape(r.exportName),
      r.lengthKm.toFixed(6),
      r.start[0].toString(),
      r.start[1].toString(),
      r.end[0].toString(),
      r.end[1].toString(),
      r.bufferM.toString(),
      ...cats,
      escape(r.overlapsWith.join('|')),
    ].join(',');
  });

  return [header, ...lines].join('\n') + '\n';
}
