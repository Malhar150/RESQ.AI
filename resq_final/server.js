/**
 * RESQ.AI backend — citizen hazard reports flowing up to a control room.
 *
 * Routes
 *   GET    /health          service + feature status (safe to expose)
 *   GET    /                the operations console (served from ./public)
 *   POST   /reports         a citizen files a report
 *   POST   /reports/sync    a device uploads its offline mesh queue
 *   GET    /reports         the dashboard feed, with filters
 *   GET    /reports/:id     one report
 *   PATCH  /reports/:id     verify / escalate / dismiss   (admin key)
 *   DELETE /reports/:id     remove spam or test entries   (admin key)
 *   GET    /stats           counters and breakdowns for the dashboard
 */
import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

import { detectSchema, isUpgraded } from "./lib/supabase.js";
import { activeProvider } from "./lib/classify.js";
import { isPhotoHashingAvailable, PHASH_THRESHOLD } from "./lib/imageHash.js";
import { adminKeyConfigured } from "./middleware/auth.js";
import reportsRouter from "./routes/reports.js";
import statsRouter from "./routes/stats.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.set("trust proxy", 1); // Render/Railway sit behind a proxy

/* --- CORS ----------------------------------------------------------------
 * Browsers block a page on one domain from calling an API on another unless
 * the API says it's allowed. Your Netlify frontend and this backend are on
 * different domains, so this has to be right or every request fails with a
 * confusing "CORS error" in the console.
 * ---------------------------------------------------------------------- */
const allowed = (process.env.CORS_ORIGINS || "*")
  .split(",")
  .map((o) => o.trim().replace(/\/$/, ""))
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      // No origin = curl, Postman, or a mobile app. Always allow those.
      if (!origin) return callback(null, true);
      if (allowed.includes("*")) return callback(null, true);
      if (allowed.includes(origin.replace(/\/$/, ""))) return callback(null, true);
      callback(new Error(`Origin ${origin} is not in CORS_ORIGINS`));
    },
    allowedHeaders: ["Content-Type", "x-admin-key", "Authorization"],
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  })
);

// Photos can arrive as base64 inside the JSON body, so the default 100kb
// limit is far too small.
app.use(express.json({ limit: "12mb" }));

/* --- Health --------------------------------------------------------------
 * Tells you at a glance which optional features actually came up. Deploy
 * platforms also ping this to know the service is alive.
 * ---------------------------------------------------------------------- */
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "resq-ai-backend",
    uptimeSeconds: Math.round(process.uptime()),
    features: {
      database: Boolean(process.env.SUPABASE_URL),
      schemaUpgraded: isUpgraded(),
      aiClassifier: activeProvider() || "rules-only",
      photoHashing: isPhotoHashingAvailable(),
      phashThreshold: PHASH_THRESHOLD,
      adminKeySet: adminKeyConfigured(),
    },
    time: new Date().toISOString(),
  });
});

/* --- API ----------------------------------------------------------------- */
app.use("/reports", reportsRouter);
app.use("/stats", statsRouter);

/* --- Console ------------------------------------------------------------
 * The dashboard is a single HTML file in ./public. Serving it from the same
 * origin as the API means no CORS setup is needed to try things out locally.
 * ---------------------------------------------------------------------- */
app.use(express.static(path.join(__dirname, "public")));

/* --- Errors -------------------------------------------------------------- */
app.use((req, res) => {
  res.status(404).json({ error: `No route for ${req.method} ${req.path}` });
});

app.use((err, req, res, next) => {
  if (/CORS_ORIGINS/.test(err?.message || "")) {
    return res.status(403).json({
      error: "Blocked by CORS",
      detail: err.message,
      hint: "Add this site's URL to CORS_ORIGINS in your environment, then redeploy.",
    });
  }
  console.error("[unhandled]", err);
  res.status(500).json({ error: "Server error", detail: err?.message });
});

/* --- Start --------------------------------------------------------------- */
const PORT = process.env.PORT || 4000;

async function start() {
  await detectSchema();

  app.listen(PORT, () => {
    const provider = activeProvider();
    console.log("");
    console.log(`  RESQ.AI backend listening on port ${PORT}`);
    console.log(`  Console      http://localhost:${PORT}/`);
    console.log(`  Health       http://localhost:${PORT}/health`);
    console.log("");
    console.log(`  Classifier   ${provider ? `${provider} (AI)` : "rule engine (no API key set)"}`);
    console.log(`  Photo checks ${isPhotoHashingAvailable() ? "on" : "off (npm install jimp)"}`);
    console.log(`  Admin key    ${adminKeyConfigured() ? "set" : "NOT SET — write routes are open"}`);
    console.log(`  CORS         ${allowed.join(", ")}`);
    console.log("");
  });
}

start().catch((err) => {
  console.error("Failed to start:", err);
  process.exit(1);
});
