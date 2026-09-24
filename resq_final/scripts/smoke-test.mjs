/**
 * End-to-end smoke test.
 *
 *   1. Start the server in one terminal:   npm run dev
 *   2. Run this in another:                npm run smoke
 *
 * It exercises every route against your real Supabase project, then deletes
 * the reports it created so your demo data stays clean. If a step fails it
 * says which one and why, rather than dumping a stack trace.
 *
 * Point it somewhere else with:  BASE=https://your-app.onrender.com npm run smoke
 */
import "dotenv/config";

const BASE = (process.env.BASE || `http://localhost:${process.env.PORT || 4000}`).replace(/\/$/, "");
const ADMIN = process.env.ADMIN_KEY || "";

let passed = 0;
let failed = 0;
const created = [];

function ok(label, extra = "") {
  passed++;
  console.log(`  PASS  ${label}${extra ? `   -- ${extra}` : ""}`);
}

function bad(label, reason) {
  failed++;
  console.log(`  FAIL  ${label}\n        ${reason}`);
}

async function call(method, path, body) {
  const headers = { "Content-Type": "application/json" };
  if (ADMIN) headers["x-admin-key"] = ADMIN;
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* an empty body is fine */ }
  return { status: res.status, json };
}

async function step(label, fn) {
  try {
    const detail = await fn();
    ok(label, detail || "");
  } catch (err) {
    bad(label, err.message);
  }
}

console.log(`\nRESQ.AI smoke test against ${BASE}\n`);

/* --- 1. is it up? -------------------------------------------------------- */

await step("GET /health responds", async () => {
  const { status, json } = await call("GET", "/health");
  if (status !== 200) throw new Error(`got HTTP ${status}`);
  if (json.status !== "ok") throw new Error(`unexpected body: ${JSON.stringify(json)}`);
  const f = json.features;
  return `classifier=${f.aiClassifier} photoHash=${f.photoHashing} schemaUpgraded=${f.schemaUpgraded} adminKey=${f.adminKeySet}`;
});

/* --- 2. reading ---------------------------------------------------------- */

await step("GET /reports returns a list", async () => {
  const { status, json } = await call("GET", "/reports");
  if (status !== 200) throw new Error(`got HTTP ${status}: ${JSON.stringify(json)}`);
  if (!Array.isArray(json.reports)) throw new Error("no reports array in the response");
  return `${json.reports.length} on file`;
});

await step("GET /stats returns counters", async () => {
  const { status, json } = await call("GET", "/stats");
  if (status !== 200) throw new Error(`got HTTP ${status}`);
  for (const key of ["total", "verified", "viaMesh", "high"]) {
    if (typeof json[key] !== "number") throw new Error(`missing counter: ${key}`);
  }
  return `total=${json.total} high=${json.high} mesh=${json.viaMesh}`;
});

/* --- 3. validation ------------------------------------------------------- */

await step("POST /reports rejects a report with no description", async () => {
  const { status } = await call("POST", "/reports", { latitude: 26.1, longitude: 91.7 });
  if (status !== 400) throw new Error(`expected 400, got ${status}`);
});

await step("POST /reports rejects impossible coordinates", async () => {
  const { status } = await call("POST", "/reports", {
    description: "test of coordinate validation",
    latitude: 999,
    longitude: 91.7,
  });
  if (status !== 400) throw new Error(`expected 400, got ${status}`);
});

/* --- 4. classification --------------------------------------------------- */

let highId = null;

await step("A life-threatening report classifies as high", async () => {
  const { status, json } = await call("POST", "/reports", {
    description: "SMOKE TEST -- water entered the house, two elderly people are trapped on the roof and cannot get out",
    latitude: 26.1445,
    longitude: 91.7362,
  });
  if (status !== 201) throw new Error(`expected 201, got ${status}: ${JSON.stringify(json)}`);
  highId = json.report.id;
  created.push(highId);
  if (json.report.severity !== "high") {
    throw new Error(`expected severity "high", got "${json.report.severity}"`);
  }
  return `#${highId} via ${json.analysis.model}, hazard=${json.analysis.hazard_type}, trust=${json.analysis.trust_score}`;
});

await step("A minor report classifies below high", async () => {
  const { status, json } = await call("POST", "/reports", {
    description: "SMOKE TEST -- a little waterlogging near the market, nothing serious",
    latitude: 26.15,
    longitude: 91.74,
  });
  if (status !== 201) throw new Error(`expected 201, got ${status}`);
  created.push(json.report.id);
  if (json.report.severity === "high") throw new Error("this should not have scored high");
  return `severity=${json.report.severity}`;
});

