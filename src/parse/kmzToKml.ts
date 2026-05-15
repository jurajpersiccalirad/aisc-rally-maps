import JSZip from 'jszip';

export interface KmlPayload {
  text: string;
  filename: string;
}

export async function kmzToKml(
  buffer: ArrayBuffer | Uint8Array,
): Promise<KmlPayload> {
  const zip = await JSZip.loadAsync(buffer);
  const entries = Object.values(zip.files).filter(
    (f) => !f.dir && f.name.toLowerCase().endsWith('.kml'),
  );
  if (entries.length === 0) {
    throw new Error('KMZ archive contains no .kml file.');
  }
  const preferred =
    entries.find((f) => f.name.toLowerCase().endsWith('doc.kml')) ?? entries[0];
  const text = await preferred.async('string');
  return { text, filename: preferred.name };
}
