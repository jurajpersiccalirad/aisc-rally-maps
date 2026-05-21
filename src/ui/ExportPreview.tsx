import { useEffect, useMemo, useState } from 'react';
import type { CredRow, DbExportOptions } from '../export/buildZip';
import { downloadExportZip, planExport } from '../export/buildZip';
import type { CredRole } from '../export/credentialsSql';
import { generatePassword } from '../lib/password';
import { useDeviceStore, type Device } from '../state/deviceStore';
import { useProject } from '../state/useProject';
import { useStageGeometry } from '../state/useStageGeometry';

interface Props {
  onClose: () => void;
}

// ── export settings persistence (C24) ────────────────────────────────────────

const SETTINGS_KEY = 'aisc_export_settings';

interface SavedSettings {
  stageStartIdStr: string;
  eventIdStr: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  unitSystem: 'imperial' | 'metric';
  deviceStartIdStr: string;
  credStartIdStr: string;
  credKey: string;
  appUrl: string;
  credUseEventId: boolean;
  soCountStr: string;
  adminCountStr: string;
  viewerCountStr: string;
}

function loadSettings(): Partial<SavedSettings> {
  try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') as Partial<SavedSettings>; }
  catch { return {}; }
}

function s(key: keyof SavedSettings, fallback: string): string {
  return (loadSettings()[key] as string | undefined) ?? fallback;
}
function b(key: keyof SavedSettings, fallback: boolean): boolean {
  const v = loadSettings()[key];
  return v === undefined ? fallback : Boolean(v);
}

// ── helpers ──────────────────────────────────────────────────────────────────

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function buildRows(
  key: string,
  soCt: number,
  adminCt: number,
  viewerCt: number,
  existing: CredRow[],
): CredRow[] {
  const soEx = existing.filter((r) => r.role === 'SO');
  const adEx = existing.filter((r) => r.role === 'ADMIN');
  const viEx = existing.filter((r) => r.role === 'VIEWER');

  const mk = (role: CredRole, n: number, ex?: CredRow): CredRow => {
    const prefix = role === 'SO' ? 'so' : role === 'ADMIN' ? 'admin' : 'viewer';
    return {
      username: key ? `${prefix}_${key}_${n}` : `${prefix}_${n}`,
      plainPassword: ex?.plainPassword ?? generatePassword(),
      role,
    };
  };

  return [
    ...Array.from({ length: soCt }, (_, i) => mk('SO', i + 1, soEx[i])),
    ...Array.from({ length: adminCt }, (_, i) => mk('ADMIN', i + 1, adEx[i])),
    ...Array.from({ length: viewerCt }, (_, i) => mk('VIEWER', i + 1, viEx[i])),
  ];
}

// ── sub-sections ─────────────────────────────────────────────────────────────

function SectionHead({ title }: { title: string }) {
  return (
    <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600 mb-2 pt-1 border-t border-slate-100 mt-1">
      {title}
    </h3>
  );
}

function NumInput({
  label, value, onChange,
}: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="text-xs text-slate-600">{label}</span>
      <input
        type="number" min={0} step={1} value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-amber-400"
      />
    </label>
  );
}

// ── DeviceSection ─────────────────────────────────────────────────────────────

interface DeviceSectionProps {
  deviceStartIdStr: string;
  setDeviceStartIdStr: (v: string) => void;
  selectedIds: Set<string>;
  setSelectedIds: (s: Set<string>) => void;
}

