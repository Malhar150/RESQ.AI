# RESQ.AI — backend

Citizen hazard reports flowing **up** to a government control room. Built for
SIH 2026, Problem Statement 206.

This folder holds the Express API, the Supabase wiring, the classifier, the
misinformation checks, and a working operations console you can demo on its own.

---

## Run it locally

You need Node 18 or newer. Check with `node -v`.

```bash
npm install
cp .env.example .env      # Windows: copy .env.example .env
```

Open `.env` and fill in `SUPABASE_URL` and `SUPABASE_ANON_KEY`. If you already
had a working `.env`, keep it — just copy the new keys across from
`.env.example`.

```bash
npm run dev
```

You should see something like:

```
  RESQ.AI backend listening on port 4000
  Console      http://localhost:4000/
  Health       http://localhost:4000/health

  Classifier   rule engine (no API key set)
  Photo checks on
  Admin key    NOT SET — write routes are open
```

Open <http://localhost:4000/> and you get the duty desk: the live feed on the
left, the map and assessment panel on the right, and a **File a report** tab
that submits through the real API. That's the whole loop working end to end
without touching the React app at all — useful when you want to demo the backend
by itself.

---

## Set up the database (do this once)

The upgrade adds columns the new features need. Open your Supabase project →
**SQL Editor** → **New query**, paste in the whole of `sql/001_upgrade.sql`, and
run it. Restart the backend and it should now print:

```
[schema] Upgraded schema detected. All features on.
```

If you skip this step nothing breaks — the server notices the columns are
missing and quietly drops the fields it can't store. You just won't get hazard
types, trust scores, or duplicate-photo detection.

---

## Deploy it so the Netlify frontend can reach it

This is the part that blocks everything else. Your frontend is on Netlify, on
the public internet. `http://localhost:4000` only exists on your laptop, so a
visitor's browser has no way to reach it. The backend has to be hosted too.

