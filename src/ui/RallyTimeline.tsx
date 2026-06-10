// Rally Progress Timeline — Royal Rally 2026, Sunday 24 May
// Hardcoded from itinerary v2.1 and start list Doc 5.6.

import { useState, useMemo, useEffect } from 'react';

/* ── helpers ──────────────────────────────────────────────────────────────── */

const C_START = 6 * 60;
const C_END   = 20 * 60;
const C_SPAN  = C_END - C_START;
const SPREAD  = 84;

function lp(min: number) { return `${(((min - C_START) / C_SPAN) * 100).toFixed(3)}%`; }
function wp(dur: number)  { return `${((dur  / C_SPAN) * 100).toFixed(3)}%`; }
function fmt(min: number) {
  const r = Math.round(min);
  return `${String(Math.floor(r / 60) % 24).padStart(2, '0')}:${String(r % 60).padStart(2, '0')}`;
}
function fmtDur(min: number) {
  const r = Math.round(Math.abs(min));
  return r < 60 ? `${r} min` : `${Math.floor(r / 60)}h${String(r % 60).padStart(2, '0')}`;
}
function parseHHMM(s: string): number {
  const [h, m = 0] = s.split(':').map(Number);
  return h * 60 + m;
}

/* ── types ────────────────────────────────────────────────────────────────── */

type EType = 'start' | 'service' | 'tc' | 'ss' | 'regroup' | 'finish';
type RallySegType = 'stage' | 'drive' | 'service' | 'regroup' | 'transit';

interface Entry {
  id: string; type: EType; label: string;
  firstCar: number;
  stageKm?: number;
  ssTargetMin?: number;
}
interface RaceCar { no: number; driver: string; start: number; cls: string; }
interface RallySegment { type: RallySegType; start: number; end: number; label: string; stageId?: string; }
interface SleepPeriod  { sleeping: boolean; start: number; end: number; label: string; }
interface TcMark       { id: string; time: number; type: EType; }
interface SelCar       { no: number; }

/* ── start list ───────────────────────────────────────────────────────────── */

const TC8D_DEFAULT = 6 * 60 + 20;

const START_LIST: RaceCar[] = [
  { no: 28, driver: 'Matsushita',   start: TC8D_DEFAULT + 0,  cls: 'RC2' },
  { no: 8,  driver: 'Kauppinen',    start: TC8D_DEFAULT + 2,  cls: 'RC2' },
  { no: 2,  driver: 'Marczyk',      start: TC8D_DEFAULT + 4,  cls: 'RC2' },
  { no: 4,  driver: 'Zaldivar',     start: TC8D_DEFAULT + 6,  cls: 'RC2' },
  { no: 30, driver: 'Semenuk',      start: TC8D_DEFAULT + 8,  cls: 'RC2' },
  { no: 10, driver: 'Tempestini',   start: TC8D_DEFAULT + 10, cls: 'RC2' },
  { no: 25, driver: 'Hallberg',     start: TC8D_DEFAULT + 12, cls: 'RC2' },
  { no: 14, driver: 'Carlberg',     start: TC8D_DEFAULT + 14, cls: 'RC2' },
  { no: 27, driver: 'Nõgene',       start: TC8D_DEFAULT + 16, cls: 'RC2' },
  { no: 21, driver: 'Larsen',       start: TC8D_DEFAULT + 18, cls: 'RC2' },
  { no: 11, driver: 'Reiersen',     start: TC8D_DEFAULT + 20, cls: 'RC2' },
  { no: 3,  driver: 'Sesks',        start: TC8D_DEFAULT + 22, cls: 'RC2' },
  { no: 22, driver: 'Heikkilä',     start: TC8D_DEFAULT + 24, cls: 'RC2' },
  { no: 1,  driver: 'Suninen',      start: TC8D_DEFAULT + 26, cls: 'RC2' },
  { no: 23, driver: 'Vaher',        start: TC8D_DEFAULT + 28, cls: 'RC2' },
  { no: 7,  driver: 'Matulka',      start: TC8D_DEFAULT + 30, cls: 'RC2' },
  { no: 19, driver: 'Allen',        start: TC8D_DEFAULT + 32, cls: 'RC2' },
  { no: 20, driver: 'Brynildsen',   start: TC8D_DEFAULT + 34, cls: 'RC2' },
  { no: 9,  driver: 'Charpentier',  start: TC8D_DEFAULT + 36, cls: 'RC2' },
  { no: 6,  driver: 'Creighton',    start: TC8D_DEFAULT + 38, cls: 'RC2' },
  { no: 16, driver: 'Német',        start: TC8D_DEFAULT + 40, cls: 'RC2' },
  { no: 12, driver: 'Ragues',       start: TC8D_DEFAULT + 42, cls: 'RC2' },
  { no: 24, driver: 'Gustafsson K', start: TC8D_DEFAULT + 44, cls: 'RC2' },
  { no: 26, driver: 'Liljegren',    start: TC8D_DEFAULT + 46, cls: 'RC2' },
  { no: 15, driver: 'Grahn',        start: TC8D_DEFAULT + 48, cls: 'RC2' },
  { no: 17, driver: 'Korhola',      start: TC8D_DEFAULT + 50, cls: 'RC2' },
  { no: 37, driver: 'Vatanen',      start: 7*60+12, cls: 'RC3' },
  { no: 40, driver: 'Rahill',       start: 7*60+13, cls: 'RC3' },
  { no: 36, driver: 'Kačírek',      start: 7*60+14, cls: 'RC3' },
  { no: 31, driver: 'Zielinski',    start: 7*60+15, cls: 'RC3' },
  { no: 44, driver: 'Hakalehto',    start: 7*60+16, cls: 'RC4' },
  { no: 32, driver: 'Coleman',      start: 7*60+17, cls: 'RC3' },
  { no: 43, driver: 'Tuthill',      start: 7*60+18, cls: 'RC3' },
  { no: 41, driver: 'Kazaz',        start: 7*60+19, cls: 'RC3' },
  { no: 34, driver: 'Graffin',      start: 7*60+20, cls: 'RC3' },
  { no: 46, driver: 'Schulz',       start: 7*60+21, cls: 'RC4' },
  { no: 50, driver: 'Pesavento',    start: 7*60+22, cls: 'RC4' },
  { no: 49, driver: 'Heindrichs',   start: 7*60+23, cls: 'RC4' },
  { no: 58, driver: 'Carlsson A',   start: 7*60+24, cls: 'RC4' },
  { no: 39, driver: 'Pokos',        start: 7*60+25, cls: 'RC3' },
  { no: 45, driver: 'Sandrin',      start: 7*60+26, cls: 'RC4' },
  { no: 53, driver: 'Dünker',       start: 7*60+27, cls: 'RC4' },
  { no: 54, driver: 'Neulinger',    start: 7*60+28, cls: 'RC4' },
  { no: 56, driver: 'Dallapiccola', start: 7*60+29, cls: 'RC4' },
  { no: 55, driver: 'Schönborn',    start: 7*60+30, cls: 'RC4' },
  { no: 57, driver: 'Ledda',        start: 7*60+31, cls: 'RC4' },
  { no: 62, driver: 'Stenberg M',   start: 7*60+32, cls: 'RC4' },
  { no: 51, driver: 'Dei Ceci',     start: 7*60+33, cls: 'RC4' },
  { no: 52, driver: 'Buteikis',     start: 7*60+35, cls: 'RC4' },
  { no: 33, driver: 'Lichtenegger', start: 7*60+36, cls: 'RC3' },
  { no: 35, driver: 'Caldwell',     start: 7*60+37, cls: 'RC3' },
  { no: 42, driver: 'Proudlock',    start: 7*60+38, cls: 'RC3' },
  { no: 59, driver: 'Suliman',      start: 7*60+39, cls: 'RC4' },
  { no: 60, driver: 'Zigliani',     start: 7*60+40, cls: 'RC4' },
  { no: 63, driver: 'Brädhe',       start: 7*60+42, cls: 'RC3' },
  { no: 61, driver: "O'Brien",      start: 7*60+44, cls: 'RC2' },
];

