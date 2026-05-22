import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { readUploadedBytes } from '../../src/parse/readUploadedFile';

function loadFixture(relativePath: string): {
  bytes: Uint8Array;
  filename: string;
} {
  const path = fileURLToPath(new URL(relativePath, import.meta.url));
  const buf = readFileSync(path);
  const bytes = new Uint8Array(buf.byteLength);
  bytes.set(buf);
  return { bytes, filename: basename(path) };
}

describe('readUploadedBytes — Severn Valley 2026 KMZ', () => {
  it('parses six special-stage tracks and several points', async () => {
    const { bytes, filename } = loadFixture('../fixtures/severn-2026.kmz');
    const result = await readUploadedBytes(bytes, filename, 'kmz');

    expect(result.sourceFile.kind).toBe('kmz');
    expect(result.suggestedEventName.toLowerCase()).toContain('severn');

    // Severn 2026 has 6 SS LineStrings (SS1/5, SS2/6, SS3, SS4, SS7, SS7).
    expect(result.tracks.length).toBe(6);
    for (const t of result.tracks) {
      expect(t.coords.length).toBeGreaterThan(10);
      expect(t.lengthKm).toBeGreaterThan(0);
    }

    // Each track sits in an SS-named folder.
    const ssTracks = result.tracks.filter((t) =>
      t.folderPath.some((seg) => /SS/i.test(seg)),
    );
    expect(ssTracks.length).toBe(6);

    const trackNames = result.tracks.map((t) => t.name);
    for (const expected of ['SS1/5', 'SS2/6', 'SS7']) {
      expect(trackNames).toContain(expected);
    }

    // Should have stage start/stop/finish markers plus other points.
    expect(result.points.length).toBeGreaterThan(10);

    // Point classification works on Severn-style English names.
    const cats = new Map<string, number>();
    for (const p of result.points) {
      cats.set(p.category, (cats.get(p.category) ?? 0) + 1);
    }
    expect(cats.get('start') ?? 0).toBeGreaterThanOrEqual(1);
    expect(cats.get('stop') ?? 0).toBeGreaterThanOrEqual(1);
    expect(cats.get('atc') ?? 0).toBeGreaterThanOrEqual(1);
    expect(cats.get('finish') ?? 0).toBeGreaterThanOrEqual(1);
    expect(cats.get('pc') ?? 0).toBeGreaterThanOrEqual(1);
  });
});

describe('readUploadedBytes — Sierra Morena 2026 KMZ', () => {
  it('classifies SALIDA→start, META→finish, INT.x→intermediate via <description>', async () => {
    const { bytes, filename } = loadFixture(
      '../fixtures/sierra-morena-2026.kmz',
    );
    const result = await readUploadedBytes(bytes, filename, 'kmz');

    expect(result.sourceFile.kind).toBe('kmz');
    // Traffic-cut points whose payload lives in <description>.
    expect(result.points.length).toBeGreaterThan(20);

    const cats = new Map<string, number>();
    for (const p of result.points) {
      cats.set(p.category, (cats.get(p.category) ?? 0) + 1);
    }
    expect(cats.get('start') ?? 0).toBeGreaterThan(0);
    expect(cats.get('finish') ?? 0).toBeGreaterThan(0);
    expect(cats.get('intermediate') ?? 0).toBeGreaterThan(0);
  });
});
