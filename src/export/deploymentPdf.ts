function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export interface PdfLeg {
  idx: number;
  from: string;
  to: string;
  routeLabel: string;
  distanceStr: string;
  durationStr: string;
  fromLatLng: [number, number];
  toLatLng: [number, number];
  routeLatLngs: [number, number][] | null;
  stageLatLngs: [number, number][] | null;
  stageName: string | null;
  stageColor: string | null;
  color: string;
  dashArray: string | null;
  liaisonElevSvg: string | null;
  stageElevSvg: string | null;
}

export interface PdfScheduleRow {
  label: string;
  driveStr: string;
  arriveStr: string;
  warn: boolean;
  waitMinStr: string;
  departStr: string;
}

export interface DeploymentPdfOptions {
  eventName: string;
  eventDate: string;
  departureTime: string;
  closureRole: string;
  closureMinutes: number;
  totalDriveStr: string;
  totalWaitStr: string;
  earliestClosureStr: string | null;
  googleMapsUrl: string;
  waypointCount: number;
  scheduleRows: PdfScheduleRow[];
  legs: PdfLeg[];
}

export function elevSvg(
  points: [number, number][],
  color: string,
  label: string,
  w = 540,
  h = 80,
): string {
  if (points.length < 2) return '';
  const dists = points.map((p) => p[0]);
  const elevs = points.map((p) => p[1]);
  const minD = dists[0];
  const maxD = dists[dists.length - 1];
  const minE = Math.min(...elevs);
  const maxE = Math.max(...elevs);
  const dSpan = Math.max(maxD - minD, 0.001);
  const eSpan = Math.max(maxE - minE, 1);
  const pL = 6, pR = 6, pT = 4, pB = 4;
  const tx = (d: number) => pL + ((d - minD) / dSpan) * (w - pL - pR);
  const ty = (e: number) => (h - pB) - ((e - minE) / eSpan) * (h - pT - pB);

  const pathD = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${tx(p[0]).toFixed(1)},${ty(p[1]).toFixed(1)}`)
    .join(' ');
  const areaD = `${pathD} L${tx(maxD).toFixed(1)},${(h - pB).toFixed(1)} L${tx(minD).toFixed(1)},${(h - pB).toFixed(1)} Z`;

  let gain = 0, loss = 0;
  for (let i = 1; i < elevs.length; i++) {
    const d = elevs[i] - elevs[i - 1];
    if (d > 0) gain += d;
    else loss -= d;
  }

  return `<svg width="${w}" height="${h + 16}" viewBox="0 0 ${w} ${h + 16}" xmlns="http://www.w3.org/2000/svg" style="display:block;width:100%">
  <path d="${areaD}" fill="${color}" fill-opacity="0.12"/>
  <path d="${pathD}" stroke="${color}" stroke-width="1.5" fill="none" stroke-linejoin="round" stroke-linecap="round"/>
  <text x="2" y="${h + 13}" font-family="Arial,sans-serif" font-size="8" fill="#64748b">${esc(label)} · +${gain.toFixed(0)} m / −${loss.toFixed(0)} m · ${minE.toFixed(0)}–${maxE.toFixed(0)} m asl · ${maxD.toFixed(1)} km</text>
</svg>`;
}

export function buildDeploymentPrintHtml(opts: DeploymentPdfOptions): string {
  const {
    eventName, eventDate, departureTime, closureRole, closureMinutes,
    totalDriveStr, totalWaitStr, earliestClosureStr, googleMapsUrl,
    waypointCount, scheduleRows, legs,
  } = opts;

  const schedRows = scheduleRows
    .map(
      (row, i) => `<tr${row.warn ? ' class="warn"' : ''}>
    <td>${esc(i === 0 ? `⌂ ${row.label}` : `${i}. ${row.label}`)}</td>
    <td>${esc(row.driveStr)}</td>
    <td>${esc(row.arriveStr)}${row.warn ? ' ⚠' : ''}</td>
    <td>${i === 0 ? '—' : esc(row.waitMinStr)}</td>
    <td><strong>${esc(row.departStr)}</strong></td>
  </tr>`,
    )
    .join('\n');

  const truncWarn =
    waypointCount > 11
      ? `<p class="warn-txt">⚠ Google Maps URL limited to first 11 of ${waypointCount} stops.</p>`
      : '';

  const legPagesHtml = legs
    .map((leg) => {
      const liaisonElev = leg.liaisonElevSvg
        ? `<div class="elev-wrap">${leg.liaisonElevSvg}</div>`
        : '';
      const stageElev = leg.stageElevSvg
        ? `<div class="elev-wrap">${leg.stageElevSvg}</div>`
        : '';
      return `<div class="page leg-page">
  <div class="leg-hdr">
    <h2>Leg ${leg.idx + 1}: ${esc(leg.from)} → ${esc(leg.to)}</h2>
    <p>${esc(leg.routeLabel)} · ${esc(leg.distanceStr)} · ${esc(leg.durationStr)}${leg.stageName ? ` · near stage: ${esc(leg.stageName)}` : ''}</p>
  </div>
  <div class="map-wrap"><div id="map${leg.idx}" class="map-div"></div></div>
  ${liaisonElev}
  ${stageElev}
</div>`;
    })
    .join('\n');

  const legsJson = JSON.stringify(
    legs.map((leg) => ({
      idx: leg.idx,
      from: leg.from,
      to: leg.to,
      fromLatLng: leg.fromLatLng,
      toLatLng: leg.toLatLng,
      routeLatLngs: leg.routeLatLngs,
      stageLatLngs: leg.stageLatLngs,
      stageName: leg.stageName,
      stageColor: leg.stageColor,
      color: leg.color,
      dashArray: leg.dashArray,
    })),
  );

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>${esc(eventName)} — Deployment Plan</title>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" crossorigin=""/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" crossorigin=""><\/script>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Arial,sans-serif;font-size:11pt;color:#1a1a1a}
/* Summary page */
.page{padding:12mm 12mm;page-break-after:always;break-after:page}
.page:last-child{page-break-after:auto;break-after:auto}
h1{font-size:15pt;margin-bottom:6px}h2{font-size:12pt;margin:0 0 4px;color:#1e293b}
p{margin:3px 0;font-size:10pt;color:#475569}
.meta{display:flex;flex-wrap:wrap;gap:14px;margin:6px 0 10px}.meta span{font-size:10pt}.meta strong{color:#1e293b}
a{color:#2563eb;font-size:9pt;word-break:break-all}
.sh{margin:12px 0 4px;font-size:11pt;color:#1e293b;border-bottom:1px solid #cbd5e1;padding-bottom:2px}
table{width:100%;border-collapse:collapse;margin-top:5px}
th{background:#f1f5f9;text-align:left;padding:5px 7px;font-size:10pt;border:1px solid #e2e8f0}
td{padding:4px 7px;font-size:10pt;border:1px solid #e2e8f0}
tr.warn td{background:#fee2e2!important}tr:nth-child(even) td{background:#f8fafc}
.warn-txt{color:#dc2626;font-size:9pt;margin:5px 0}
/* Leg pages */
.leg-page{padding:8mm 10mm;display:flex;flex-direction:column;gap:6px}
.leg-hdr h2{font-size:13pt}
.leg-hdr p{font-size:9pt;color:#64748b;margin:2px 0 0}
.map-wrap{height:180mm;position:relative;flex-shrink:0}
.map-div{height:100%;width:100%;border:1px solid #e2e8f0;border-radius:3px}
.elev-wrap{flex-shrink:0;border:1px solid #e2e8f0;border-radius:3px;padding:4px 8px;background:#fafafa}
/* Print bar */
#printBar{position:fixed;top:10px;right:12px;background:#1e293b;color:#fff;border-radius:8px;padding:8px 14px;display:flex;align-items:center;gap:10px;z-index:9999;box-shadow:0 4px 16px rgba(0,0,0,.3);font-family:Arial,sans-serif;font-size:12px}
#printBar button{background:#3b82f6;color:#fff;border:none;border-radius:4px;padding:6px 14px;font-size:12px;cursor:pointer;font-weight:600}
#printBar button:hover{background:#2563eb}
@media print{
  #printBar{display:none!important}
  @page{margin:8mm;size:A4 portrait}
  .page{padding:6mm 8mm}
  /* Each leg page fills one A4 page; map expands to fill remaining height */
  .leg-page{
    height:281mm; /* 297 - 2×8mm @page margins */
    padding:6mm 8mm;
    overflow:hidden;
  }
  .map-wrap{flex:1;min-height:0;height:auto}
}
</style>
</head>
<body>
<div id="printBar">
  <span id="tileStatus">Loading maps…</span>
  <button onclick="window.print()">Print / Save PDF</button>
</div>

<div class="page">
  <h1>${esc(eventName)} — Deployment Plan</h1>
  <div class="meta">
    <span><strong>Date:</strong> ${esc(eventDate)}</span>
    <span><strong>Depart:</strong> ${esc(departureTime)}</span>
    <span><strong>Role:</strong> ${esc(closureRole)}</span>
    <span><strong>Closure:</strong> −${closureMinutes}&nbsp;min</span>
    <span><strong>Drive time:</strong> ${esc(totalDriveStr)}</span>
    <span><strong>Waiting:</strong> ${esc(totalWaitStr)}</span>
  </div>
  ${googleMapsUrl ? `<h2 class="sh">Navigation link</h2>${truncWarn}<p><a href="${esc(googleMapsUrl)}">${esc(googleMapsUrl)}</a></p>` : ''}
  <h2 class="sh">Time schedule</h2>
  <table>
    <thead><tr><th>Stop</th><th>Drive</th><th>Arrive</th><th>Wait (min)</th><th>Depart</th></tr></thead>
    <tbody>${schedRows}</tbody>
  </table>
  ${earliestClosureStr ? `<p class="warn-txt">Stage road closes at <strong>${esc(earliestClosureStr)}</strong> (${esc(closureRole)} window). Red rows arrive after closure.</p>` : ''}
</div>

${legPagesHtml}

<script>
(function(){
  var data=${legsJson};
  var n=data.length,done=[],maps=[];
  if(n===0){document.getElementById('tileStatus').textContent='No route data';return;}
  function onReady(i){
    if(done[i])return;done[i]=true;
    var c=done.filter(Boolean).length;
    document.getElementById('tileStatus').textContent=c>=n?'Maps ready — safe to print':'Loading maps… '+c+'/'+n;
  }
  // Re-fit all maps before the browser renders the print layout
  window.addEventListener('beforeprint',function(){
    maps.forEach(function(m){
      m.invalidateSize();
      var b=m._bounds;
      if(b)m.fitBounds(b,{padding:[20,20]});
    });
    // Second pass after layout has settled
    setTimeout(function(){maps.forEach(function(m){m.invalidateSize();});},80);
  });
  data.forEach(function(leg,i){
    var el=document.getElementById('map'+leg.idx);
    if(!el){onReady(i);return;}
    var map=L.map(el,{zoomControl:true,attributionControl:true});
    var tl=L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
      attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      crossOrigin:'anonymous'
    }).addTo(map);
    var b=[];
    if(leg.routeLatLngs&&leg.routeLatLngs.length>1){
      var s={color:leg.color,weight:4,opacity:0.9};
      if(leg.dashArray)s.dashArray=leg.dashArray;
      L.polyline(leg.routeLatLngs,s).addTo(map);
      b=b.concat(leg.routeLatLngs);
    }
    if(leg.stageLatLngs&&leg.stageLatLngs.length>1){
      L.polyline(leg.stageLatLngs,{color:leg.stageColor||'#e11d48',weight:5,opacity:0.65,dashArray:'8 4'})
        .bindTooltip(leg.stageName||'Stage').addTo(map);
    }
    var mk=function(t,bg){
      return L.divIcon({
        html:'<div style="background:'+bg+';color:#fff;border-radius:50%;width:22px;height:22px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)">'+t+'</div>',
        className:'',iconSize:[22,22],iconAnchor:[11,11]
      });
    };
    L.marker(leg.fromLatLng,{icon:mk('⌂','#1e293b')}).bindTooltip(leg.from).addTo(map);
    L.marker(leg.toLatLng,{icon:mk(String(leg.idx+1),'#1e293b')}).bindTooltip(leg.to).addTo(map);
    b.push(leg.fromLatLng,leg.toLatLng);
    var bounds=L.latLngBounds(b);
    map.fitBounds(bounds,{padding:[25,25]});
    map._bounds=bounds; // stash for beforeprint re-fit
    maps.push(map);
    tl.on('load',function(){onReady(i);});
    tl.on('tileerror',function(){onReady(i);});
  });
})();
<\/script>
</body>
</html>`;
}
