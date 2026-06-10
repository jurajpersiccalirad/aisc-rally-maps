function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function hexToKmlColor(hex: string): string {
  const r = hex.slice(1, 3);
  const g = hex.slice(3, 5);
  const b = hex.slice(5, 7);
  return `ff${b}${g}${r}`.toLowerCase();
}

export interface KmlStop {
  idx: number;
  label: string;
  lng: number;
  lat: number;
}

export interface KmlLeg {
  fromLabel: string;
  toLabel: string;
  coords: [number, number][];
  color: string;
}

export function deploymentKml(eventName: string, stops: KmlStop[], legs: KmlLeg[]): string {
  const placemarks = stops
    .map(
      (s) => `    <Placemark>
      <name>${esc(s.idx === 0 ? `⌂ ${s.label}` : `${s.idx}. ${s.label}`)}</name>
      <Point><coordinates>${s.lng},${s.lat},0</coordinates></Point>
    </Placemark>`,
    )
    .join('\n');

  const routes = legs
    .map(
      (leg, i) => `    <Placemark>
      <name>${esc(`Leg ${i + 1}: ${leg.fromLabel} → ${leg.toLabel}`)}</name>
      <Style>
        <LineStyle><color>${hexToKmlColor(leg.color)}</color><width>4</width></LineStyle>
      </Style>
      <LineString>
        <tessellate>1</tessellate>
        <coordinates>${leg.coords.map(([lng, lat]) => `${lng},${lat},0`).join(' ')}</coordinates>
      </LineString>
    </Placemark>`,
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${esc(eventName)} — Deployment Plan</name>
    <Folder>
      <name>Stops</name>
${placemarks}
    </Folder>
    <Folder>
      <name>Route</name>
${routes}
    </Folder>
  </Document>
</kml>`;
}