await step("A Hindi report is understood", async () => {
  const { status, json } = await call("POST", "/reports", {
    description: "SMOKE TEST -- पानी तेजी से बढ़ रहा है, दो लोग छत पर फंसे हैं, बचाओ",
    latitude: 26.16,
    longitude: 91.75,
  });
  if (status !== 201) throw new Error(`expected 201, got ${status}`);
  created.push(json.report.id);
  if (json.report.severity !== "high") {
    throw new Error(`expected "high", got "${json.report.severity}"`);
  }
  return `language=${json.analysis.language} severity=${json.report.severity}`;
});

/* --- 5. mesh sync + idempotency ------------------------------------------ */

const meshClientId = `smoke-${Date.now()}`;
const meshBody = {
  reports: [
    {
      client_id: meshClientId,
      description: "SMOKE TEST -- relayed from a village with no network, the embankment has breached",
      latitude: 26.75,
      longitude: 94.2,
      source: "mesh",
    },
  ],
};

await step("POST /reports/sync accepts a queued mesh batch", async () => {
  const { status, json } = await call("POST", "/reports/sync", meshBody);
  if (status !== 201) throw new Error(`expected 201, got ${status}: ${JSON.stringify(json)}`);
  if (json.accepted !== 1) throw new Error(`expected 1 accepted, got ${json.accepted}`);
  created.push(json.reports[0].id);
  return `source=${json.reports[0].source}`;
});

await step("Replaying the same batch does not duplicate it", async () => {
  const { json } = await call("POST", "/reports/sync", meshBody);
  if (json.accepted !== 0 || json.skipped !== 1) {
    throw new Error(
      `expected 0 accepted / 1 skipped, got ${json.accepted}/${json.skipped}. ` +
        `If schemaUpgraded was false above, run sql/001_upgrade.sql first.`
    );
  }
});

/* --- 6. single fetch + control-room actions ------------------------------ */

await step("GET /reports/:id fetches one report", async () => {
  if (!highId) throw new Error("skipped -- nothing was created earlier");
  const { status, json } = await call("GET", `/reports/${highId}`);
  if (status !== 200) throw new Error(`got HTTP ${status}`);
  if (String(json.report.id) !== String(highId)) throw new Error("the wrong report came back");
});

await step("PATCH /reports/:id verifies a report", async () => {
  if (!highId) throw new Error("skipped -- nothing was created earlier");
  const { status, json } = await call("PATCH", `/reports/${highId}`, { status: "verified" });
  if (status === 401) throw new Error("admin key rejected -- is ADMIN_KEY the same here and in .env?");
  if (status !== 200) throw new Error(`got HTTP ${status}: ${JSON.stringify(json)}`);
  if (json.report.status !== "verified") throw new Error(`status came back as "${json.report.status}"`);
});

await step("PATCH rejects a status that is not allowed", async () => {
  if (!highId) throw new Error("skipped -- nothing was created earlier");
  const { status } = await call("PATCH", `/reports/${highId}`, { status: "banana" });
  if (status !== 400) throw new Error(`expected 400, got ${status}`);
});

/* --- 7. filters ---------------------------------------------------------- */

await step("GET /reports?severity=high filters correctly", async () => {
  const { status, json } = await call("GET", "/reports?severity=high&limit=50");
  if (status !== 200) throw new Error(`got HTTP ${status}`);
  const wrong = (json.reports || []).find((r) => r.severity !== "high");
  if (wrong) throw new Error(`a "${wrong.severity}" report came back in a high-only query`);
  return `${json.reports.length} high-severity`;
});

await step("GET /reports?source=mesh filters correctly", async () => {
  const { json } = await call("GET", "/reports?source=mesh&limit=50");
  const wrong = (json.reports || []).find((r) => r.source !== "mesh");
  if (wrong) throw new Error(`a "${wrong.source}" report came back in a mesh-only query`);
  return `${json.reports.length} via mesh`;
});

/* --- 8. clean up --------------------------------------------------------- */

await step(`Deleting the ${created.length} reports this test created`, async () => {
  let removed = 0;
  const stuck = [];
  for (const id of created) {
    const { status } = await call("DELETE", `/reports/${id}`);
    if (status === 200) removed++;
    else stuck.push(`${id} (HTTP ${status})`);
  }
  if (stuck.length) {
    throw new Error(
      `could not remove ${stuck.join(", ")}. Delete them by hand in Supabase -- ` +
        `their descriptions all start with "SMOKE TEST".`
    );
  }
  return `${removed} removed`;
});

/* --- summary ------------------------------------------------------------- */

console.log(`\n  ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