// Fixed sub-groups used for dynamic gap computation
const RC2_GROUP = START_LIST.filter(c => c.cls === 'RC2' && c.no !== 61);  // 26 seeded RC2
const MIX_GROUP = START_LIST.filter(c => c.cls !== 'RC2');                  // 29 RC3+RC4 (in original order)
const TAIL_CAR  = START_LIST.find(c => c.no === 61)!;                       // #61 last on road

/* ── itinerary ────────────────────────────────────────────────────────────── */
// ssTargetMin = time from SS START to the next TC (stage + liaison combined).

const DEFAULT_ITIN: Entry[] = [
  { id: 'TC 8D',  type: 'start',   label: 'Parc Fermé OUT / Service IN', firstCar: 6*60+20 },
  { id: 'TC 8E',  type: 'service', label: 'Service A OUT (15 min)',        firstCar: 6*60+35 },
  { id: 'TC 9',   type: 'tc',      label: 'TC 9',                          firstCar: 7*60+37 },
  { id: 'SS 9',   type: 'ss',      label: 'Bäckelid 1',                    firstCar: 7*60+40,  stageKm: 19.58, ssTargetMin: 46 },
  { id: 'TC 10',  type: 'tc',      label: 'TC 10',                         firstCar: 8*60+26 },
  { id: 'SS 10',  type: 'ss',      label: 'Ängebäckstorp 1',               firstCar: 8*60+29,  stageKm: 13.05, ssTargetMin: 60 },
  { id: 'TC 11',  type: 'tc',      label: 'TC 11',                         firstCar: 9*60+29 },
  { id: 'SS 11',  type: 'ss',      label: 'Bäckelid 2',                    firstCar: 9*60+32,  stageKm: 19.58, ssTargetMin: 46 },
  { id: 'TC 12',  type: 'tc',      label: 'TC 12',                         firstCar: 10*60+18 },
  { id: 'SS 12',  type: 'ss',      label: 'Ängebäckstorp 2',               firstCar: 10*60+21, stageKm: 13.05, ssTargetMin: 63 },
  { id: 'TC 12A', type: 'regroup', label: 'Regroup + TZ IN',               firstCar: 11*60+24 },
  { id: 'TC 12B', type: 'regroup', label: 'Regroup OUT / Service IN',      firstCar: 11*60+39 },
  { id: 'TC 12C', type: 'service', label: 'Service E OUT (30 min)',         firstCar: 12*60+9  },
  { id: 'TC 13',  type: 'tc',      label: 'TC 13',                         firstCar: 12*60+59 },
  { id: 'SS 13',  type: 'ss',      label: 'Lövhöjden 1',                  firstCar: 13*60+2,  stageKm: 8.91,  ssTargetMin: 57 },
  { id: 'TC 14',  type: 'tc',      label: 'TC 14',                         firstCar: 13*60+59 },
  { id: 'SS 14',  type: 'ss',      label: 'Ölme 1 Live TV',               firstCar: 14*60+5,  stageKm: 7.91,  ssTargetMin: 59 },
  { id: 'TC 15',  type: 'tc',      label: 'TC 15',                         firstCar: 15*60+4  },
  { id: 'SS 15',  type: 'ss',      label: 'Lövhöjden 2',                  firstCar: 15*60+7,  stageKm: 8.91,  ssTargetMin: 38 },
  { id: 'TC 15A', type: 'regroup', label: 'Regroup Väse IN',               firstCar: 15*60+45 },
  { id: 'TC 15B', type: 'regroup', label: 'Regroup Väse OUT',              firstCar: 16*60+41 },
  { id: 'TC 16',  type: 'tc',      label: 'TC 16',                         firstCar: 17*60+2  },
  { id: 'SS 16',  type: 'ss',      label: 'Ölme 2 Power Stage',            firstCar: 17*60+5,  stageKm: 7.91,  ssTargetMin: 70 },
  { id: 'TC 16A', type: 'finish',  label: 'Rally Finish',                  firstCar: 18*60+15 },
];

/* ── styles ───────────────────────────────────────────────────────────────── */

const ENTRY_STYLE: Record<EType, { badge: string; bar: string; hover: string }> = {
  start:   { badge: '#1e293b', bar: '#94a3b8', hover: '#475569' },
  tc:      { badge: '#1d4ed8', bar: '#bfdbfe', hover: '#3b82f6' },
  ss:      { badge: '#be123c', bar: '#fecdd3', hover: '#f43f5e' },
  service: { badge: '#166534', bar: '#bbf7d0', hover: '#22c55e' },
  regroup: { badge: '#92400e', bar: '#fde68a', hover: '#f59e0b' },
  finish:  { badge: '#6d28d9', bar: '#ddd6fe', hover: '#8b5cf6' },
};

const RALLY_SEG_STYLE: Record<RallySegType, { bg: string; border: string; tc: string }> = {
  stage:   { bg: '#fecdd3', border: '#be123c', tc: '#7f1d1d' },
  drive:   { bg: '#fed7aa', border: '#c2410c', tc: '#7c2d12' },
  service: { bg: '#bbf7d0', border: '#166534', tc: '#14532d' },
  regroup: { bg: '#fde68a', border: '#d97706', tc: '#78350f' },
  transit: { bg: '#fef9c3', border: '#a16207', tc: '#713f12' },
};

const CAR_COLORS = ['#dc2626','#2563eb','#16a34a','#d97706','#7c3aed','#0891b2','#be185d','#ea580c'];

const LABEL_W   = 210;
const ROW_H     = 28;
const AXIS_H    = 30;
// Per-car block has two bars: rally (top) and sleep (bottom)
const CAR_BLK_H  = 54;
const RALLY_H    = 17;
const SLEEP_H    = 9;
const RALLY_TOP  = 8;
const SLEEP_TOP  = RALLY_TOP + RALLY_H + 4;   // = 29
const HOUR_TICKS = Array.from({ length: 15 }, (_, i) => C_START + i * 60);
const HALF_TICKS = Array.from({ length: 14 }, (_, i) => C_START + 30 + i * 60);

/* ── timeline builder ─────────────────────────────────────────────────────── */

function buildTimeline(
  car: RaceCar,
  itin: Entry[],
  sleepBuf: number,      // wake up this many min before the TC preceding each SS
  postStageBuf: number,  // stay awake this many min after stage ends
  getKph: (id: string, t: 'fast' | 'slow') => number,
): { rallySegs: RallySegment[]; sleepPeriods: SleepPeriod[]; marks: TcMark[] } {
  if (itin.length === 0) return { rallySegs: [], sleepPeriods: [], marks: [] };

  const rallySegs: RallySegment[] = [];
  const marks: TcMark[] = [];
  const offset = car.start - itin[0].firstCar;
  const carTimes = itin.map(e => e.firstCar + offset);

  // Rally segments
  for (let i = 0; i < itin.length; i++) {
    const curr = itin[i];
    const t0   = carTimes[i];

    if (curr.type !== 'ss') marks.push({ id: curr.id, time: t0, type: curr.type });
    if (i >= itin.length - 1) break;

    const next = itin[i + 1];
    const t1   = carTimes[i + 1];

    if (curr.type === 'ss') {
      const fastDur  = (curr.stageKm! / getKph(curr.id, 'fast')) * 60;
      const stageEnd = t0 + fastDur;
      marks.push({ id: curr.id, time: t0, type: 'ss' });
      rallySegs.push({ type: 'stage', start: t0, end: stageEnd, stageId: curr.id,
        label: `${curr.id} · ${curr.stageKm} km · ${Math.round(fastDur)} min` });
      if (stageEnd < t1) {
        rallySegs.push({ type: 'drive', start: stageEnd, end: t1,
          label: `liaison ${Math.round(t1 - stageEnd)} min` });
      }
    } else if (curr.type === 'start' || curr.type === 'service') {
      rallySegs.push({ type: 'service', start: t0, end: t1, label: curr.label });
    } else if (curr.type === 'regroup') {
      rallySegs.push({ type: 'regroup', start: t0, end: t1, label: curr.label });
    } else if (curr.type === 'tc' && next.type === 'ss') {
      rallySegs.push({ type: 'transit', start: t0, end: t1,
        label: `TC→SS ${Math.round(t1 - t0)} min` });
    } else {
      rallySegs.push({ type: 'drive', start: t0, end: t1,
        label: `drive ${Math.round(t1 - t0)} min` });
    }
  }

  // Awake only around stage TCs: wake sleepBuf min before the TC that precedes each SS,
  // stay awake through TC check-in → transit → stage → postStageBuf after finish.
  const awakeRaw: [number, number][] = [];
  for (let i = 0; i < itin.length - 1; i++) {
    if (itin[i].type === 'tc' && itin[i + 1].type === 'ss') {
      const tcTime  = carTimes[i];
      const ss      = itin[i + 1];
      const ssTime  = carTimes[i + 1];
      const fastDur = (ss.stageKm! / getKph(ss.id, 'fast')) * 60;
      awakeRaw.push([tcTime - sleepBuf, ssTime + fastDur + postStageBuf]);
    }
  }

  // Sort and merge overlapping awake intervals
  awakeRaw.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const iv of awakeRaw) {
    if (!merged.length || iv[0] > merged[merged.length - 1][1]) {
      merged.push([iv[0], iv[1]]);
    } else {
      merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], iv[1]);
    }
  }

  // Build sleep/awake sequence across the full rally day
  const dayStart = carTimes[0];
  const dayEnd   = carTimes[carTimes.length - 1];
  const sleepPeriods: SleepPeriod[] = [];
  let cursor = dayStart;

  for (const [aw, ae] of merged) {
    const s = Math.max(aw, dayStart);
    if (cursor < s) {
      sleepPeriods.push({ sleeping: true,  start: cursor, end: s,
        label: `sleep ${Math.round(s - cursor)} min` });
    }
    const e = Math.min(ae, dayEnd);
    if (s < e) {
      sleepPeriods.push({ sleeping: false, start: s, end: e, label: 'awake' });
    }
    cursor = Math.max(cursor, e);
  }
  if (cursor < dayEnd) {
    sleepPeriods.push({ sleeping: false, start: cursor, end: dayEnd, label: 'awake' });
  }

  return { rallySegs, sleepPeriods, marks };
}

