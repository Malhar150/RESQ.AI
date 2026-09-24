/**
 * RESQ.AI API client — drop this into your React app's src/ folder.
 *
 * No dependencies, no build step, nothing to configure in code. It reads the
 * backend address from an environment variable so the same file works locally
 * and on Netlify:
 *
 *   Vite               VITE_RESQ_API=https://your-app.onrender.com
 *   Create React App   REACT_APP_RESQ_API=https://your-app.onrender.com
 *
 * With neither set it falls back to http://localhost:4000, which is what you
 * want while developing.
 *
 * Usage:
 *   import { submitReport, fetchReports, fetchStats } from "./resq-api";
 *
 *   const { report, analysis } = await submitReport({
 *     description: "Water has entered the ground floor",
 *     latitude: 26.1445,
 *     longitude: 91.7362,
 *   });
 */

/* -------------------------------------------------------------------------
 * Configuration
 * ---------------------------------------------------------------------- */

function readEnv() {
  // Vite exposes import.meta.env; CRA exposes process.env. Reading either one
  // in the wrong bundler throws, so both are wrapped.
  try {
    if (typeof import.meta !== "undefined" && import.meta.env?.VITE_RESQ_API) {
      return import.meta.env.VITE_RESQ_API;
    }
  } catch { /* not Vite */ }

  try {
    if (typeof process !== "undefined" && process.env?.REACT_APP_RESQ_API) {
      return process.env.REACT_APP_RESQ_API;
    }
  } catch { /* not CRA */ }

  return "http://localhost:4000";
}

export const API_BASE = String(readEnv()).replace(/\/$/, "");

/** Set once at startup if the control-room UI needs to verify or delete. */
let adminKey = "";
export function setAdminKey(key) { adminKey = key || ""; }

/* -------------------------------------------------------------------------
 * Core request helper
 * ---------------------------------------------------------------------- */

export class ResqError extends Error {
  constructor(message, status, body) {
    super(message);
    this.name = "ResqError";
    this.status = status;
    this.body = body;
  }
}

async function request(path, { method = "GET", body, timeoutMs = 20000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(API_BASE + path, {
      method,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(adminKey ? { "x-admin-key": adminKey } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    let json = null;
    try { json = await res.json(); } catch { /* empty body */ }

    if (!res.ok) {
      throw new ResqError(
        json?.detail || json?.error || `Request failed with HTTP ${res.status}`,
        res.status,
        json
      );
    }
    return json;
  } catch (err) {
    if (err.name === "AbortError") {
      throw new ResqError(
        "The backend did not respond in time. On Render's free tier the first " +
          "request after a quiet period can take up to a minute.",
        0,
        null
      );
    }
    if (err instanceof ResqError) throw err;
    throw new ResqError(
      `Could not reach the backend at ${API_BASE}. Check it is running and that ` +
        `this site's address is listed in CORS_ORIGINS.`,
      0,
      null
    );
  } finally {
    clearTimeout(timer);
  }
}

/* -------------------------------------------------------------------------
 * Reads
 * ---------------------------------------------------------------------- */

/**
 * @param {object} filters { severity, status, source, hazard_type, q, since, limit }
 *   severity/status/source accept a string or an array.
 * @returns {Promise<Array>} reports, newest first
 */
export async function fetchReports(filters = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, Array.isArray(value) ? value.join(",") : String(value));
  }
  const query = params.toString();
  const res = await request(`/reports${query ? `?${query}` : ""}`);
  return res.reports || [];
}

export async function fetchReport(id) {
  const res = await request(`/reports/${encodeURIComponent(id)}`);
  return res.report;
}

/** Dashboard counters. Keeps total / verified / viaMesh / high, adds more. */
export async function fetchStats() {
  return request("/stats");
}

/** Which optional features are actually running on the server. */
export async function fetchHealth() {
  return request("/health");
}

/* -------------------------------------------------------------------------
 * Writes
 * ---------------------------------------------------------------------- */

/**
 * File a hazard report.
 * @returns {Promise<{report: object, analysis: object}>}
 *   `analysis` explains the decision — severity, hazard type, language,
 *   trust score and the individual signals behind it. Show it back to the
 *   reporter; it's the most convincing part of the demo.
 */
export async function submitReport({
  description,
  latitude,
  longitude,
  photo_url = null,
  source = "online",
  client_id = newClientId(),
}) {
  return request("/reports", {
    method: "POST",
    body: { description, latitude, longitude, photo_url, source, client_id },
  });
}

/**
 * Push a batch of reports that were held while offline.
 * Safe to call twice with the same batch — anything already received comes
 * back as skipped rather than being duplicated.
 */
export async function syncQueuedReports(reports) {
  return request("/reports/sync", {
    method: "POST",
    body: { reports: reports.map((r) => ({ ...r, source: r.source || "mesh" })) },
  });
}

/** Control room only. Needs setAdminKey() to have been called. */
export async function updateReport(id, changes) {
  const res = await request(`/reports/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: changes,
  });
  return res.report;
}

export const verifyReport = (id) => updateReport(id, { status: "verified" });
export const dispatchReport = (id) => updateReport(id, { status: "dispatched" });
export const dismissReport = (id) => updateReport(id, { status: "dismissed" });

export async function deleteReport(id) {
  return request(`/reports/${encodeURIComponent(id)}`, { method: "DELETE" });
}

/* -------------------------------------------------------------------------
 * Offline queue
 *
 * This is the browser-side stand-in for the Bluetooth mesh. A report filed
 * with no connection is held in localStorage; when the device is back online,
 * flushQueue pushes everything at once through /reports/sync.
 * ---------------------------------------------------------------------- */

const QUEUE_KEY = "resq.queue";

export function newClientId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `c-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function getQueue() {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]"); }
  catch { return []; }
}

function saveQueue(items) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(items));
}

/** Hold a report on the device until there's a way to send it. */
export function queueReport(report) {
  const item = { ...report, client_id: report.client_id || newClientId(), queued_at: new Date().toISOString() };
  saveQueue([...getQueue(), item]);
  return item;
}

/**
 * Send everything held on the device.
 * @returns {Promise<{accepted:number, skipped:number, failed:number, reports:Array}>}
 */
export async function flushQueue() {
  const items = getQueue();
  if (!items.length) return { accepted: 0, skipped: 0, failed: 0, reports: [] };

  const res = await syncQueuedReports(
    items.map(({ queued_at, ...rest }) => rest)
  );
  saveQueue([]);
  return res;
}

/**
 * File a report, holding it on the device if the network is down.
 * @returns {Promise<{queued:boolean, report?:object, analysis?:object}>}
 */
export async function submitOrQueue(report) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return { queued: true, item: queueReport(report) };
  }
  try {
    const res = await submitReport(report);
    return { queued: false, ...res };
  } catch (err) {
    if (err.status === 0) return { queued: true, item: queueReport(report), reason: err.message };
    throw err;
  }
}

/** Flush the queue automatically whenever the browser regains connectivity. */
export function autoFlushOnReconnect(onDone) {
  if (typeof window === "undefined") return () => {};
  const handler = () => { flushQueue().then(onDone).catch(() => {}); };
  window.addEventListener("online", handler);
  return () => window.removeEventListener("online", handler);
}
