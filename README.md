# AISC Rally Maps

Browser-based converter and submission tool: turn rally organiser KMZ / KML / GPX files into the Calirad AISC format, with an interactive map, manual editing, validated export, and (Amplify-hosted) login + admin review workflow.

```
KMZ / KML / GPX  ─►  parse + classify + crop + buffer  ─►  AISC ZIP
                          │
                          └─► "Send for publishing" → admin review → published
```

## Quickstart (local)

```bash
nvm use         # Node 20+
npm install
npm run dev     # http://localhost:5173
```

Drop a `.kmz` / `.kml` / `.gpx` file onto the page. Two reference KMZ fixtures live at
`tests/fixtures/severn-2026.kmz` and `tests/fixtures/sierra-morena-2026.kmz`.

`npm run build && npm run preview` serves the production bundle.

## What it does

- Parses KMZ / KML (with `<Folder>` hierarchy + `<Style>` colours preserved) and GPX
- Classifies points by name / description / styleUrl into Start / Finish / Flying Finish / Stop / ATC / PC / SSS / Intermediate / Radio / Ambulance / Refuel / Scrutineering / Other (English, Spanish, Czech keyword sets)
- Builds **stages from one or more tracks** (e.g. joining the two Severn `SS7` tracks into a single stage with auto-orient)
- Per-stage **reverse, crop sliders, click-on-map crop, draggable start/end markers**
- 30 m default **buffer with self-intersection repair** (polygon-clipping union → shapely `buffer(0)` analogue)
- **Inter-stage overlap detection** with informational warnings (overlaps are legitimate when stages share road)
- **Show/hide visibility** + click-to-centre on any track / stage / point
- **AISC ZIP export** — `start_end_points.txt`, per-stage `.wkt` / `-gj.wkt` / `.geojson` / `.gpx`, plus combined `<event>.wkt` (`polygonClipping.union` over every stage's repaired buffer → one topologically valid MultiPolygon shapely won't choke on), plus `summary.csv` and the project JSON for resumability
- **Save / Load project JSON** — `.aiscproj.json` round-trips the full editing state

## Tech stack

| Concern | Library |
| --- | --- |
| Build | Vite 5 + React 18 + TypeScript (strict) + Tailwind 3 |
| Map | Leaflet + react-leaflet + OSM tiles |
| Parse | JSZip (KMZ unzip), DOMParser (KML/GPX) |
| Geometry | @turf/turf (length, buffer, slice, along, bearing, nearest-on-line), polygon-clipping (union / intersection) |
| Export | JSZip + file-saver |
| State | React + useReducer + Zustand (auth) |
| Backend (C10+) | AWS Amplify Gen 2 — Cognito user pools + AppSync GraphQL + DynamoDB + S3 |
| Tests | Vitest |

## Architecture

```
┌───────────────────────────────────────────────────────────┐
│  Browser (Vite SPA, no server during editing)             │
│                                                           │
│  Drop file → parse/ → ProjectState (reducer)              │
│                       │                                   │
│        ┌──────────────┴───────────────┐                   │
│        ▼                              ▼                   │
│   sidebar (TrackList, StageCard,   MapView (Leaflet)      │
│   PointList, EventNameInput)       — joined polylines,    │
│                                      direction arrows,    │
│                                      buffer overlays,     │
│                                      drag/click crop      │
│        │                              │                   │
│        └──────────────┬───────────────┘                   │
│                       ▼                                   │
│  buildZip ── turf.buffer + polygonClipping.union          │
│              + WKT/GeoJSON/GPX/CSV/JSON writers           │
│                                                           │
└────────────┬─────────────────────────┬────────────────────┘
             │ download ZIP            │ Send for publishing
             ▼                         ▼
       local file                  AWS Amplify backend
                                   (S3 + DynamoDB)
                                          │
                                          ▼
                                   Admin review queue
                                   (web-dashboard role)
```

## Deploy to AWS Amplify Hosting

The repo is configured for Amplify Gen 2 (backend) + Amplify Hosting (frontend).

### Frontend-only deploy (no auth)