function DeviceSection({ deviceStartIdStr, setDeviceStartIdStr, selectedIds, setSelectedIds }: DeviceSectionProps) {
  const { devices, addDevice, updateDevice, removeDevice } = useDeviceStore();
  const [newSerial, setNewSerial] = useState('');
  const [newName, setNewName] = useState('');

  const toggle = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedIds(next);
  };

  return (
    <>
      <SectionHead title="Devices (aicam.device)" />
      <div className="grid grid-cols-2 gap-3 mb-2">
        <NumInput label="Starting device ID" value={deviceStartIdStr} onChange={setDeviceStartIdStr} />
      </div>

      {/* Stored device list */}
      <div className="rounded border border-slate-200 bg-slate-50 divide-y divide-slate-100 mb-2 max-h-48 overflow-y-auto">
        {devices.length === 0 && (
          <p className="text-xs text-slate-400 italic px-2 py-2">No devices yet. Add one below.</p>
        )}
        {devices.map((d) => (
          <div key={d.id} className="flex items-center gap-2 px-2 py-1.5">
            <input type="checkbox" checked={selectedIds.has(d.id)} onChange={() => toggle(d.id)}
              className="accent-amber-500 flex-shrink-0" />
            <input value={d.serialNumber} onChange={(e) => updateDevice(d.id, { serialNumber: e.target.value })}
              placeholder="Serial"
              className="w-28 rounded border border-slate-200 px-1.5 py-0.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-amber-400" />
            <input value={d.name} onChange={(e) => updateDevice(d.id, { name: e.target.value })}
              placeholder="Name"
              className="flex-1 rounded border border-slate-200 px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-amber-400" />
            <button type="button" onClick={() => { removeDevice(d.id); setSelectedIds(new Set([...selectedIds].filter(i => i !== d.id))); }}
              className="text-slate-400 hover:text-red-600 text-xs px-1">✕</button>
          </div>
        ))}
      </div>

      {/* Add new device */}
      <div className="flex gap-2 items-end">
        <label className="block flex-shrink-0 w-28">
          <span className="text-xs text-slate-600">Serial</span>
          <input value={newSerial} onChange={(e) => setNewSerial(e.target.value)}
            className="mt-0.5 w-full rounded border border-slate-300 px-1.5 py-1 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-amber-400" />
        </label>
        <label className="block flex-1">
          <span className="text-xs text-slate-600">Name</span>
          <input value={newName} onChange={(e) => setNewName(e.target.value)}
            className="mt-0.5 w-full rounded border border-slate-300 px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-amber-400" />
        </label>
        <button type="button"
          onClick={() => {
            if (!newSerial.trim() && !newName.trim()) return;
            addDevice({ serialNumber: newSerial.trim(), name: newName.trim() });
            setNewSerial(''); setNewName('');
          }}
          className="px-2 py-1 text-xs rounded bg-slate-700 text-white hover:bg-slate-900 flex-shrink-0">
          + Add
        </button>
      </div>
      <p className="text-[11px] text-slate-400 mt-1">
        Tick the devices to include in this export. The list persists between sessions.
      </p>
    </>
  );
}

// ── CredentialsSection ────────────────────────────────────────────────────────

interface CredSectionProps {
  credStartIdStr: string; setCredStartIdStr: (v: string) => void;
  credKey: string; setCredKey: (v: string) => void;
  appUrl: string; setAppUrl: (v: string) => void;
  credUseEventId: boolean; setCredUseEventId: (v: boolean) => void;
  eventId: number;
  soCountStr: string; setSoCountStr: (v: string) => void;
  adminCountStr: string; setAdminCountStr: (v: string) => void;
  viewerCountStr: string; setViewerCountStr: (v: string) => void;
  rows: CredRow[];
  setRows: (r: CredRow[]) => void;
}

