function esc(s: string) {
  return s.replace(/'/g, "''");
}

export function eventSql(
  id: number,
  name: string,
  startDt: string,
  endDt: string,
  unitSystem: 'imperial' | 'metric',
): string {
  return (
    'INSERT INTO aicam.event (id, name, start_date_time, end_date_time, unit_system) VALUES\n' +
    `  (${id}, '${esc(name)}', '${startDt}', '${endDt}', '${unitSystem}');\n`
  );
}
