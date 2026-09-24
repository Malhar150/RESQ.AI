# RESQ.AI — web app (new frontend)

This folder is the new frontend. It has two parts:

- The **citizen app** at `/` lets people report a hazard, holds reports on the phone when there's no network, passes them phone to phone by QR code, and tracks each report's status. It's installable as a PWA and opens offline.
- The **control room** at `/control` is the authority dashboard. It has a live priority queue, a map, the assessment and trust breakdown for each report, verify / dispatch / resolve / dismiss actions, severity and hazard corrections, delete, analytics and system health.

It talks to the existing backend in the parent folder exactly as that backend is. Nothing in the backend was changed.

Supported languages are English, हिन्दी, অসমীয়া and বাংলা. Those are the four the backend's classifier understands.

---

## Run it locally

You need Node 18.18 or newer. Check with `node -v`.

**Windows shortcut:** double-click `web\start-windows.bat`. It installs packages on first run, starts the backend in its own window, starts the web app, and opens your browser.

**1. Start the backend** (parent folder) in one terminal:

```bash
cd ..
npm install
node --import dotenv/config server.js
```

> Why not `npm run dev`? In the current `server.js`, ES-module imports run
> before `dotenv.config()`, so `lib/supabase.js` reads `SUPABASE_URL` before
> `.env` has been loaded. Locally that means every database call fails.
> `--import dotenv/config` loads `.env` first and changes no code. On Render
> the variables come from the dashboard, so the deployed backend isn't
> affected. (Fixing it in `server.js` is a one-line change, but it touches the
> backend, so it's waiting for sign-off.)

**2. Start the web app** in a second terminal:

```bash
cd web
npm install
cp .env.example .env.local        # Windows: copy .env.example .env.local
npm run dev
```

The browser opens <http://localhost:5173> (the citizen app) on its own. Leave both terminals running. Closing one stops that server.

Open <http://localhost:5173> for the citizen app and <http://localhost:5173/control> for the control room.

The control room asks for the backend's `ADMIN_KEY`. If the backend has no key set, it tells you so and lets you in, in demo mode.

### Testing on a phone

Camera (QR relay), GPS and the service worker need **https** (or `localhost`). Plain `http://192.168.x.x` on a phone will load the app, but the phone blocks the camera and location. The easiest way to test on a phone is to deploy (below). Chrome's USB port-forwarding to `localhost:5173` also works.

---

## Mobile

Both parts are built phone-first and tested at 360 px, 375 px and landscape:

- **Citizen app.** One thumb reaches everything. The tabs sit at the bottom. Every tap target is at least 44 px. The Send button stays in reach while scrolling. The bottom bar hides while the keyboard is up. The phone's Back button closes the settings sheet.
- **Control room on a phone.** It works like an app: a one-row header, a swipeable strip of numbers, and a List ⇄ Map switch. Live / Analytics / System tabs sit at the bottom. Filters fold away behind one button. A report opens full-screen, and Back closes it.
- **Install to home screen.** On Android Chrome, Settings shows an "Install the app" button. On iPhone, use Share → Add to Home Screen. The installed app opens full-screen and works offline.

The same files are also packaged as the Android app (next section).

---

## Android app (APK), free

`web/android/` is a Capacitor project that wraps this same web app as an installable Android app. It's the same screens and code, so there's nothing extra to maintain. It costs nothing: there's no Play Store listing, and you share the `.apk` file directly (WhatsApp, Drive, USB).

### Option A: GitHub builds it for you (nothing to install)

1. Push this repo to GitHub.
2. Optional: under **Settings → Secrets and variables → Actions → Variables**, add `RESQ_API_URL` with your deployed backend address. If you skip this, the app asks for the server address the first time it opens.
3. Go to **Actions → Build Android APK → Run workflow**. It takes about 5 minutes.
4. Open the finished run, download **RESQ-AI-apk**, and unzip it to get `RESQ-AI.apk`.

The workflow file is `.github/workflows/android-apk.yml`. It also rebuilds on every push that changes `web/`.

### Option B: build on your laptop

1. Install [Android Studio](https://developer.android.com/studio) (free).
2. Run `npm install` inside `web`.
3. Android Studio → Open → pick `web/android` → **Build → Build App Bundle(s) / APK(s) → Build APK(s)**.

After changing the web code, run `npm run android:sync` (this needs Node 22) before building again.

### Installing and connecting

- **Install.** Open the `.apk` on the phone and allow "Install unknown apps" when Android asks.
- **Connect.** On first launch, tap **Set server address** and enter where the backend runs:
  - **Deployed backend:** the Render URL, e.g. `https://resq-ai-backend.onrender.com`. Add `http://localhost` to `CORS_ORIGINS` on the backend, because that's the app's origin.
  - **Laptop backend on the same Wi-Fi:** `http://<laptop-ip>:4000` (find the IP with `ipconfig`). Local `.env` already has `CORS_ORIGINS=*`. Windows Firewall may ask to allow Node; allow it on private networks.
- **Until connected.** Reports are saved on the phone and sent once a server is reachable.
- **Permissions.** Location, camera (photos and the QR relay) and network are declared in `android/app/src/main/AndroidManifest.xml`. Android asks for location and camera the first time each is used.
- **Signing.** The APK is a debug build, which is fine for demos and sideloading. A Play Store release would need a signing key and the $25 developer account.

---

## Configuration (`web/.env.local`, or Netlify environment variables)

| Variable | What it does |
|---|---|
| `VITE_RESQ_API` | Backend address, no trailing slash. `http://localhost:4000` locally, your Render URL in production. |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_PHOTO_BUCKET` | *Optional.* These turn on real photo storage (see below). |

You can also change the backend address at runtime without a rebuild. Either open the app once with `?api=https://your-backend.onrender.com`, or set it in the citizen app's settings (globe icon). It's remembered in that browser.

### Photos

Without the three optional variables, a photo taken in the app is shrunk and sent as `photo_base64`. The backend fingerprints it for the reused-photo check, but it doesn't store it, so officers can't see it. The app says this to the reporter.

To store photos:

1. Create a **public** bucket in Supabase Storage.
2. Add an insert policy for `anon` on that bucket.
3. Set the three variables above.

Photos then upload straight from the phone and go to the backend as `photo_url`, and the control room shows them.

---

## Deploy the website

A ready-built copy lives in `website-deploy/` in the main project folder. To rebuild it, run `npm run build` in `web`, and the output lands in `web/dist`.

1. **Point it at the backend.** Open `config.js` in the folder and set `apiBase` to your backend address, e.g. `"https://resq-ai-backend.onrender.com"`. It's a plain file, so there's no rebuild; you can change it again any time on the host.
2. **Upload the folder** to any static host (all free):
   - **Netlify:** drag the folder onto <https://app.netlify.com/drop>. `_redirects` and `_headers` are already included.
   - **Vercel:** `npx vercel deploy website-deploy --prod`. `vercel.json` is already included.
   - **Cloudflare Pages / GitHub Pages / any web server:** serve the folder, and send unknown paths to `index.html` so `/control` works on refresh.
3. **Allow the site on the backend.** Add the new site's address (no trailing slash) to `CORS_ORIGINS` on Render. Skip this step if you deploy to the same Netlify site that's already listed there.

The site needs **https** (all the hosts above give you that) for camera, location and install-to-home-screen to work on phones.

---

## Demo inside Claude

`npm run build:demo` makes one self-contained HTML page (`dist-demo/resq-demo.html`). It is published as a Claude Artifact so the app can be shown with no server running.

- **The backend runs inside the page.** `src/demo/server.ts` re-creates the backend's routes. `src/demo/classify.js`, `trust.js` and `imageHash.js` are copies of the backend's own rule classifier, trust scoring and photo fingerprinting, so reports are judged the same way the real server judges them with no AI key.
- **Sample data.** It starts with sample reports from Assam, kept in the viewer's browser. **Reset** puts the samples back.
- **Navigation.** A bar at the top switches between Citizen app and Control room.
- **Real builds are unaffected.** They swap the demo backend for an empty stub (`src/demo/stub.ts`), so none of it ships to real users.

---

## How the offline parts work

**Held on the phone.** If there's no network, a report goes into an outbox in `localStorage`. The app sends it through `POST /reports/sync` when the browser comes back online, and also retries every 30 s. The same happens if the server can't be reached. Each report carries a `client_id` made on the phone that wrote it, so a retry never creates a duplicate.

**Phone to phone (QR hop).** On the Relay screen, one phone shows a held report as a QR code and another phone scans it. The report joins the second phone's outbox as "carried", one hop further along. Whichever phone gets signal first delivers it, and the backend keeps one copy because the `client_id` matches. Photos don't fit in a QR code, so they stay on the phone that took them. This is the honest browser version of the Bluetooth mesh: browsers can't advertise over Bluetooth, and iPhones have no Web Bluetooth at all.

**Demo switch.** Settings → "Pretend there's no network" makes the app behave exactly as if there were no signal. It's handy on stage. So is DevTools → Network → Offline.

**App shell.** A service worker precaches the app, fonts and the QR code, so the citizen app opens with no network at all.

**Map.** OpenStreetMap tiles need internet. If they can't load, the control-room map switches to a coordinate grid with city labels, and every report is still plotted.

---

## Folder layout

```
src/
  lib/api.ts        typed client for every backend route (no mock data anywhere)
  lib/outbox.ts     offline queue + /reports/sync
  lib/qrhop.ts      QR encode/decode for phone-to-phone relay
  lib/mine.ts       "My reports" tracking on the device
  lib/photo.ts      image shrinking + optional Supabase Storage upload
  lib/server.tsx    /health watcher (also wakes a sleeping Render instance)
  i18n/             en, hi, as, bn dictionaries + trust-flag translations
  citizen/          report, result, outbox, relay, my reports, settings
  control/          gate, live queue + map + detail, analytics, system
  styles/           base, citizen (light), control (dark)
```

## Scripts

`npm run dev` starts the dev server, `npm run build` does a type-check and production build to `dist/`, and `npm run preview` serves `dist/` locally with the service worker active.

---

## If localhost doesn't open

- **"This site can't be reached" at localhost:5173** means the web app isn't running. Check the terminal where you ran `npm run dev`. It should say `VITE ... ready` and show `Local: http://localhost:5173/`. Make sure you ran it **inside the `web` folder**. Running `npm run dev` in the parent folder starts the backend on port 4000 instead.
- **`npm run dev` fails straight away**: check `node -v` (you need 18.18+), and run `npm install` inside `web` first.
- **The page opens but says "Server unreachable"**: the backend isn't running, or it isn't on port 4000. Open <http://localhost:4000/health>. It should show `"status":"ok"`.
- **The backend health check works, but reports fail to load**: start the backend with `node --import dotenv/config server.js`, not `npm run dev` (see the note above).
- **Port already in use**: Vite picks the next free port (5174, ...). Use the address it prints.
