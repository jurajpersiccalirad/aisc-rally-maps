function esc(s: string) {
  return s.replace(/'/g, "''");
}

export interface DeviceRow {
  serialNumber: string;
  name: string;
}

export function deviceSql(
  rows: DeviceRow[],
  startingId: number,
  eventId: number,
): string {
  if (rows.length === 0) return '-- no devices selected\n';
  const valueLines = rows.map(
    (r, i) =>
      `  (${startingId + i}, '${esc(r.serialNumber)}', '${esc(r.name)}', ${eventId})`,
  );
  return (
    'INSERT INTO aicam.device (id, serial_number, name, event_id) VALUES\n' +
    valueLines.join(',\n') +
    ';\n'
  );
}
