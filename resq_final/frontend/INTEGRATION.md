# Wiring the React frontend to this backend

Your frontend already has the screens. What it doesn't have is a connection —
the report form pushes into local state and the dashboard reads it back, so
nothing survives a refresh and nothing is shared between devices. This replaces
that local state with real API calls. It's four changes.

Copy `resq-api.js` and `useResqData.js` into your React project's `src/` folder
first. Neither has dependencies.

---

## Before you start: point it at the backend

In your React project, create `.env.local`:

```
VITE_RESQ_API=http://localhost:4000
```

Use `REACT_APP_RESQ_API` instead if the app was built with Create React App
rather than Vite. Not sure which you have? If `package.json` mentions `vite`,
it's Vite.

On Netlify, set the same variable under **Site settings → Environment
variables**, pointing at your deployed Render URL, then trigger a redeploy.
Environment variables are baked in at build time, so changing one without
redeploying does nothing.

---

## Change 1 — the report form

Find where the form's submit handler adds to state. It probably looks something
like this:

```jsx
function handleSubmit(e) {
  e.preventDefault();
  setReports([...reports, { id: Date.now(), description, latitude, longitude, severity: "medium" }]);
  setDescription("");
}
```

Replace it with:

```jsx
import { submitOrQueue } from "./resq-api";

const [sending, setSending] = useState(false);
const [analysis, setAnalysis] = useState(null);
const [error, setError] = useState(null);

async function handleSubmit(e) {
  e.preventDefault();
  setSending(true);
  setError(null);

  try {
    const result = await submitOrQueue({
      description,
      latitude: Number(latitude),
      longitude: Number(longitude),
      photo_url: photoUrl || null,
      source: isOffline ? "mesh" : "online",
    });

    if (result.queued) {
      setError("No connection. Held on this device — it goes out when you're back online.");
    } else {
      setAnalysis(result.analysis);   // severity, hazard type, trust score, flags
      setDescription("");
    }
  } catch (err) {
    setError(err.message);
  } finally {
    setSending(false);
  }
}
```

Two things worth doing here. Disable the submit button while `sending` is true,
so a slow connection doesn't produce duplicate reports. And render `analysis`
back to the reporter afterwards — it holds the severity the backend assigned,
the hazard type, the trust score, and the individual signals behind it. Showing
that is the moment the AI stops being a claim on a slide and becomes something a
judge can watch happen.

```jsx
{analysis && (
  <div className={`verdict verdict--${analysis.severity}`}>
    <strong>{analysis.severity.toUpperCase()}</strong> · {analysis.hazard_type}
    <p>{analysis.reasoning}</p>
    <p>Trust score {analysis.trust_score} of 100</p>
    {analysis.flags.map((f) => (
      <div key={f.code}>{f.label} — {f.detail}</div>
    ))}
  </div>
)}
```

---

## Change 2 — the dashboard list

Wherever the dashboard reads a local `reports` array, swap in the hook:

```jsx
import { useReports } from "./useResqData";

function Dashboard() {
  const { reports, loading, error, refresh } = useReports({ pollMs: 15000 });

  if (loading) return <p>Loading reports…</p>;
  if (error) return <p>Could not load reports: {error}</p>;

  return reports.map((r) => <ReportCard key={r.id} report={r} onChange={refresh} />);
}
```

Polling every 15 seconds is enough to look live in a demo and is far simpler
than websockets. Each report now carries fields the fake data didn't have:
`hazard_type`, `trust_score`, `trust_band`, `flags`, `language`, `ai_model`,
`ai_confidence`. Surfacing `trust_band` on the card is a cheap way to make the
misinformation work visible.

---

## Change 3 — the stats counters

```jsx
import { useStats } from "./useResqData";

function StatsBar() {
  const { stats } = useStats({ pollMs: 15000 });
  if (!stats) return null;

  return (
    <>
      <Counter label="Reports" value={stats.total} />
      <Counter label="Verified" value={stats.verified} />
      <Counter label="Via mesh" value={stats.viaMesh} />
      <Counter label="High severity" value={stats.openHigh} />
    </>
  );
}
```

The four original keys are unchanged, so if your counters already read `total`,
`verified`, `viaMesh` and `high`, they'll work as-is. `openHigh` is new and
usually the more useful number — it excludes reports that have been resolved or
dismissed, so it goes down as the control room works through them.

---

## Change 4 — the verify button

```jsx
import { setAdminKey, verifyReport, dismissReport } from "./resq-api";

// once, at app startup
setAdminKey(import.meta.env.VITE_RESQ_ADMIN_KEY || "");

async function handleVerify(id) {
  await verifyReport(id);
  refresh();
}
```

A caveat worth being clear about: anything in a React environment variable ends
up in the JavaScript bundle, so a determined person can read it. That's fine for
a hackathon demo. For anything real, the control-room dashboard would need to be
a separate app behind a login rather than the same public site citizens use.

---

## Making the offline toggle real

Your app already has an online/offline switch and a mesh relay animation. Right
now they're decoration. This makes them do something:

```jsx
import { getQueue, flushQueue, autoFlushOnReconnect } from "./resq-api";
import { useOnline } from "./useResqData";

const online = useOnline();                 // tracks the real browser state
const [queued, setQueued] = useState(getQueue());

useEffect(() => autoFlushOnReconnect(() => setQueued(getQueue())), []);

async function relayNow() {
  const res = await flushQueue();
  setQueued(getQueue());
  alert(`${res.accepted} relayed, ${res.skipped} already known`);
}
```

With that in place, `submitOrQueue` holds reports on the device whenever the
network is down and sends the whole batch when it returns — the same shape as a
Bluetooth mesh relay, just using the browser's own connection state. Run your
existing relay animation while `flushQueue()` is in flight and the demo tells a
true story: reports really were held, and really did arrive as a batch.

The best way to show this to a judge is to open your browser's devtools, switch
the network to Offline, file two reports, then switch back online and watch them
land on the dashboard together.

---

## Checking it worked

Open the browser console on your frontend. A red CORS message means the backend
doesn't yet list your site in `CORS_ORIGINS` — add it with no trailing slash and
redeploy the backend.

If a request returns but the list stays empty, open the backend's `/reports`
directly in a browser tab. If that shows data, the problem is in the React
component; if it doesn't, it's the API or the database.

And you can always compare against the console at the backend's root URL. It
calls exactly the same endpoints, so if something works there and not in your
app, the difference is in the frontend.