/* ── component ────────────────────────────────────────────────────────────── */

export function RallyTimeline({ onClose }: { onClose: () => void }) {
  const [fastKph,      setFastKph]      = useState(100);
  const [slowKph,      setSlowKph]      = useState(90);
  const [sleepBuf,     setSleepBuf]     = useState(10);
  const [postStageBuf, setPostStageBuf] = useState(5);
  const [overrides,    setOverrides]    = useState<Record<string, { fast: number; slow: number }>>({});
  const [selCars,      setSelCars]      = useState<SelCar[]>([]);
  const [localItin,    setLocalItin]    = useState<Entry[]>(DEFAULT_ITIN);
  const [showSettings, setShowSettings] = useState(false);
  const [showEdit,     setShowEdit]     = useState(false);
  const [hovEntry,     setHovEntry]     = useState<string | null>(null);
  const [hovered,      setHovered]      = useState<{ carNo: number; layer: 'rally' | 'sleep'; idx: number } | null>(null);
  const [newRow,       setNewRow]       = useState<Partial<Entry>>({ type: 'tc', id: '', label: '', firstCar: 12*60 });
  // Class gap settings
  const [rc2Gap,       setRc2Gap]       = useState(2);
  const [mixGap,       setMixGap]       = useState(1);
  // Per-car retirement: carNo -> first stage ID they don't run (null = runs all)
  const [retiredFrom,  setRetiredFrom]  = useState<Record<number, string | null>>({});
  // Current wall-clock time in minutes from midnight
  const [nowMin, setNowMin] = useState(() => { const d = new Date(); return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60; });

  useEffect(() => {
    const t = setInterval(() => {
      const d = new Date();
      setNowMin(d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60);
    }, 30_000);
    return () => clearInterval(t);
  }, []);

  const base = localItin[0]?.firstCar ?? TC8D_DEFAULT;

  function getKph(id: string, t: 'fast' | 'slow') {
    return overrides[id]?.[t] ?? (t === 'fast' ? fastKph : slowKph);
  }
  function setOverride(id: string, t: 'fast' | 'slow', v: number) {
    setOverrides(p => ({ ...p, [id]: { fast: p[id]?.fast ?? fastKph, slow: p[id]?.slow ?? slowKph, [t]: v } }));
  }

  const ssEntries = useMemo(() => localItin.filter(e => e.type === 'ss'), [localItin]);

  const ssStats = useMemo(() => ssEntries.map(ss => {
    const km     = ss.stageKm!;
    const target = ss.ssTargetMin!;
    const fast   = (km / getKph(ss.id, 'fast')) * 60;
    const slow   = (km / getKph(ss.id, 'slow')) * 60;
    return { id: ss.id, label: ss.label, km, target, fast, slow, liaison: target - fast };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [ssEntries, fastKph, slowKph, overrides]);

  // Dynamic start list from adjustable class gaps
  const computedStartList = useMemo<RaceCar[]>(() => {
    const rc2Base  = TC8D_DEFAULT;
    const mixBase  = rc2Base + (RC2_GROUP.length - 1) * rc2Gap + 2;
    const tailTime = mixBase + (MIX_GROUP.length - 1) * mixGap + 2;
    return [
      ...RC2_GROUP.map((c, i) => ({ ...c, start: rc2Base + i * rc2Gap })),
      ...MIX_GROUP.map((c, i) => ({ ...c, start: mixBase + i * mixGap })),
      { ...TAIL_CAR, start: tailTime },
    ];
  }, [rc2Gap, mixGap]);

  // Per-stage field spread among cars still running at each stage
  const spreadByEntry = useMemo(() => {
    const result: Record<string, number> = {};
    localItin.forEach((entry, idx) => {
      const running = computedStartList.filter(car => {
        const rf = retiredFrom[car.no];
        if (!rf) return true;
        const rfIdx = localItin.findIndex(e => e.id === rf);
        return idx < rfIdx;
      });
      const starts = running.map(c => c.start);
      result[entry.id] = starts.length < 2 ? 0 : Math.max(...starts) - Math.min(...starts);
    });
    return result;
  }, [localItin, computedStartList, retiredFrom]);

  const ssGaps = useMemo(() => ssEntries.slice(0, -1).map((ss, i) => {
    const next    = ssEntries[i + 1];
    const stat    = ssStats.find(s => s.id === ss.id)!;
    const spread  = spreadByEntry[ss.id] ?? SPREAD;
    const lastFin = ss.firstCar + spread + stat.slow;
    return { fromId: ss.id, toId: next.id, lastFin, nextFirst: next.firstCar, gapMin: next.firstCar - lastFin, spread };
  }), [ssEntries, ssStats, spreadByEntry]);

  const posGaps = useMemo(() => ssGaps.filter(g => g.gapMin > 0), [ssGaps]);

  const carTimelines = useMemo(() => selCars.map(sc => {
    const car = computedStartList.find(c => c.no === sc.no)!;
    const rf  = retiredFrom[sc.no];
    const activeItin = rf
      ? localItin.slice(0, localItin.findIndex(e => e.id === rf))
      : localItin;
    const { rallySegs, sleepPeriods, marks } = buildTimeline(car, activeItin, sleepBuf, postStageBuf, getKph);
    return { no: sc.no, car, rallySegs, sleepPeriods, marks };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [selCars, localItin, fastKph, slowKph, sleepBuf, postStageBuf, overrides, computedStartList, retiredFrom]);

  // Detect when 2+ selected cars are on stage simultaneously
  const stageOverlaps = useMemo(() => {
    if (carTimelines.length < 2) return [];
    const results: { carA: RaceCar; carB: RaceCar; stageA: string; stageB: string; same: boolean; oStart: number; oEnd: number; dur: number }[] = [];
    for (let ai = 0; ai < carTimelines.length - 1; ai++) {
      for (let bi = ai + 1; bi < carTimelines.length; bi++) {
        const ctA = carTimelines[ai];
        const ctB = carTimelines[bi];
        const ssA = ctA.rallySegs.filter(s => s.type === 'stage');
        const ssB = ctB.rallySegs.filter(s => s.type === 'stage');
        for (const sA of ssA) {
          for (const sB of ssB) {
            const oStart = Math.max(sA.start, sB.start);
            const oEnd   = Math.min(sA.end,   sB.end);
            if (oEnd > oStart) {
              results.push({ carA: ctA.car, carB: ctB.car, stageA: sA.stageId ?? '', stageB: sB.stageId ?? '', same: sA.stageId === sB.stageId, oStart, oEnd, dur: oEnd - oStart });
            }
          }
        }
      }
    }
    return results;
  }, [carTimelines]);

  function addCar(no: number) {
    if (!selCars.find(s => s.no === no)) setSelCars(p => [...p.slice(0, 7), { no }]);
  }
  function removeCar(no: number) { setSelCars(p => p.filter(s => s.no !== no)); }

  function editEntry(i: number, patch: Partial<Entry>) {
    setLocalItin(p => p.map((e, j) => j === i ? { ...e, ...patch } : e));
  }
  function moveEntry(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= localItin.length) return;
    setLocalItin(p => { const a = [...p]; [a[i], a[j]] = [a[j], a[i]]; return a; });
  }
  function removeEntry(i: number) { setLocalItin(p => p.filter((_, j) => j !== i)); }
  function addEntry() {
    const row: Entry = {
      id: newRow.id || 'NEW',
      type: (newRow.type as EType) || 'tc',
      label: newRow.label || '',
      firstCar: newRow.firstCar ?? 12 * 60,
      ...(newRow.stageKm    ? { stageKm:    newRow.stageKm    } : {}),
      ...(newRow.ssTargetMin ? { ssTargetMin: newRow.ssTargetMin } : {}),
    };
    setLocalItin(p => {
      const insertAt = p.findIndex(e => e.firstCar > row.firstCar);
      const arr = [...p];
      arr.splice(insertAt < 0 ? arr.length : insertAt, 0, row);
      return arr;
    });
    setNewRow({ type: 'tc', id: '', label: '', firstCar: 12 * 60 });
  }

  const chartH    = localItin.length * ROW_H;
  const carChartH = carTimelines.length * CAR_BLK_H;

  function TimeAxis() {
    return (
      <div style={{ height: AXIS_H, position: 'relative', borderBottom: '1px solid #e2e8f0' }}>
        {HOUR_TICKS.map(m => (
          <span key={m} style={{ position: 'absolute', left: lp(m), transform: 'translateX(-50%)',
            top: 7, fontSize: 10, color: '#94a3b8', fontFamily: 'monospace' }}>{fmt(m)}</span>
        ))}
      </div>
    );
  }

  function GridLines({ height }: { height: number }) {
    return <>
      {HOUR_TICKS.map(m => <div key={m} style={{ position:'absolute', left:lp(m), top:0, bottom:0, width:1, background:'#f1f5f9' }}/>)}
      {HALF_TICKS.map(m => <div key={m} style={{ position:'absolute', left:lp(m), top:0, height, width:1, background:'#f8fafc' }}/>)}
    </>;
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-white">

      {/* Header */}
      <div className="flex-shrink-0 px-4 py-2 border-b border-slate-200 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold">Royal Rally 2026 — Sunday Progress</h2>
          <p className="text-xs text-slate-500">24 May 2026 · 56 starters · first car {fmt(base)} · field spread {SPREAD} min · wake {sleepBuf} min before stage TC · sleep {postStageBuf} min after stage</p>
        </div>
        <button type="button" onClick={onClose}
          className="text-xs px-3 py-1.5 rounded border border-slate-300 hover:bg-slate-50 flex-shrink-0">
          ← Back
        </button>
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-auto p-4 space-y-4">

        {/* ── Settings ────────────────────────────────────────────────────── */}
        <div className="border border-slate-200 rounded-lg overflow-hidden">
          <button type="button" onClick={() => setShowSettings(v => !v)}
            className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100">
            <span>Settings — fast {fastKph} km/h · slow {slowKph} km/h · wake {sleepBuf} min before stage TC · awake {postStageBuf} min after stage</span>
            <span className="text-slate-400">{showSettings ? '▲' : '▼'}</span>
          </button>
          {showSettings && (
            <div className="p-3 space-y-3">
              <div className="flex gap-6 text-xs items-center flex-wrap">
                <label className="flex items-center gap-2">
                  Fast (top car):
                  <input type="number" min={80} max={140} step={5} value={fastKph}
                    onChange={e => setFastKph(Number(e.target.value))}
                    className="w-16 border border-slate-300 rounded px-2 py-0.5 text-center text-xs" />
                  km/h
                </label>
                <label className="flex items-center gap-2">
                  Slow (back of field):
                  <input type="number" min={60} max={130} step={5} value={slowKph}
                    onChange={e => setSlowKph(Number(e.target.value))}
                    className="w-16 border border-slate-300 rounded px-2 py-0.5 text-center text-xs" />
                  km/h
                </label>
                <label className="flex items-center gap-2">
                  Wake before stage TC:
                  <input type="number" min={0} max={30} step={1} value={sleepBuf}
                    onChange={e => setSleepBuf(Number(e.target.value))}
                    className="w-16 border border-slate-300 rounded px-2 py-0.5 text-center text-xs" />
                  min
                </label>
                <label className="flex items-center gap-2">
                  Awake after stage:
                  <input type="number" min={0} max={30} step={1} value={postStageBuf}
                    onChange={e => setPostStageBuf(Number(e.target.value))}
                    className="w-16 border border-slate-300 rounded px-2 py-0.5 text-center text-xs" />
                  min
                </label>
              </div>
              <div className="flex gap-6 text-xs items-center flex-wrap border-t border-slate-100 pt-2">
                <span className="font-semibold text-slate-500">Start gaps:</span>
                <label className="flex items-center gap-2">
                  RC2 ({RC2_GROUP.length} cars, first {fmt(TC8D_DEFAULT)}):
                  <input type="number" min={1} max={5} step={1} value={rc2Gap}
                    onChange={e => setRc2Gap(Number(e.target.value))}
                    className="w-12 border border-slate-300 rounded px-2 py-0.5 text-center text-xs" />
                  min/car → last {fmt(TC8D_DEFAULT + (RC2_GROUP.length - 1) * rc2Gap)}
                </label>
                <label className="flex items-center gap-2">
                  RC3+RC4 ({MIX_GROUP.length} cars):
                  <input type="number" min={1} max={5} step={1} value={mixGap}
                    onChange={e => setMixGap(Number(e.target.value))}
                    className="w-12 border border-slate-300 rounded px-2 py-0.5 text-center text-xs" />
                  min/car
                </label>
                <span className="text-slate-400">Total field spread: {computedStartList.length > 1
                  ? Math.max(...computedStartList.map(c => c.start)) - Math.min(...computedStartList.map(c => c.start))
                  : 0} min</span>
              </div>
              <div className="overflow-x-auto">
                <table className="text-xs border-collapse" style={{ minWidth: 640 }}>
                  <thead>
                    <tr className="bg-slate-50 text-slate-600">
                      <th className="text-left px-2 py-1 border border-slate-200">Stage</th>
                      <th className="text-right px-2 py-1 border border-slate-200">km</th>
                      <th className="text-right px-2 py-1 border border-slate-200">Fast kph</th>
                      <th className="text-right px-2 py-1 border border-slate-200">Fast time</th>
                      <th className="text-right px-2 py-1 border border-slate-200">Slow kph</th>
                      <th className="text-right px-2 py-1 border border-slate-200">Slow time</th>
                      <th className="text-right px-2 py-1 border border-slate-200">Target</th>
                      <th className="text-right px-2 py-1 border border-slate-200">Liaison</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ssStats.map(s => (
                      <tr key={s.id}>
                        <td className="px-2 py-1 border border-slate-200 font-semibold" style={{ color: '#be123c' }}>
                          {s.id} — {s.label}</td>
                        <td className="px-2 py-1 border border-slate-200 text-right">{s.km}</td>
                        <td className="px-2 py-1 border border-slate-200 text-right">
                          <input type="number" min={70} max={150} step={5}
                            value={overrides[s.id]?.fast ?? fastKph}
                            onChange={e => setOverride(s.id, 'fast', Number(e.target.value))}
                            className="w-14 border border-slate-200 rounded text-center text-xs px-1" />
                        </td>
                        <td className="px-2 py-1 border border-slate-200 text-right font-mono">
                          {s.fast.toFixed(1)} min</td>
                        <td className="px-2 py-1 border border-slate-200 text-right">
                          <input type="number" min={60} max={130} step={5}
                            value={overrides[s.id]?.slow ?? slowKph}
                            onChange={e => setOverride(s.id, 'slow', Number(e.target.value))}
                            className="w-14 border border-slate-200 rounded text-center text-xs px-1" />
                        </td>
                        <td className="px-2 py-1 border border-slate-200 text-right font-mono">
                          {(s.km / getKph(s.id, 'slow') * 60).toFixed(1)} min</td>
                        <td className="px-2 py-1 border border-slate-200 text-right font-mono">{s.target} min</td>
                        <td className={`px-2 py-1 border border-slate-200 text-right font-mono font-semibold ${s.liaison < 15 ? 'text-rose-600' : 'text-slate-700'}`}>
                          {s.liaison.toFixed(1)} min</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[10px] text-slate-400">Liaison = target − fast stage time. Red = tight (&lt;15 min).</p>
            </div>
          )}
        </div>

        {/* ── Car selector ─────────────────────────────────────────────────── */}
        <div>
          <div className="flex flex-wrap items-start gap-2">
            <span className="text-xs text-slate-500 font-medium mt-1.5">Track cars:</span>
            {selCars.map((sc, ci) => {
              const car = computedStartList.find(c => c.no === sc.no)!;
              const rf  = retiredFrom[sc.no] ?? '';
              return (
                <div key={sc.no} className="flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-white"
                  style={{ background: CAR_COLORS[ci] }}>
                  <span>#{sc.no} {car.driver} ({car.cls}) {fmt(car.start)}</span>
                  <select value={rf}
                    onChange={e => setRetiredFrom(p => ({ ...p, [sc.no]: e.target.value || null }))}
                    className="text-[10px] rounded px-1 py-0 text-slate-800 bg-white/90 ml-1">
                    <option value="">full race</option>
                    {ssEntries.map(ss => (
                      <option key={ss.id} value={ss.id}>DNS {ss.id}+</option>
                    ))}
                  </select>
                  <button type="button" onClick={() => removeCar(sc.no)} className="opacity-70 hover:opacity-100 ml-0.5">×</button>
                </div>
              );
            })}
            {selCars.length < 8 && (
              <select className="text-xs border border-slate-300 rounded px-2 py-1 bg-white"
                value="" onChange={e => { addCar(Number(e.target.value)); (e.target as HTMLSelectElement).value = ''; }}>
                <option value="">+ Add car…</option>
                {computedStartList.filter(c => !selCars.find(s => s.no === c.no)).map(c => (
                  <option key={c.no} value={c.no}>#{c.no} {c.driver} ({c.cls}) {fmt(c.start)}</option>
                ))}
              </select>
            )}
          </div>
          <p className="text-[10px] text-slate-400 mt-1">
            Device sleeps everywhere except stages. Wakes {sleepBuf} min before each stage TC, sleeps again {postStageBuf} min after stage ends.
          </p>
        </div>

        {/* ── Legend ───────────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[11px]">
          <span className="font-semibold text-slate-500 text-[10px]">FIELD:</span>
          {(Object.entries(ENTRY_STYLE) as [EType, typeof ENTRY_STYLE[EType]][]).map(([t, s]) => (
            <span key={t} className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm" style={{ background: s.badge }} />
              {{ start:'Start', service:'Service', tc:'TC', ss:'SS', regroup:'Regroup', finish:'Finish' }[t]}
            </span>
          ))}
          <span className="flex items-center gap-1.5">
            <span className="w-5 h-3 rounded-sm" style={{
              background: 'repeating-linear-gradient(45deg,#fecdd3,#fecdd3 2px,#fff7f7 2px,#fff7f7 6px)',
              border: '1px solid #be123c' }} />
            SS est. finish
          </span>
          {selCars.length > 0 && <>
            <span className="font-semibold text-slate-500 text-[10px] border-l border-slate-200 pl-4">RALLY BAR:</span>
            {(Object.entries(RALLY_SEG_STYLE) as [RallySegType, typeof RALLY_SEG_STYLE[RallySegType]][]).map(([t, s]) => (
              <span key={t} className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm" style={{ background: s.bg, border: `1px solid ${s.border}` }} />
                {{ stage:'Stage', drive:'Drive', service:'Service', regroup:'Regroup', transit:'Transit' }[t]}
              </span>
            ))}
            <span className="font-semibold text-slate-500 text-[10px] border-l border-slate-200 pl-4">SLEEP BAR:</span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm" style={{ background: '#5eead4', border: '1px solid #0d9488' }} />
              Sleeping
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm" style={{ background: '#f1f5f9', border: '1px solid #cbd5e1' }} />
              Awake
            </span>
          </>}
        </div>

        {/* ── Main Gantt (all locations, field view) ───────────────────────── */}
        <div style={{ display: 'flex', minWidth: 820 }}>
          <div style={{ width: LABEL_W, flexShrink: 0 }}>
            <div style={{ height: AXIS_H }} />
            {localItin.map(entry => {
              const s    = ENTRY_STYLE[entry.type];
              const isHov = hovEntry === entry.id;
              return (
                <div key={entry.id} style={{ height: ROW_H, display: 'flex', alignItems: 'center', gap: 5,
                    paddingRight: 6, background: isHov ? '#f8fafc' : undefined }}
                  onMouseEnter={() => setHovEntry(entry.id)}
                  onMouseLeave={() => setHovEntry(null)}>
                  <span className="text-white font-bold rounded flex-shrink-0"
                    style={{ background: s.badge, fontSize: 9, padding: '1px 4px', minWidth: 46, textAlign: 'center' }}>
                    {entry.id}
                  </span>
                  <span className="truncate" style={{ fontSize: 10, color: '#475569' }}>{entry.label}</span>
                </div>
              );
            })}
          </div>

          <div className="flex-1" style={{ position: 'relative', minWidth: 0 }}>
            <TimeAxis />
            <div style={{ position: 'relative', height: chartH }}>
              <GridLines height={chartH} />

              {/* Sleep gap shading */}
              {posGaps.map(g => (
                <div key={g.fromId}
                  style={{ position: 'absolute', left: lp(g.lastFin), width: wp(g.gapMin),
                    top: 0, bottom: 0, background: 'rgba(167,243,208,0.35)',
                    borderLeft: '2px dashed #34d399', borderRight: '2px dashed #34d399', zIndex: 0 }}
                  title={`Sleep gap: ${fmt(g.lastFin)} – ${fmt(g.nextFirst)} (${Math.round(g.gapMin)} min)`} />
              ))}
              {posGaps.map(g => (
                <div key={'lbl' + g.fromId}
                  style={{ position: 'absolute', left: lp(g.lastFin + g.gapMin / 2), top: 3,
                    transform: 'translateX(-50%)', fontSize: 9, color: '#059669', fontWeight: 700,
                    whiteSpace: 'nowrap', zIndex: 2, pointerEvents: 'none',
                    background: 'rgba(240,253,244,0.9)', padding: '0 3px', borderRadius: 2 }}>
                  {Math.round(g.gapMin)} min gap
                </div>
              ))}

              {/* Current time line */}
              {nowMin >= C_START && nowMin <= C_END && (
                <div style={{ position: 'absolute', left: lp(nowMin), top: 0, bottom: 0, width: 0,
                  borderLeft: '2px dashed #f97316', zIndex: 6, pointerEvents: 'none' }}
                  title={`Now: ${fmt(nowMin)}`} />
              )}

              {/* Entry bars */}
              {localItin.map((entry, i) => {
                const s       = ENTRY_STYLE[entry.type];
                const isHov   = hovEntry === entry.id;
                const top     = i * ROW_H;
                const stat    = entry.type === 'ss' ? ssStats.find(x => x.id === entry.id) : null;
                const slowDur = stat ? (stat.km / getKph(entry.id, 'slow') * 60) : 0;
                const spread  = spreadByEntry[entry.id] ?? SPREAD;
                return (
                  <div key={entry.id}
                    style={{ position: 'absolute', top, left: 0, right: 0, height: ROW_H, zIndex: 1 }}
                    onMouseEnter={() => setHovEntry(entry.id)}
                    onMouseLeave={() => setHovEntry(null)}>
                    {isHov && <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.03)' }} />}
                    <div style={{
                      position: 'absolute', left: lp(entry.firstCar), width: wp(spread),
                      top: (ROW_H - 14) / 2, height: 14,
                      background: isHov ? s.hover : s.bar,
                      border: `1px solid ${s.badge}`,
                      borderRadius: entry.type === 'ss' ? '3px 0 0 3px' : 3,
                      zIndex: 1, cursor: 'default',
                    }} title={`${entry.id}: first car ${fmt(entry.firstCar)}, last car ${fmt(entry.firstCar + spread)} (spread ${Math.round(spread)} min)`} />
                    {entry.type === 'ss' && slowDur > 0 && (
                      <div style={{
                        position: 'absolute', left: lp(entry.firstCar + spread), width: wp(slowDur),
                        top: (ROW_H - 14) / 2, height: 14,
                        background: `repeating-linear-gradient(45deg,${s.bar},${s.bar} 2px,rgba(255,255,255,0.6) 2px,rgba(255,255,255,0.6) 6px)`,
                        border: `1px solid ${s.badge}`, borderLeft: 'none',
                        borderRadius: '0 3px 3px 0', zIndex: 1,
                      }} title={`${entry.id} last car finishes ~${fmt(entry.firstCar + spread + slowDur)}`} />
                    )}
                    {selCars.map((sc, ci) => {
                      const car    = computedStartList.find(c => c.no === sc.no)!;
                      const arrMin = car.start + (entry.firstCar - base);
                      if (arrMin < C_START || arrMin > C_END) return null;
                      return (
                        <div key={sc.no} style={{
                          position: 'absolute', left: lp(arrMin),
                          top: (ROW_H - 10) / 2, width: 10, height: 10,
                          borderRadius: 5, background: CAR_COLORS[ci],
                          border: '2px solid #fff', zIndex: 4,
                          transform: 'translateX(-5px)', cursor: 'default',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                        }} title={`#${sc.no} ${car.driver}: ${fmt(arrMin)}`} />
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── Per-car Gantt (two bars each) ────────────────────────────────── */}
        {carTimelines.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-1">Per-car schedule</h3>
            <p className="text-[10px] text-slate-400 mb-2">
              Top bar: rally progression (stage / drive / service / regroup). Bottom bar: device sleep schedule (teal = sleeping, gray = awake). Vertical lines = time controls.
            </p>

            <div style={{ display: 'flex', minWidth: 820 }}>
              {/* Labels */}
              <div style={{ width: LABEL_W, flexShrink: 0 }}>
                <div style={{ height: AXIS_H }} />
                {carTimelines.map(({ no, car }, ci) => (
                  <div key={no} style={{ height: CAR_BLK_H, display: 'flex', flexDirection: 'column',
                    justifyContent: 'center', paddingRight: 6, gap: 2 }}>
                    <span style={{ fontWeight: 700, fontSize: 11, color: CAR_COLORS[ci] }}>
                      #{no} {car.driver}
                    </span>
                    <span style={{ fontSize: 10, color: '#64748b' }}>{car.cls} · start {fmt(car.start)}</span>
                    <div style={{ fontSize: 9, color: '#94a3b8', display: 'flex', gap: 8 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                        <span style={{ display: 'inline-block', width: 8, height: 4,
                          background: RALLY_SEG_STYLE.stage.bg, border: `1px solid ${RALLY_SEG_STYLE.stage.border}` }} />
                        rally
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                        <span style={{ display: 'inline-block', width: 8, height: 4,
                          background: '#5eead4', border: '1px solid #0d9488' }} />
                        sleep
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Chart */}
              <div className="flex-1" style={{ position: 'relative', minWidth: 0 }}>
                <TimeAxis />
                <div style={{ position: 'relative', height: carChartH }}>
                  <GridLines height={carChartH} />

                  {/* Current time line */}
                  {nowMin >= C_START && nowMin <= C_END && (
                    <div style={{ position: 'absolute', left: lp(nowMin), top: 0, bottom: 0, width: 0,
                      borderLeft: '2px dashed #f97316', zIndex: 6, pointerEvents: 'none' }}
                      title={`Now: ${fmt(nowMin)}`} />
                  )}

                  {carTimelines.map(({ no, rallySegs, sleepPeriods, marks }, ci) => {
                    const top = ci * CAR_BLK_H;
                    // TC marker span: from rally bar top to sleep bar bottom
                    const mkTop = RALLY_TOP - 2;
                    const mkH   = (SLEEP_TOP + SLEEP_H + 2) - mkTop;

                    return (
                      <div key={no} style={{ position: 'absolute', top, left: 0, right: 0, height: CAR_BLK_H }}>
                        {/* Block separator */}
                        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0,
                          height: 1, background: '#f1f5f9' }} />

                        {/* Rally bar background */}
                        <div style={{ position: 'absolute', top: RALLY_TOP, left: 0, right: 0,
                          height: RALLY_H, background: '#f8fafc', borderRadius: 3 }} />

                        {/* Sleep bar background */}
                        <div style={{ position: 'absolute', top: SLEEP_TOP, left: 0, right: 0,
                          height: SLEEP_H, background: '#f8fafc', borderRadius: 2 }} />

                        {/* Rally segments */}
                        {rallySegs.map((seg, si) => {
                          const ss = RALLY_SEG_STYLE[seg.type];
                          const visStart = Math.max(seg.start, C_START);
                          const visEnd   = Math.min(seg.end,   C_END);
                          if (visEnd <= visStart) return null;
                          const isHov = hovered?.carNo === no && hovered.layer === 'rally' && hovered.idx === si;
                          return (
                            <div key={si}
                              style={{
                                position: 'absolute', left: lp(visStart), width: wp(visEnd - visStart),
                                top: RALLY_TOP, height: RALLY_H,
                                background: ss.bg, border: `1px solid ${ss.border}`,
                                borderRadius: 3, zIndex: 2, overflow: 'hidden', boxSizing: 'border-box',
                                outline: isHov ? `2px solid ${ss.border}` : undefined,
                              }}
                              onMouseEnter={() => setHovered({ carNo: no, layer: 'rally', idx: si })}
                              onMouseLeave={() => setHovered(null)}
                              title={`${seg.label}\n${fmt(seg.start)} – ${fmt(seg.end)} (${Math.round(seg.end - seg.start)} min)`}>
                              {(visEnd - visStart) > C_SPAN * 0.025 && (
                                <span style={{ fontSize: 8, color: ss.tc, padding: '0 3px',
                                  whiteSpace: 'nowrap', lineHeight: `${RALLY_H}px`, display: 'block' }}>
                                  {seg.label}
                                </span>
                              )}
                            </div>
                          );
                        })}

                        {/* Sleep bar periods */}
                        {sleepPeriods.map((sp, si) => {
                          const visStart = Math.max(sp.start, C_START);
                          const visEnd   = Math.min(sp.end,   C_END);
                          if (visEnd <= visStart) return null;
                          const isHov = hovered?.carNo === no && hovered.layer === 'sleep' && hovered.idx === si;
                          const bg     = sp.sleeping ? '#5eead4' : '#f1f5f9';
                          const border = sp.sleeping ? '#0d9488' : '#cbd5e1';
                          return (
                            <div key={si}
                              style={{
                                position: 'absolute', left: lp(visStart), width: wp(visEnd - visStart),
                                top: SLEEP_TOP, height: SLEEP_H,
                                background: bg, border: `1px solid ${border}`,
                                borderRadius: 2, zIndex: 2, boxSizing: 'border-box',
                                outline: isHov ? `2px solid ${border}` : undefined,
                              }}
                              onMouseEnter={() => setHovered({ carNo: no, layer: 'sleep', idx: si })}
                              onMouseLeave={() => setHovered(null)}
                              title={`${sp.label}\n${fmt(sp.start)} – ${fmt(sp.end)} (${Math.round(sp.end - sp.start)} min)`}
                            />
                          );
                        })}

                        {/* TC/SS markers — span both bars */}
                        {marks.map(mk => {
                          if (mk.time < C_START || mk.time > C_END) return null;
                          const es = ENTRY_STYLE[mk.type];
                          return (
                            <div key={mk.id}
                              style={{ position: 'absolute', left: lp(mk.time),
                                top: mkTop, width: 2, height: mkH,
                                background: es.badge, zIndex: 3, transform: 'translateX(-1px)' }}
                              title={`${mk.id}: ${fmt(mk.time)}`}>
                              <div style={{ position: 'absolute', top: '100%', left: '50%',
                                transform: 'translateX(-50%)', fontSize: 7, color: es.badge,
                                whiteSpace: 'nowrap', fontWeight: 700, lineHeight: 1.2, marginTop: 1 }}>
                                {mk.id}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}

                  {/* Tooltip */}
                  {hovered && (() => {
                    const ct = carTimelines.find(t => t.no === hovered.carNo);
                    if (!ct) return null;
                    if (hovered.layer === 'rally') {
                      const seg = ct.rallySegs[hovered.idx];
                      if (!seg) return null;
                      const ss = RALLY_SEG_STYLE[seg.type];
                      return (
                        <div style={{ position: 'fixed', bottom: 80, right: 20,
                          background: 'white', border: `1.5px solid ${ss.border}`,
                          borderRadius: 6, padding: '6px 10px', zIndex: 100,
                          boxShadow: '0 4px 12px rgba(0,0,0,0.15)', fontSize: 11, minWidth: 160 }}>
                          <div style={{ fontWeight: 600, color: ss.tc }}>{seg.label}</div>
                          <div style={{ color: '#64748b', fontFamily: 'monospace', fontSize: 10 }}>
                            {fmt(seg.start)} – {fmt(seg.end)} · {Math.round(seg.end - seg.start)} min
                          </div>
                        </div>
                      );
                    } else {
                      const sp = ct.sleepPeriods[hovered.idx];
                      if (!sp) return null;
                      const border = sp.sleeping ? '#0d9488' : '#cbd5e1';
                      const tc     = sp.sleeping ? '#134e4a' : '#475569';
                      return (
                        <div style={{ position: 'fixed', bottom: 80, right: 20,
                          background: 'white', border: `1.5px solid ${border}`,
                          borderRadius: 6, padding: '6px 10px', zIndex: 100,
                          boxShadow: '0 4px 12px rgba(0,0,0,0.15)', fontSize: 11, minWidth: 160 }}>
                          <div style={{ fontWeight: 600, color: tc }}>{sp.label}</div>
                          <div style={{ color: '#64748b', fontFamily: 'monospace', fontSize: 10 }}>
                            {fmt(sp.start)} – {fmt(sp.end)} · {Math.round(sp.end - sp.start)} min
                          </div>
                        </div>
                      );
                    }
                  })()}
                </div>
              </div>
            </div>

            {/* Per-car summary */}
            <div className="mt-3 flex flex-wrap gap-3">
              {carTimelines.map(({ no, car, rallySegs, sleepPeriods }, ci) => {
                const totStage   = rallySegs.filter(s => s.type === 'stage').reduce((a, s) => a + s.end - s.start, 0);
                const totDrive   = rallySegs.filter(s => s.type === 'drive' || s.type === 'transit').reduce((a, s) => a + s.end - s.start, 0);
                const totService = rallySegs.filter(s => s.type === 'service').reduce((a, s) => a + s.end - s.start, 0);
                const totRegroup = rallySegs.filter(s => s.type === 'regroup').reduce((a, s) => a + s.end - s.start, 0);
                const totSleep   = sleepPeriods.filter(s => s.sleeping).reduce((a, s) => a + s.end - s.start, 0);
                return (
                  <div key={no} className="text-[10px] border border-slate-200 rounded px-2 py-1.5 bg-slate-50">
                    <div className="font-semibold mb-0.5" style={{ color: CAR_COLORS[ci] }}>
                      #{no} {car.driver}
                    </div>
                    <div className="text-slate-600 space-y-0.5">
                      <div>Stage: <strong style={{ color: '#be123c' }}>{fmtDur(totStage)}</strong></div>
                      <div>Drive/liaison: <strong>{fmtDur(totDrive)}</strong></div>
                      <div>Service: <strong style={{ color: '#166534' }}>{fmtDur(totService)}</strong></div>
                      <div>Regroup: <strong style={{ color: '#92400e' }}>{fmtDur(totRegroup)}</strong></div>
                      <div>Sleep: <strong style={{ color: '#0d9488' }}>{fmtDur(totSleep)}</strong></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Stage overlap alerts ─────────────────────────────────────────── */}
        {stageOverlaps.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-1">
              ⚠ Simultaneous stage overlap — {stageOverlaps.length} case{stageOverlaps.length > 1 ? 's' : ''}
            </h3>
            <p className="text-[10px] text-slate-400 mb-2">Selected cars on stage at the same time. Same stage = both cars doing the same SS; Different = cars in different SSes simultaneously (rare).</p>
            <table className="text-xs w-full border-collapse max-w-3xl">
              <thead>
                <tr className="bg-rose-50 text-slate-600">
                  <th className="text-left px-2 py-1 border border-slate-200">Car A</th>
                  <th className="text-left px-2 py-1 border border-slate-200">Stage A</th>
                  <th className="text-left px-2 py-1 border border-slate-200">Car B</th>
                  <th className="text-left px-2 py-1 border border-slate-200">Stage B</th>
                  <th className="text-right px-2 py-1 border border-slate-200">Overlap start</th>
                  <th className="text-right px-2 py-1 border border-slate-200">Overlap end</th>
                  <th className="text-right px-2 py-1 border border-slate-200">Duration</th>
                  <th className="text-center px-2 py-1 border border-slate-200">Type</th>
                </tr>
              </thead>
              <tbody>
                {stageOverlaps.map((ov, i) => (
                  <tr key={i} className={ov.same ? 'bg-rose-50' : 'bg-amber-50'}>
                    <td className="px-2 py-1 border border-slate-200 font-semibold">#{ov.carA.no} {ov.carA.driver}</td>
                    <td className="px-2 py-1 border border-slate-200" style={{ color: '#be123c' }}>{ov.stageA}</td>
                    <td className="px-2 py-1 border border-slate-200 font-semibold">#{ov.carB.no} {ov.carB.driver}</td>
                    <td className="px-2 py-1 border border-slate-200" style={{ color: '#be123c' }}>{ov.stageB}</td>
                    <td className="px-2 py-1 border border-slate-200 text-right font-mono">{fmt(ov.oStart)}</td>
                    <td className="px-2 py-1 border border-slate-200 text-right font-mono">{fmt(ov.oEnd)}</td>
                    <td className="px-2 py-1 border border-slate-200 text-right font-mono font-bold">{Math.round(ov.dur)} min</td>
                    <td className="px-2 py-1 border border-slate-200 text-center">
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${ov.same ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>
                        {ov.same ? 'same SS' : 'diff SS'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── SS gap table ─────────────────────────────────────────────────── */}
        <div className="max-w-2xl">
          <h3 className="text-sm font-semibold text-slate-700 mb-2">SS-to-SS gaps (incl. estimated finish)</h3>
          <table className="text-xs w-full border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-600">
                <th className="text-left px-2 py-1.5 border border-slate-200">From</th>
                <th className="text-left px-2 py-1.5 border border-slate-200">To</th>
                <th className="text-right px-2 py-1.5 border border-slate-200">Last car finishes</th>
                <th className="text-right px-2 py-1.5 border border-slate-200">Next SS opens</th>
                <th className="text-right px-2 py-1.5 border border-slate-200">Gap</th>
                <th className="text-left px-2 py-1.5 border border-slate-200"></th>
              </tr>
            </thead>
            <tbody>
              {ssGaps.map(g => (
                <tr key={g.fromId + g.toId} className={g.gapMin > 0 ? 'bg-emerald-50' : ''}>
                  <td className="px-2 py-1 border border-slate-200 font-semibold" style={{ color: '#be123c' }}>{g.fromId}</td>
                  <td className="px-2 py-1 border border-slate-200 font-semibold" style={{ color: '#be123c' }}>{g.toId}</td>
                  <td className="px-2 py-1 border border-slate-200 text-right font-mono">{fmt(g.lastFin)}</td>
                  <td className="px-2 py-1 border border-slate-200 text-right font-mono">{fmt(g.nextFirst)}</td>
                  <td className={`px-2 py-1 border border-slate-200 text-right font-mono font-bold ${g.gapMin > 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                    {g.gapMin > 0 ? `+${Math.round(g.gapMin)}` : Math.round(g.gapMin)} min
                  </td>
                  <td className="px-2 py-1 border border-slate-200 text-slate-400 text-[10px]">
                    {g.gapMin > 0
                      ? `${Math.round(g.gapMin)} min available`
                      : `${Math.abs(Math.round(g.gapMin))} min overlap — windows overlap`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-[10px] text-slate-400 mt-1">
            "Last car finishes" = first car + {SPREAD} min spread + slow stage estimate.
          </p>
        </div>

        {/* ── Edit itinerary (hidden) ──────────────────────────────────────── */}
        <div className="border border-slate-200 rounded-lg overflow-hidden">
          <button type="button" onClick={() => setShowEdit(v => !v)}
            className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-slate-500 bg-slate-50 hover:bg-slate-100">
            <span>Edit itinerary ({localItin.length} entries)</span>
            <span>{showEdit ? '▲ hide' : '▼ show'}</span>
          </button>
          {showEdit && (
            <div className="p-3 space-y-3">
              <div className="flex justify-end">
                <button type="button" onClick={() => setLocalItin(DEFAULT_ITIN)}
                  className="text-xs px-2 py-1 border border-slate-300 rounded hover:bg-slate-50">
                  Reset to defaults
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="text-xs border-collapse w-full" style={{ minWidth: 700 }}>
                  <thead>
                    <tr className="bg-slate-50 text-slate-600">
                      <th className="px-2 py-1 border border-slate-200 w-14">Order</th>
                      <th className="text-left px-2 py-1 border border-slate-200">Type</th>
                      <th className="text-left px-2 py-1 border border-slate-200">ID</th>
                      <th className="text-left px-2 py-1 border border-slate-200">Label</th>
                      <th className="text-right px-2 py-1 border border-slate-200">First car</th>
                      <th className="text-right px-2 py-1 border border-slate-200">Stage km</th>
                      <th className="text-right px-2 py-1 border border-slate-200">Target (SS→TC)</th>
                      <th className="px-2 py-1 border border-slate-200 w-16"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {localItin.map((e, i) => (
                      <tr key={i} className="hover:bg-slate-50">
                        <td className="px-1 py-0.5 border border-slate-200 text-center">
                          <button type="button" onClick={() => moveEntry(i, -1)}
                            disabled={i === 0} className="px-1 disabled:opacity-20">↑</button>
                          <button type="button" onClick={() => moveEntry(i, 1)}
                            disabled={i === localItin.length - 1} className="px-1 disabled:opacity-20">↓</button>
                        </td>
                        <td className="px-1 py-0.5 border border-slate-200">
                          <select value={e.type}
                            onChange={ev => editEntry(i, { type: ev.target.value as EType })}
                            className="text-xs border border-slate-200 rounded px-1 py-0.5 w-20">
                            {(['start','tc','ss','service','regroup','finish'] as EType[]).map(t =>
                              <option key={t} value={t}>{t}</option>)}
                          </select>
                        </td>
                        <td className="px-1 py-0.5 border border-slate-200">
                          <input value={e.id} onChange={ev => editEntry(i, { id: ev.target.value })}
                            className="text-xs border border-slate-200 rounded px-1 py-0.5 w-20" />
                        </td>
                        <td className="px-1 py-0.5 border border-slate-200">
                          <input value={e.label} onChange={ev => editEntry(i, { label: ev.target.value })}
                            className="text-xs border border-slate-200 rounded px-1 py-0.5 w-48" />
                        </td>
                        <td className="px-1 py-0.5 border border-slate-200">
                          <input value={fmt(e.firstCar)}
                            onChange={ev => {
                              const v = parseHHMM(ev.target.value);
                              if (!isNaN(v) && v > 0) editEntry(i, { firstCar: v });
                            }}
                            className="text-xs border border-slate-200 rounded px-1 py-0.5 w-16 font-mono text-right" />
                        </td>
                        <td className="px-1 py-0.5 border border-slate-200">
                          <input type="number" step={0.01} value={e.stageKm ?? ''} placeholder="—"
                            onChange={ev => editEntry(i, { stageKm: ev.target.value ? Number(ev.target.value) : undefined })}
                            className="text-xs border border-slate-200 rounded px-1 py-0.5 w-16 text-right" />
                        </td>
                        <td className="px-1 py-0.5 border border-slate-200">
                          <input type="number" step={1} value={e.ssTargetMin ?? ''} placeholder="—"
                            onChange={ev => editEntry(i, { ssTargetMin: ev.target.value ? Number(ev.target.value) : undefined })}
                            className="text-xs border border-slate-200 rounded px-1 py-0.5 w-16 text-right" />
                        </td>
                        <td className="px-1 py-0.5 border border-slate-200 text-center">
                          <button type="button" onClick={() => removeEntry(i)}
                            className="text-rose-400 hover:text-rose-700 px-1">✕</button>
                        </td>
                      </tr>
                    ))}
                    {/* New entry row */}
                    <tr className="bg-slate-50">
                      <td className="px-1 py-0.5 border border-slate-200 text-center text-slate-400">+</td>
                      <td className="px-1 py-0.5 border border-slate-200">
                        <select value={newRow.type}
                          onChange={e => setNewRow(p => ({ ...p, type: e.target.value as EType }))}
                          className="text-xs border border-slate-200 rounded px-1 py-0.5 w-20">
                          {(['start','tc','ss','service','regroup','finish'] as EType[]).map(t =>
                            <option key={t} value={t}>{t}</option>)}
                        </select>
                      </td>
                      <td className="px-1 py-0.5 border border-slate-200">
                        <input placeholder="ID" value={newRow.id ?? ''}
                          onChange={e => setNewRow(p => ({ ...p, id: e.target.value }))}
                          className="text-xs border border-slate-200 rounded px-1 py-0.5 w-20" />
                      </td>
                      <td className="px-1 py-0.5 border border-slate-200">
                        <input placeholder="Label" value={newRow.label ?? ''}
                          onChange={e => setNewRow(p => ({ ...p, label: e.target.value }))}
                          className="text-xs border border-slate-200 rounded px-1 py-0.5 w-48" />
                      </td>
                      <td className="px-1 py-0.5 border border-slate-200">
                        <input placeholder="HH:MM" value={newRow.firstCar ? fmt(newRow.firstCar) : ''}
                          onChange={e => {
                            const v = parseHHMM(e.target.value);
                            if (!isNaN(v) && v > 0) setNewRow(p => ({ ...p, firstCar: v }));
                          }}
                          className="text-xs border border-slate-200 rounded px-1 py-0.5 w-16 font-mono text-right" />
                      </td>
                      <td className="px-1 py-0.5 border border-slate-200">
                        <input type="number" step={0.01} placeholder="—" value={newRow.stageKm ?? ''}
                          onChange={e => setNewRow(p => ({ ...p, stageKm: e.target.value ? Number(e.target.value) : undefined }))}
                          className="text-xs border border-slate-200 rounded px-1 py-0.5 w-16 text-right" />
                      </td>
                      <td className="px-1 py-0.5 border border-slate-200">
                        <input type="number" step={1} placeholder="—" value={newRow.ssTargetMin ?? ''}
                          onChange={e => setNewRow(p => ({ ...p, ssTargetMin: e.target.value ? Number(e.target.value) : undefined }))}
                          className="text-xs border border-slate-200 rounded px-1 py-0.5 w-16 text-right" />
                      </td>
                      <td className="px-1 py-0.5 border border-slate-200 text-center">
                        <button type="button" onClick={addEntry}
                          className="text-emerald-600 hover:text-emerald-800 font-semibold px-1">+ Add</button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="text-[10px] text-slate-400">New entries are auto-inserted in time order.</p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
