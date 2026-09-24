# RESQ.AI Backend — Setup Notes for Claude Code

## What this is
This is the backend (server) for RESQ.AI, a citizen-to-government disaster
reporting platform built for Smart India Hackathon 2026 (Problem Statement
SIH26206, Disaster Management). It flips NDMA's SACHET model — instead of
government pushing alerts to citizens, citizens push verified hazard reports
UP to government, in real time, even when the internet is down (via offline
Bluetooth mesh relay — not part of this backend yet, frontend-side feature).

## What's already built
- `server.js` — an Express server with these routes:
  - `POST /reports` — citizen submits a hazard report (text, lat/lng, optional
    photo). A simple rule-based function auto-classifies severity
    (high/medium/low) based on keywords. This is a placeholder for a real
    NLP model later.
  - `GET /reports` — fetch all reports (for the dashboard/map)
  - `GET /reports/:id` — fetch one report
  - `PATCH /reports/:id` — update a report's status/severity (e.g. a
    "verify" button on the dashboard)
  - `GET /stats` — counts for dashboard widgets (total reports, verified
    count, reports that arrived via mesh, high-severity count)
- `.env` — already filled in with a working Supabase project's URL and
  publishable API key (the project is called `resq-ai` on Supabase, owned by
  the team). Do NOT commit this file or share the key publicly beyond the
  team — even though it's a "publishable" key meant for browser use, keep it
  out of public repos as good practice.
- Database: Supabase (Postgres) — table `reports` already created with
  columns: id, created_at, description, photo_url, latitude, longitude,
  severity, status, source. It already has 15 seeded sample reports (fake
  flood/cyclone/landslide data across Assam and nearby states) so the
  dashboard won't look empty during a demo.

## What's NOT built yet (this is where help is needed)
1. **Frontend is NOT in this folder.** The frontend is a separate React web
   app (deployed here for reference: https://helpful-alfajores-19dd37.netlify.app/).
   It currently has a working UI (report form, dashboard, map, stats
   counters, an online/offline toggle, and a *simulated* Bluetooth mesh relay
   animation) but the frontend does NOT yet call this backend — it's using
   local/fake state. Someone needs to wire the frontend's report form to
   `POST /reports` and the dashboard to `GET /reports` + `GET /stats`.
2. **Real AI/NLP severity classification** — currently just a rule-based
   keyword matcher in `classifySeverity()` inside server.js. Ideally replace
   with a real multilingual NLP model or an LLM API call.
3. **Misinformation / recycled-photo detection** — not implemented at all
   yet. Planned approach: perceptual image hashing (pHash) to catch reused
   flood photos being reposted as "breaking news."
4. **Bluetooth mesh relay** — this is a mobile/native-device feature (BLE),
   not something this Node backend handles directly. Currently only
   simulated visually on the frontend. The backend's `source` field
   (`online` vs `mesh`) is ready to receive real mesh-relayed reports once
   that mobile piece exists — right now it's just a label.
5. **Auth / RLS security** — Row Level Security on the Supabase table is
   currently wide open (insert + select for everyone) for hackathon-speed
   demo purposes. Not production-secure. Fine for now.

## How to run this backend
```bash
npm install
npm run dev
```
Should print: `RESQ.AI backend listening on port 4000`

Test it:
```bash
curl http://localhost:4000/reports
```
Should return JSON with the 15 seeded reports.

## Team context
- Team name: RESQ.AI, built for SIH 2026, Problem Statement 206.
- 5-person presenting team; app/website prototype is the current focus
  (the PPT/pitch round is already over).
- Frontend-first approach: web app now, may generate a mobile app version
  later.
- Team member is new to backend/Supabase — please explain steps clearly
  and avoid assuming prior backend experience when suggesting next steps.

## Immediate next task suggestion
The most valuable next step is almost certainly: wire the existing React
frontend (report form + dashboard) to actually call this backend's
`/reports` and `/stats` endpoints instead of using fake local state, so the
whole demo becomes end-to-end real (form submit → database → dashboard
updates live).
