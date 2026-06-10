function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export interface GpxDeployStop {
  label: string;
  lng: number;
  lat: number;
}

export function deploymentGpx(
  eventName: string,
  stops: GpxDeployStop[],
  legs: Array<{ coords: [number, number][] }>,
): string {
  const wpts = stops
    .map(
      (s) => `  <wpt lat="${s.lat}" lon="${s.lng}">
    <name>${esc(s.label)}</name>
  </wpt>`,
    )
    .join('\n');

  const allCoords = legs.flatMap((l) => l.coords);
  const trkpts = allCoords
    .map(([lng, lat]) => `      <trkpt lat="${lat}" lon="${lng}" />`)
    .join('\n');

  const rtePoints = stops
    .map((s) => `    <rtept lat="${s.lat}" lon="${s.lng}"><name>${esc(s.label)}</name></rtept>`)
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="aisc-rally-maps" xmlns="http://www.topografix.com/GPX/1/1">
${wpts}
  <rte>
    <name>${esc(eventName)} Deployment Route</name>
${rtePoints}
  </rte>
  <trk>
    <name>${esc(eventName)} Deployment Route</name>
    <trkseg>
${trkpts}
    </trkseg>
  </trk>
</gpx>`;
}
