/**
 * Vercel serverless entry point for the RESQ.AI API.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * `server.js` is a long-running Node server: it calls `app.listen()` as soon
 * as it is imported. Vercel runs the API as a function instead, so it needs a
 * module that exports a request handler and never listens on a port.
 *
 * Nothing in the backend was changed to make this work. This file imports the
 * real routers, the real classifier, the real trust scoring and the real
 * Supabase client, so the API behaves exactly as it does when you run
 * `npm start` on your laptop or on Render. `server.js` still works untouched.
 *
 * The one cost: the app wiring below (CORS, body limit, /health, error
 * handling) is a copy of the same wiring in `server.js`. If you ever change
 * that part of `server.js`, change it here too.
 *
 * ROUTING
 * -------
 * This file catches everything under /api on the deployed site:
 *
 *   /api/health        ->  /health
 *   /api/reports       ->  /reports
 *   /api/reports/12    ->  /reports/12
 *   /api/stats         ->  /stats
 *
 * The `/api` prefix is stripped before the request reaches Express, so the
 * routers see the paths they were written for. The frontend is built with
 * VITE_RESQ_API=/api, which is why it is a same-origin app with no CORS
 * involved at all in the browser.
 */
import express from "express";
import cors from "cors";

import { detectSchema, isUpgraded } from "../lib/supabase.js";
import { activeProvider } from "../lib/classify.js";
import { isPhotoHashingAvailable, PHASH_THRESHOLD } from "../lib/imageHash.js";
import { adminKeyConfigured } from "../middleware/auth.js";
import reportsRouter from "../routes/reports.js";
import statsRouter from "../routes/stats.js";

const app = express();

// Vercel terminates TLS and forwards the caller's IP in x-forwarded-for, which
// is what the rate limiter reads.
app.set("trust proxy", 1);

/* --- CORS ---------------------------------------------------------------
 * The website and the API are the same origin here, so a browser on the site
 * never needs CORS. It still matters for the Android app (its origin is
 * http://localhost) and for anything calling the API from elsewhere, so the
 * same CORS_ORIGINS rule as server.js applies.
 * -------------------------------------------------------------------- */
const allowed = (process.env.CORS_ORIGINS || "*")
  .split(",")
  .map((o) => o.trim().replace(/\/$/, ""))
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (allowed.includes("*")) return callback(null, true);
      if (allowed.includes(origin.replace(/\/$/, ""))) return callback(null, true);
      callback(new Error(`Origin ${origin} is not in CORS_ORIGINS`));
    },
    allowedHeaders: ["Content-Type", "x-admin-key", "Authorization"],
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  })
);

app.use(express.json({ limit: "12mb" }));

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

app.use("/reports", reportsRouter);
app.use("/stats", statsRouter);

app.use((req, res) => {
  res.status(404).json({ error: `No route for ${req.method} ${req.path}` });
});

app.use((err, req, res, next) => {
  if (/CORS_ORIGINS/.test(err?.message || "")) {
    return res.status(403).json({
      error: "Blocked by CORS",
      detail: err.message,
      hint: "Add this site's URL to CORS_ORIGINS in the Vercel project settings, then redeploy.",
    });
  }
  console.error("[unhandled]", err);
  res.status(500).json({ error: "Server error", detail: err?.message });
});

/* --- Handler ------------------------------------------------------------
 * `detectSchema()` runs once per warm instance, exactly as it runs once per
 * process in server.js. It is awaited before the first request is served, so
 * the first insert already knows which columns exist.
 * -------------------------------------------------------------------- */
let schemaReady;

export default async function handler(req, res) {
  if (!schemaReady) schemaReady = detectSchema().catch(() => {});
  await schemaReady;

  req.url = req.url.replace(/^\/api(?=\/|\?|$)/, "") || "/";
  if (req.url.startsWith("?")) req.url = `/${req.url}`;

  return app(req, res);
}