Push this folder to GitHub, then go to [render.com](https://render.com) →
**New** → **Web Service** → pick the repo, and set:

```
Build command:  npm install
Start command:  npm start
```

Then add the environment variables, which are the same ones as your `.env`:
`SUPABASE_URL`, `SUPABASE_ANON_KEY`, a long random `ADMIN_KEY`, and
`CORS_ORIGINS` set to your Netlify address with no trailing slash —
`https://helpful-alfajores-19dd37.netlify.app`.

Render gives you a URL like `https://resq-ai-backend.onrender.com`. Check it
with `/health` in a browser. That URL is what the frontend should call.

Two things worth knowing about the free tier. It sleeps after 15 minutes of no
traffic, and the first request afterwards takes 30–50 seconds to wake it. Before
your demo, load the site once to warm it up. Also, `render.yaml` in this folder
lets you skip the manual form: **New** → **Blueprint** → pick the repo, and it
reads the config from the file.

---

## Connect the React frontend

Copy `frontend/resq-api.js` into your React project's `src/` folder. It's a
plain module with no dependencies. Set one environment variable in Netlify —
**Site settings** → **Environment variables**:

```
VITE_RESQ_API = https://your-app.onrender.com
```

(Use `REACT_APP_RESQ_API` instead if the app was made with Create React App
rather than Vite. The module checks for both.)

Then replace the fake local state. Where your report form currently pushes into
an array, call `submitReport` instead; where the dashboard reads that array,
call `fetchReports`. `frontend/INTEGRATION.md` has the before-and-after for each
of the four places that need changing.

---

## What each endpoint does

`GET /health` reports which optional features actually came up — whether the AI
classifier has a key, whether photo hashing loaded, whether the schema upgrade
has been run. Check this first whenever something behaves unexpectedly.

`POST /reports` takes a citizen submission: `description`, `latitude`,
`longitude`, and optionally `photo_url`, `source` (`online` or `mesh`), and
`client_id`. It classifies the text, fingerprints the photo, scores how much the
report should be trusted, and returns the saved row plus an `analysis` object
explaining the decision. That `analysis` is what the intake screen shows back to
the reporter.

`POST /reports/sync` takes `{ reports: [...] }` — up to a hundred at once. This
is the offline path: a phone that carried reports hop-by-hop over Bluetooth
finally gets signal and pushes its whole queue. Because each entry carries a
`client_id` generated on the originating device, sending the same queue twice is
harmless; the second attempt reports them as skipped.

`GET /reports` is the dashboard feed. It accepts `severity`, `status`, `source`,
`hazard_type`, `q` for a text search, `since` for a timestamp, and `limit`.
Comma-separate values to match several: `?severity=high,medium`.

`GET /reports/:id` fetches one. `PATCH /reports/:id` changes `status`,
`severity`, or `hazard_type` — this is the Verify button. `DELETE /reports/:id`
removes spam. Both of those need the admin key in an `x-admin-key` header.

`GET /stats` returns the original four counters plus severity, status, source
and hazard breakdowns, trust bands, and an hourly arrival curve for the last
24 hours.

---

## How severity is decided

Two engines produce the same shape of answer.

Without an API key, a weighted multilingual lexicon runs. It scores the text
against three tiers of vocabulary in English, Hindi, Assamese, Bengali and
romanised typing, adds weight for explicit headcounts, and subtracts weight for
phrases that mean the danger has passed. Unlike the original keyword matcher it
doesn't stop at the first hit, so "water is rising and my neighbour is trapped"
correctly reads as high rather than medium. This costs nothing, needs no
network, and can't fail — which makes it the right thing to demo on venue wifi.

With `GEMINI_API_KEY` set (free from [Google AI Studio](https://aistudio.google.com/apikey),
and the easiest of the three), the report goes to a real model with a triage
prompt written for an Indian state control room. `OPENAI_API_KEY` and
`ANTHROPIC_API_KEY` work too. The AI gets six seconds; if it's slow, down, or
returns something unparseable, the rule engine's answer is used instead and the
reason is logged. And if the rule engine is strongly confident a report is
life-threatening while the AI disagrees, the higher severity wins — under-triage
is the failure that actually hurts someone.

Every report records which engine classified it, in `ai_model`, so you can point
at it during judging.

---

## How misinformation is caught

The recurring problem in a real flood is that a dramatic photo from a previous
disaster gets reposted as breaking news. A checksum won't catch it, because
resizing or recompressing changes every byte.

So each photo gets a perceptual hash: shrink it to 9×8 greyscale, record whether
each pixel is brighter than its right-hand neighbour, and store the resulting 64
bits as 16 hex characters. A resized, recompressed or lightly cropped copy of
the same picture produces a nearly identical hash. Two reports whose hashes
differ by fewer than `PHASH_THRESHOLD` bits are showing the same image, and the
newer one gets flagged with a link to the earlier report.

That's one signal among several. A trust score from 0 to 100 also weighs whether
other people nearby reported the same thing in the last six hours (which raises
it a lot), whether the coordinates land inside India, whether one device is
firing off reports in a burst, and whether the text is too thin or looks like a
test entry. Nothing is ever blocked — the score and the individual signals are
shown to the duty officer, who decides. You can see the full breakdown in the
console's assessment panel, which is a good thing to click through during a
demo.

Photo hashing needs the optional `jimp` package. `npm install` picks it up
automatically; if it fails to build, the server still runs and just turns that
check off.

---

## Security, honestly

`ADMIN_KEY` guards verify, dismiss and delete. Submitting a report stays open,
because citizens can't be asked to log in mid-flood; that route is protected by
rate limiting instead, currently 20 per minute per device.

Row Level Security on the Supabase table is still wide open, which is fine for a
hackathon and not fine for anything real. `sql/001_upgrade.sql` ends with a
commented-out block that keeps inserts and reads open while blocking updates and
deletes from the browser. Uncomment it when you're ready.

Keep `.env` out of git. It already is, via `.gitignore`.

---

## Testing it

With the server running in one terminal:

```bash
npm run smoke
```

That exercises every route against your real Supabase project — validation,
classification in English and Hindi, mesh sync, replay protection, filters,
verify — then deletes everything it created. Each line says what it checked and,
when something fails, what to look at. Point it at your deployed instance with
`BASE=https://your-app.onrender.com npm run smoke`.

---

## Layout

`server.js` sets up Express, CORS and the routes, then starts listening.
`lib/` holds the pieces with actual logic: `classify.js` for severity,
`imageHash.js` for perceptual hashing, `trust.js` for scoring, `supabase.js` for
the database connection and schema detection. `routes/` has the HTTP handlers,
`middleware/` has auth and rate limiting, `public/index.html` is the console,
`sql/` has the migration, `scripts/` has the smoke test, and `frontend/` has the
client module to drop into the React app.

---

## When something goes wrong

A CORS error in the browser console means `CORS_ORIGINS` doesn't include the
site making the request. Add it, no trailing slash, and redeploy.

A 401 on verify means the admin key is missing or wrong. In the console, add it
under the ⚙ icon; it's stored in your browser only.

`[schema] Basic schema` at startup means `sql/001_upgrade.sql` hasn't been run
yet.

The first request to a Render free instance taking 40 seconds is the service
waking up, not a bug.

If reports save but the dashboard stays empty, check `GET /reports` directly in
a browser — that tells you whether the problem is the API or the frontend.

---

## New frontend (`web/`)

The new citizen app and control room live in `web/`. See `web/README.md` for full setup, configuration, deployment and how the offline relay works. The short version:

```bash
# terminal 1 — backend (loads .env before the Supabase client is created)
node --import dotenv/config server.js

# terminal 2 — frontend
cd web && npm install && cp .env.example .env.local && npm run dev
```

Citizen app: <http://localhost:5173>. Control room: <http://localhost:5173/control>.

`public/index.html` (the old duty desk) is still served at the backend's root and is untouched until the new frontend is signed off.