1. Push this repo to GitHub.
2. In the Amplify Console, **Host web app** → connect the repo → accept the auto-detected build settings (Amplify reads `amplify.yml`).
3. Under **App settings → Rewrites and redirects**, add an SPA fallback so deep links don't 404:

   ```
   Source:  </^[^.]+$|\.(?!(css|gif|ico|jpg|js|png|txt|svg|woff|woff2|ttf|map|json|webp)$)([^.]+$)/>
   Target:  /index.html
   Type:    200 (Rewrite)
   ```

4. Push to `main` → first build runs `typecheck → lint → test → build` and deploys.

### Full-stack deploy (auth + admin + publish)

Once the Amplify Gen 2 backend lands (C10+):

```bash
# Locally — develop against a per-developer sandbox
npx ampx sandbox          # deploys an isolated stack + writes amplify_outputs.json
npm run dev               # frontend connects to the sandbox

# Production — Amplify Console runs both phases of amplify.yml on push
git push origin main
```

Initial setup once per AWS account:

1. `aws configure sso` (or set up SSO/credentials)
2. `npx ampx sandbox` in this directory to provision a dev backend
3. Run the seed script to create the initial admin user:
   ```bash
   npm run seed:admin      # creates user "Andrej" in ADMIN group; prints temp password
   ```
4. Sign in at the deployed URL with `andrej@…` + the printed temp password; Cognito will force a password change on first login.

## Browser support

Modern Chromium / Firefox / Safari. Requires File API, DOMParser, ES2022. No IE.

## Known limits

- Browser memory caps the input file size at roughly 200 MB
- Turf's buffer drifts from shapely + pyproj by ≤ 1 × 10⁻⁵° (acceptable for AISC zones; combined polygon validity is preserved by polygon-clipping union)
- Multi-segment GPX `<trk>` flattens to the concatenated point list
- Project JSON does **not** embed the source KMZ — keep the original file alongside

## Roadmap

- **C10** Amplify Gen 2 backend (Cognito groups, AppSync schema, S3) ✓
- **C11** Login UI + Zustand auth store + role-gated routes ✓
- **C12** Send-for-publishing + admin event/user panels + Andrej seed ✓
- **C13** Admin file inspection — inline preview of stages/tracks/points from project JSON ✓
- **C14** User auto-save — debounced `localStorage` save + restore banner on next open ✓
- **C15** User event dashboard — "My Events" panel with status badges and downloadable approved ZIP ✓
- **C16** Reject reason visible to users — rejection note shown on the user dashboard ✓
- **C17** Admin event search & filter — text search + per-status toggle pills ✓
- **C18** Bulk approve/reject — checkboxes + "Select all SUBMITTED" + batch actions ✓
- **C19** Audit log — per-event timeline of status changes with actor and timestamp ✓
- **C20** Version history browser — "Group by name" view shows all versions of each event ✓
- **C21** In-app diff — Compare two events: stage table with added/removed/buffer/crop changes ✓
- **C22** Email notifications — Lambda + SES wired; requires SES verified sender address to activate
- **C23** S3 lifecycle — user-submitted ZIPs auto-expire after 180 days ✓
- **C24** Export settings persistence — numeric/string export options saved to `localStorage` ✓
- **C25** Mandatory point validation — Start, Finish, and Stop Control required per stage; missing
  points block export and trigger a "pick on map" assignment mode
- **C26** SSS category removed — SSS keywords mapped to Start; eliminates ambiguity between
  Super Special Stage starts and regular starts; existing projects migrated on load
- **C27** In-app feedback — users submit bug reports / feature requests from within the app;
  stored in DynamoDB; visible in admin panel and pullable locally for roadmap planning
- **C28** Deployment planner — logistics route planner for stop-control delivery runs:
  - Origin point (service park / rally control) + ordered visit sequence builder
  - Stage schedule input + tunable road-closure windows (public T−2h, org T−1h, safety T−30min)
  - Two routes per leg via OSRM: Route A (via stage, time-gated) and Route B (avoids stage corridor)
  - Timeline view with departure windows colour-coded green/amber/red
  - Exportable trip sheet (CSV/PDF)

## License

Internal / Calirad.