function CredentialsSection(p: CredSectionProps) {
  const regenRow = (idx: number) => {
    const next = [...p.rows];
    next[idx] = { ...next[idx], plainPassword: generatePassword() };
    p.setRows(next);
  };

  const addRow = () => {
    p.setRows([...p.rows, { username: '', plainPassword: generatePassword(), role: 'VIEWER' }]);
  };

  const updateRow = (idx: number, patch: Partial<CredRow>) => {
    const next = [...p.rows];
    next[idx] = { ...next[idx], ...patch };
    p.setRows(next);
  };

  const removeRow = (idx: number) => {
    p.setRows(p.rows.filter((_, i) => i !== idx));
  };

  return (
    <>
      <SectionHead title="Credentials (aicam.credentials)" />
      <div className="grid grid-cols-2 gap-3 mb-2">
        <NumInput label="Starting credential ID" value={p.credStartIdStr} onChange={p.setCredStartIdStr} />
        <label className="block">
          <span className="text-xs text-slate-600">Key (used in usernames)</span>
          <input value={p.credKey} onChange={(e) => p.setCredKey(e.target.value)}
            placeholder="e.g. severn26"
            className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-amber-400" />
        </label>
        <label className="block col-span-2">
          <span className="text-xs text-slate-600">App URL (written in credential files)</span>
          <input value={p.appUrl} onChange={(e) => p.setAppUrl(e.target.value)}
            placeholder="https://your-app.amplifyapp.com"
            className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
        </label>
      </div>

      <div className="flex items-center gap-3 mb-2 text-xs">
        <span className="text-slate-600">event_id in credentials:</span>
        <label className="flex items-center gap-1 cursor-pointer">
          <input type="radio" checked={p.credUseEventId} onChange={() => p.setCredUseEventId(true)} className="accent-amber-500" />
          <span className="font-mono">{p.eventId}</span>
        </label>
        <label className="flex items-center gap-1 cursor-pointer">
          <input type="radio" checked={!p.credUseEventId} onChange={() => p.setCredUseEventId(false)} className="accent-amber-500" />
          <span className="font-mono">NULL</span>
        </label>
      </div>

      <div className="flex items-end gap-3 mb-2">
        {([['SO', p.soCountStr, p.setSoCountStr], ['ADMIN', p.adminCountStr, p.setAdminCountStr], ['VIEWER', p.viewerCountStr, p.setViewerCountStr]] as const).map(([label, val, set]) => (
          <label key={label} className="block w-20">
            <span className="text-xs text-slate-600">{label}</span>
            <input type="number" min={0} step={1} value={val}
              onChange={(e) => set(e.target.value)}
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-amber-400" />
          </label>
        ))}
      </div>

      {/* Credential rows table */}
      <div className="rounded border border-slate-200 overflow-hidden mb-1">
        <table className="w-full text-xs">
          <thead className="bg-slate-100 text-slate-600">
            <tr>
              <th className="px-2 py-1 text-left font-medium w-16">Role</th>
              <th className="px-2 py-1 text-left font-medium">Username</th>
              <th className="px-2 py-1 text-left font-medium">Password (plain)</th>
              <th className="px-1 py-1 w-12"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 max-h-52 overflow-y-auto">
            {p.rows.map((row, i) => (
              <tr key={i} className="bg-white">
                <td className="px-2 py-1">
                  <select value={row.role} onChange={(e) => updateRow(i, { role: e.target.value as CredRole })}
                    className="w-full rounded border border-slate-200 px-1 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-amber-400">
                    <option>SO</option>
                    <option>ADMIN</option>
                    <option>VIEWER</option>
                  </select>
                </td>
                <td className="px-2 py-1">
                  <input value={row.username} onChange={(e) => updateRow(i, { username: e.target.value })}
                    className="w-full rounded border border-slate-200 px-1.5 py-0.5 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-amber-400" />
                </td>
                <td className="px-2 py-1">
                  <input value={row.plainPassword} onChange={(e) => updateRow(i, { plainPassword: e.target.value })}
                    className="w-full rounded border border-slate-200 px-1.5 py-0.5 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-amber-400" />
                </td>
                <td className="px-1 py-1 flex items-center gap-0.5">
                  <button type="button" onClick={() => regenRow(i)} title="Regenerate password"
                    className="text-slate-400 hover:text-amber-600 px-0.5">↺</button>
                  <button type="button" onClick={() => removeRow(i)}
                    className="text-slate-400 hover:text-red-600 px-0.5">✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button type="button" onClick={addRow}
        className="text-xs text-slate-600 hover:text-slate-900 rounded border border-dashed border-slate-300 px-2 py-1 hover:border-slate-500 w-full">
        + Add row
      </button>
    </>
  );
}

// ── ExportPreview (main) ──────────────────────────────────────────────────────

export function ExportPreview({ onClose }: Props) {
  const state = useProject();
  const geometry = useStageGeometry();
  const plan = useMemo(() => planExport(state, geometry), [state, geometry]);
  const { devices } = useDeviceStore();

  const [busy, setBusy] = useState(false);
  const [hashProgress, setHashProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Stage / Event — initialised from localStorage (C24)
  const [stageStartIdStr, setStageStartIdStr] = useState(() => s('stageStartIdStr', '1'));
  const [eventIdStr, setEventIdStr] = useState(() => s('eventIdStr', '1'));
  const [startDate, setStartDate] = useState(() => s('startDate', todayStr()));
  const [startTime, setStartTime] = useState(() => s('startTime', '08:00'));
  const [endDate, setEndDate] = useState(() => s('endDate', todayStr()));
  const [endTime, setEndTime] = useState(() => s('endTime', '20:00'));
  const [unitSystem, setUnitSystem] = useState<'imperial' | 'metric'>(
    () => (s('unitSystem', 'metric') as 'imperial' | 'metric'),
  );

  // Devices
  const [deviceStartIdStr, setDeviceStartIdStr] = useState(() => s('deviceStartIdStr', '1'));
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<Set<string>>(new Set());

  // Credentials
  const [credStartIdStr, setCredStartIdStr] = useState(() => s('credStartIdStr', '1'));
  const [credKey, setCredKey] = useState(() => s('credKey', ''));
  const [appUrl, setAppUrl] = useState(() => s('appUrl', ''));
  const [credUseEventId, setCredUseEventId] = useState(() => b('credUseEventId', true));
  const [soCountStr, setSoCountStr] = useState(() => s('soCountStr', '3'));
  const [adminCountStr, setAdminCountStr] = useState(() => s('adminCountStr', '0'));
  const [viewerCountStr, setViewerCountStr] = useState(() => s('viewerCountStr', '3'));
  const [credRows, setCredRows] = useState<CredRow[]>(() =>
    buildRows(s('credKey', ''), parseInt(s('soCountStr', '3')) || 3, 0, parseInt(s('viewerCountStr', '3')) || 3, []),
  );

  // Persist settings whenever they change (C24)
  useEffect(() => {
    const settings: SavedSettings = {
      stageStartIdStr, eventIdStr, startDate, startTime, endDate, endTime,
      unitSystem, deviceStartIdStr, credStartIdStr, credKey, appUrl,
      credUseEventId, soCountStr, adminCountStr, viewerCountStr,
    };
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); }
    catch { /* quota exceeded */ }
  }, [stageStartIdStr, eventIdStr, startDate, startTime, endDate, endTime,
      unitSystem, deviceStartIdStr, credStartIdStr, credKey, appUrl,
      credUseEventId, soCountStr, adminCountStr, viewerCountStr]);

  // Rebuild usernames when key or counts change; preserve passwords
  useEffect(() => {
    const so = parseInt(soCountStr) || 0;
    const admin = parseInt(adminCountStr) || 0;
    const viewer = parseInt(viewerCountStr) || 0;
    setCredRows((prev) => buildRows(credKey, so, admin, viewer, prev));
  }, [credKey, soCountStr, adminCountStr, viewerCountStr]);

  const eventId = parseInt(eventIdStr) || 0;

  const handleDownload = async () => {
    setBusy(true);
    setError(null);
    setHashProgress(null);
    try {
      const selectedDevices = devices
        .filter((d: Device) => selectedDeviceIds.has(d.id))
        .map((d: Device) => ({ serialNumber: d.serialNumber, name: d.name }));

      const db: DbExportOptions = {
        stageStartingId: parseInt(stageStartIdStr) || 0,
        eventId,
        eventStartDt: `${startDate} ${startTime}:00`,
        eventEndDt: `${endDate} ${endTime}:00`,
        unitSystem,
        deviceStartingId: parseInt(deviceStartIdStr) || 0,
        selectedDevices,
        credStartingId: parseInt(credStartIdStr) || 0,
        credEventId: credUseEventId ? eventId : null,
        appUrl,
        credRows,
        onHashProgress: (done, total) => setHashProgress({ done, total }),
      };
      await downloadExportZip(state, geometry, db);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setHashProgress(null);
    }
  };

  const canDownload = plan.errors.length === 0 && !busy;

  const busyLabel = hashProgress
    ? `Hashing passwords (${hashProgress.done}/${hashProgress.total})…`
    : 'Building…';

  return (
    <div className="fixed inset-0 z-[1000] bg-black/40 flex items-center justify-center p-4"
      onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-base font-semibold">Export preview</h2>
            <p className="text-xs text-slate-500 font-mono">{plan.filename}</p>
          </div>
          <button type="button" onClick={onClose}
            className="text-slate-500 hover:text-slate-900 px-2 py-1 text-xl leading-none" aria-label="Close">×</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 text-sm">
          {plan.errors.length > 0 && (
            <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-red-800 space-y-1">
              {plan.errors.map((e, i) => <div key={i}>✗ {e}</div>)}
            </div>
          )}
          {plan.warnings.length > 0 && (
            <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900 space-y-1">
              {plan.warnings.map((w, i) => <div key={i}>⚠ {w}</div>)}
            </div>
          )}

          {/* Stage & Event */}
          <SectionHead title="Stage & Event" />
          <div className="grid grid-cols-2 gap-3">
            <NumInput label="Starting stage ID" value={stageStartIdStr} onChange={setStageStartIdStr} />
            <NumInput label="Event ID" value={eventIdStr} onChange={setEventIdStr} />
            <label className="block">
              <span className="text-xs text-slate-600">Start date</span>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
            </label>
            <label className="block">
              <span className="text-xs text-slate-600">Start time</span>
              <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)}
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
            </label>
            <label className="block">
              <span className="text-xs text-slate-600">End date</span>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
            </label>
            <label className="block">
              <span className="text-xs text-slate-600">End time</span>
              <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)}
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
            </label>
          </div>
          <div className="flex gap-4 text-xs mt-1">
            <span className="text-slate-600">Unit system:</span>
            {(['metric', 'imperial'] as const).map((u) => (
              <label key={u} className="flex items-center gap-1 cursor-pointer">
                <input type="radio" value={u} checked={unitSystem === u} onChange={() => setUnitSystem(u)} className="accent-amber-500" />
                {u}
              </label>
            ))}
          </div>

          {/* Devices */}
          <DeviceSection
            deviceStartIdStr={deviceStartIdStr} setDeviceStartIdStr={setDeviceStartIdStr}
            selectedIds={selectedDeviceIds} setSelectedIds={setSelectedDeviceIds}
          />

          {/* Credentials */}
          <CredentialsSection
            credStartIdStr={credStartIdStr} setCredStartIdStr={setCredStartIdStr}
            credKey={credKey} setCredKey={setCredKey}
            appUrl={appUrl} setAppUrl={setAppUrl}
            credUseEventId={credUseEventId} setCredUseEventId={setCredUseEventId}
            eventId={eventId}
            soCountStr={soCountStr} setSoCountStr={setSoCountStr}
            adminCountStr={adminCountStr} setAdminCountStr={setAdminCountStr}
            viewerCountStr={viewerCountStr} setViewerCountStr={setViewerCountStr}
            rows={credRows} setRows={setCredRows}
          />

          {/* File list */}
          <SectionHead title={`Files (${plan.paths.length})`} />
          <ul className="font-mono text-xs space-y-0.5 max-h-40 overflow-y-auto rounded border border-slate-200 p-2 bg-slate-50">
            {plan.paths.map((p) => <li key={p} className="text-slate-700">{p}</li>)}
          </ul>

          {error && (
            <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-red-800">{error}</div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-slate-200 flex items-center justify-end gap-2 flex-shrink-0">
          <button type="button" onClick={onClose}
            className="px-3 py-1.5 text-sm rounded border border-slate-300 hover:bg-slate-50">Cancel</button>
          <button type="button" onClick={() => void handleDownload()} disabled={!canDownload}
            className="px-3 py-1.5 text-sm rounded bg-slate-900 text-white hover:bg-slate-700 disabled:bg-slate-300 disabled:cursor-not-allowed">
            {busy ? busyLabel : 'Download ZIP'}
          </button>
        </div>
      </div>
    </div>
  );
}
