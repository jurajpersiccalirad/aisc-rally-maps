function esc(s: string) {
  return s.replace(/'/g, "''");
}

export type CredRole = 'VIEWER' | 'ADMIN' | 'SO';

export interface CredentialSqlRow {
  username: string;
  hashedPassword: string;
  role: CredRole;
  eventId: number | null;
}

export function credentialsSql(
  rows: CredentialSqlRow[],
  startingId: number,
): string {
  if (rows.length === 0) return '-- no credentials\n';
  const valueLines = rows.map((r, i) => {
    const eid = r.eventId === null ? 'NULL' : r.eventId;
    return `  (${startingId + i}, '${esc(r.username)}', '${esc(r.hashedPassword)}', '${r.role}', ${eid})`;
  });
  return (
    'INSERT INTO aicam.credentials (id, username, password, role, event_id) VALUES\n' +
    valueLines.join(',\n') +
    ';\n'
  );
}
