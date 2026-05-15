import { describe, expect, it } from 'vitest';
import { startEndPointsTxt } from '../../src/export/startEndPointsTxt';

describe('startEndPointsTxt', () => {
  it('matches the reference Severn format exactly', () => {
    const txt = startEndPointsTxt([
      {
        exportName: 'SS1-5',
        start: [-3.4055093, 52.3358666],
        end: [-3.4381498, 52.3507264],
      },
      {
        exportName: 'SS7',
        start: [-3.7557612, 52.3937709],
        end: [-3.6466601, 52.4049119],
      },
    ]);
    expect(txt).toBe(
      'File: SS1-5.gpx\n  Start: -3.4055093, 52.3358666\n  End: -3.4381498, 52.3507264\n\nFile: SS7.gpx\n  Start: -3.7557612, 52.3937709\n  End: -3.6466601, 52.4049119\n\n',
    );
  });

  it('empty input → empty string', () => {
    expect(startEndPointsTxt([])).toBe('');
  });
});
