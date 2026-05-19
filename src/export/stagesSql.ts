import type { LngLatAlt } from '../types';

export interface StageTableRow {
  name: string;
  lengthM: number;
  start: LngLatAlt;
  end: LngLatAlt;
}

function esc(s: string): string {
  return s.replace(/'/g, "''");
}

export function stagesSql(
  rows: StageTableRow[],
  startingId: number,
  eventId: number,
): string {
  if (rows.length === 0) return '-- no stages\n';

  const valueLines = rows.map((r, i) => {
    const id = startingId + i;
    return `  (${id}, '${esc(r.name)}', ${r.lengthM}, ${eventId}, ${r.start[0]}, ${r.start[1]}, ${r.end[0]}, ${r.end[1]})`;
  });

  return (
    'INSERT INTO aicam.stage (id, name, length, event_id, longitude_start, latitude_start, longitude_end, latitude_end) VALUES\n' +
    valueLines.join(',\n') +
    ';\n'
  );
}
