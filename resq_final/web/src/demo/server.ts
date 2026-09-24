/**
 * DEMO ONLY — the RESQ.AI backend's routes re-created in the browser, so the
 * app can be shown somewhere it can't reach a real server (inside Claude).
 *
 * It follows routes/reports.js and routes/stats.js line for line: same
 * validation, same idempotent client_id handling, same response shapes, and
 * the backend's own rule classifier, trust scoring and photo fingerprinting
 * (copied into this folder). Reports live in this browser's storage.
 *
 * The real web app and APK never include this file — it is only bundled when
 * building with `npm run build:demo`.
 */
// @ts-expect-error — plain JS copied from the backend
import { classifyWithRules, SEVERITIES, HAZARD_TYPES } from "./classify.js";
// @ts-expect-error — plain JS copied from the backend
import { scoreTrust, reporterHash, trustBand } from "./trust.js";
// @ts-expect-error — plain JS copied from the backend
import { hashImage } from "./imageHash.js";

type Row = Record<string, unknown> & { id: number; created_at: string };
const KEY = "resq.demo.db";
const STATUSES = ["pending", "verified", "dispatched", "resolved", "dismissed"];

let db: { seq: number; reports: Row[] } | null = null;

function load() {
  if (db) return db;
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "null");
    if (raw && Array.isArray(raw.reports)) { db = raw; return db!; }
  } catch { /* fall through to seed */ }
  db = seed();
  save();
  return db;
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* storage blocked: demo still works in memory */ }
}
export function resetDemo() {
  db = seed();
  save();
  try {
    for (const k of ["resq.outbox", "resq.mine"]) localStorage.removeItem(k);
  } catch { /* ignore */ }
}

/** Sample reports across Assam and the North East, spread over the last day. */
function seed() {
  const now = Date.now();
  const S: [string, number, number, number, string, string?][] = [
    ["Water has entered houses in Ward 12, Anil Nagar. Two elderly people stuck on the roof, need a boat.", 26.1766, 91.7797, 6, "online", "verified"],
    ["Brahmaputra embankment near Dhemaji has cracks, water level rising fast. About 40 families nearby.", 27.4833, 94.5833, 38, "mesh"],
    ["Landslide on NH-6 near Jowai, road blocked, vehicles stranded both sides", 25.4506, 92.2089, 52, "online", "dispatched"],
    ["বানপানী বাঢ়িছে, গাঁৱৰ বহুতো ঘৰ পানীত বুৰিছে, মানুহ আবদ্ধ হৈ আছে", 26.7465, 94.2026, 75, "mesh"],
    ["Minor waterlogging near Fancy Bazar market, shops closed", 26.1860, 91.7450, 140, "online", "resolved"],
    ["पुल टूट गया है, गांव का संपर्क कट गया। 3 लोग घायल हैं", 24.8333, 92.7789, 190, "online"],
    ["Fire in a godown near Paltan Bazar, spreading to nearby shops", 26.1810, 91.7520, 22, "online", "verified"],
    ["Power lines down after the storm in Tezpur, no electricity since morning", 26.6528, 92.7926, 410, "online"],
    ["Flood water entered the primary school at Majuli, children moved to the first floor", 26.9500, 94.1667, 95, "mesh"],
    ["বাঁধ ভেঙে গেছে, পুরো গ্রাম জলের নিচে। আমাদের উদ্ধার করুন", 24.3000, 92.1667, 16, "online"],
    ["test test asdf", 26.14, 91.73, 300, "online", "dismissed"],
    ["Hill slope cracking behind houses at Nongpoh after heavy rain, families evacuating", 25.9000, 91.8800, 260, "online"],
    ["Injured man on the road near Jorhat bridge, ambulance needed", 26.7509, 94.2037, 33, "online"],
    ["Water rising in Barpeta town, about 20 people waiting on rooftops", 26.3228, 91.0062, 11, "mesh"],
  ];
  const rows: Row[] = [];
  let seq = 1;
  for (const [description, latitude, longitude, minsAgo, source, status] of S) {
    const ai = classifyWithRules(description);
    const created_at = new Date(now - minsAgo * 60000).toISOString();
    const { trust_score, flags } = scoreTrust(
      { description, latitude, longitude, photo_hash: null, photo_url: null, reporter_hash: `seed-${seq}`, source },
      rows
    );
    rows.push({
      id: seq++, created_at, description, photo_url: null, latitude, longitude,
      severity: ai.severity, status: status || "pending", source,
      client_id: null, photo_hash: null, hazard_type: ai.hazard_type, language: ai.language,
      trust_score, flags, ai_confidence: ai.confidence, ai_model: ai.model,
      reporter_hash: `seed-${seq}`, verified_at: status === "verified" ? created_at : null,
    });
  }
  rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
  return { seq, reports: rows };
}

/* ---- the routes ------------------------------------------------------- */

const decorate = (r: Row) => ({ ...r, trust_band: typeof r.trust_score === "number" ? trustBand(r.trust_score) : null });
const newest = () => [...load().reports].sort((a, b) => b.created_at.localeCompare(a.created_at));

function toNumber(v: unknown) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function validate(body: Record<string, unknown>) {
  const errors: string[] = [];
  const description = typeof body.description === "string" ? body.description.trim() : "";
  const latitude = toNumber(body.latitude);
  const longitude = toNumber(body.longitude);
  if (!description) errors.push("description is required");
  else if (description.length > 4000) errors.push("description must be under 4000 characters");
  if (latitude === null) errors.push("latitude is required and must be a number");
  else if (latitude < -90 || latitude > 90) errors.push("latitude must be between -90 and 90");
  if (longitude === null) errors.push("longitude is required and must be a number");
  else if (longitude < -180 || longitude > 180) errors.push("longitude must be between -180 and 180");
  if (body.source && !["online", "mesh"].includes(body.source as string)) errors.push("source must be 'online' or 'mesh'");
  return { errors, description, latitude: latitude as number, longitude: longitude as number };
}

async function buildRow(body: Record<string, unknown>, context: Row[]) {
  const { description, latitude, longitude } = validate(body);
  const photoSource = (body.photo_url || body.photo_base64 || null) as string | null;
  const ai = classifyWithRules(description);
  const photo_hash = photoSource ? await hashImage(photoSource) : null;
  const who = reporterHash();
  const { trust_score, flags } = scoreTrust(
    { description, latitude, longitude, photo_hash, photo_url: photoSource, reporter_hash: who, source: body.source || "online" },
    context
  );
  const row = {
    description, latitude, longitude,
    photo_url: typeof body.photo_url === "string" ? body.photo_url : null,
    severity: ai.severity, status: "pending", source: body.source === "mesh" ? "mesh" : "online",
    client_id: body.client_id || null, photo_hash, hazard_type: ai.hazard_type, language: ai.language,
    trust_score, flags, ai_confidence: ai.confidence, ai_model: ai.model, reporter_hash: who, verified_at: null,
  };
  return { row, analysis: { ...ai, trust_score, trust_band: trustBand(trust_score), flags } };
}

function insert(row: Record<string, unknown>): Row {
  const d = load();
  const r = { ...row, id: d.seq++, created_at: new Date().toISOString() } as Row;
  d.reports.unshift(r);
  save();
  return r;
}

type Result = { status: number; body: unknown };

async function route(method: string, url: URL, body: Record<string, unknown>): Promise<Result> {
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const q = url.searchParams;

  if (method === "GET" && path === "/health") {
    return { status: 200, body: {
      status: "ok", service: "resq-ai-backend (in-browser demo)", uptimeSeconds: Math.round(performance.now() / 1000),
      features: { database: true, schemaUpgraded: true, aiClassifier: "rules-only", photoHashing: true, phashThreshold: 10, adminKeySet: false },
      time: new Date().toISOString(),
    } };
  }

  if (method === "GET" && path === "/stats") {
    const rows = newest();
    const now = Date.now();
    const hoursAgo = (iso: string) => (now - new Date(iso).getTime()) / 36e5;
    const tally = (key: string) => rows.reduce<Record<string, number>>((o, r) => { const v = String(r[key] ?? "unknown"); o[v] = (o[v] || 0) + 1; return o; }, {});
    const trust = { strong: 0, fair: 0, weak: 0, suspect: 0, unscored: 0 } as Record<string, number>;
    for (const r of rows) { if (typeof r.trust_score === "number") trust[trustBand(r.trust_score)]++; else trust.unscored++; }
    return { status: 200, body: {
      total: rows.length,
      verified: rows.filter((r) => r.status === "verified").length,
      viaMesh: rows.filter((r) => r.source === "mesh").length,
      high: rows.filter((r) => r.severity === "high").length,
      openHigh: rows.filter((r) => r.severity === "high" && !["resolved", "dismissed"].includes(r.status as string)).length,
      last24h: rows.filter((r) => hoursAgo(r.created_at) <= 24).length,
      lastHour: rows.filter((r) => hoursAgo(r.created_at) <= 1).length,
      bySeverity: tally("severity"), byStatus: tally("status"), bySource: tally("source"), byHazard: tally("hazard_type"),
      trust,
      timeline: Array.from({ length: 24 }, (_, i) => {
        const back = 23 - i;
        const inB = rows.filter((r) => { const h = hoursAgo(r.created_at); return h >= back && h < back + 1; });
        return { hoursAgo: back, total: inB.length, high: inB.filter((r) => r.severity === "high").length };
      }),
      generatedAt: new Date().toISOString(),
    } };
  }

  if (method === "GET" && path === "/reports") {
    let rows = newest();
    const list = (k: string) => q.get(k)?.split(",").filter(Boolean);
    const sev = list("severity"), st = list("status"), src = list("source"), hz = list("hazard_type");
    if (sev) rows = rows.filter((r) => sev.includes(r.severity as string));
    if (st) rows = rows.filter((r) => st.includes(r.status as string));
    if (src) rows = rows.filter((r) => src.includes(r.source as string));
    if (hz) rows = rows.filter((r) => hz.includes(r.hazard_type as string));
    const text = q.get("q");
    if (text) rows = rows.filter((r) => String(r.description).toLowerCase().includes(text.replace(/[%_]/g, "").toLowerCase()));
    if (q.get("order") === "asc") rows.reverse();
    rows = rows.slice(0, Math.min(Number(q.get("limit")) || 200, 1000));
    return { status: 200, body: { reports: rows.map(decorate), count: rows.length } };
  }

  if (method === "POST" && path === "/reports") {
    const { errors } = validate(body);
    if (errors.length) return { status: 400, body: { error: "Invalid report", details: errors } };
    if (body.client_id) {
      const existing = load().reports.find((r) => r.client_id === body.client_id);
      if (existing) return { status: 200, body: { report: decorate(existing), duplicate: true } };
    }
    const { row, analysis } = await buildRow(body, newest().slice(0, 300));
    return { status: 201, body: { report: decorate(insert(row)), analysis } };
  }

  if (method === "POST" && path === "/reports/sync") {
    const items = Array.isArray(body.reports) ? (body.reports as Record<string, unknown>[]) : null;
    if (!items) return { status: 400, body: { error: "Expected a 'reports' array" } };
    if (items.length > 100) return { status: 413, body: { error: "Send at most 100 reports per sync" } };
    const context = newest().slice(0, 300);
    const seen = new Set(load().reports.map((r) => r.client_id).filter(Boolean));
    const accepted: Row[] = [];
    const skipped: unknown[] = [];
    const failed: unknown[] = [];
    for (const item of items) {
      if (item?.client_id && seen.has(item.client_id)) { skipped.push({ client_id: item.client_id, reason: "already received" }); continue; }
      const { errors } = validate(item || {});
      if (errors.length) { failed.push({ client_id: item?.client_id || null, errors }); continue; }
      const { row } = await buildRow({ ...item, source: item.source || "mesh" }, context);
      const saved = insert(row);
      accepted.push(decorate(saved) as Row);
      context.unshift(saved);
      if (item.client_id) seen.add(item.client_id);
    }
    return { status: accepted.length ? 201 : 200, body: {
      accepted: accepted.length, skipped: skipped.length, failed: failed.length, reports: accepted, details: { skipped, failed },
    } };
  }

  const one = /^\/reports\/([^/]+)$/.exec(path);
  if (one) {
    const d = load();
    const idx = d.reports.findIndex((r) => String(r.id) === decodeURIComponent(one[1]));
    if (method === "GET") {
      return idx < 0 ? { status: 404, body: { error: "Report not found" } } : { status: 200, body: { report: decorate(d.reports[idx]) } };
    }
    if (method === "PATCH") {
      const updates: Record<string, unknown> = {};
      if (body.status !== undefined) {
        if (!STATUSES.includes(body.status as string)) return { status: 400, body: { error: `status must be one of: ${STATUSES.join(", ")}` } };
        updates.status = body.status;
        if (body.status === "verified") updates.verified_at = new Date().toISOString();
      }
      if (body.severity !== undefined) {
        if (!SEVERITIES.includes(body.severity)) return { status: 400, body: { error: `severity must be one of: ${SEVERITIES.join(", ")}` } };
        updates.severity = body.severity;
      }
      if (body.hazard_type !== undefined) {
        if (!HAZARD_TYPES.includes(body.hazard_type)) return { status: 400, body: { error: `hazard_type must be one of: ${HAZARD_TYPES.join(", ")}` } };
        updates.hazard_type = body.hazard_type;
      }
      if (!Object.keys(updates).length) return { status: 400, body: { error: "Nothing to update. Send status, severity or hazard_type." } };
      if (idx < 0) return { status: 404, body: { error: "Report not found" } };
      d.reports[idx] = { ...d.reports[idx], ...updates };
      save();
      return { status: 200, body: { report: decorate(d.reports[idx]) } };
    }
    if (method === "DELETE") {
      if (idx < 0) return { status: 404, body: { error: "Report not found" } };
      const [gone] = d.reports.splice(idx, 1);
      save();
      return { status: 200, body: { deleted: gone.id } };
    }
  }

  return { status: 404, body: { error: `No route for ${method} ${path}` } };
}

/** Stands in for fetch() against the backend. Adds a little latency so loading states are visible. */
export async function demoFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const url = new URL(input, "https://demo.resq.local");
  let body: Record<string, unknown> = {};
  try { body = init.body ? JSON.parse(String(init.body)) : {}; } catch { body = {}; }
  await new Promise((r) => setTimeout(r, 180 + Math.random() * 220));
  if (init.signal?.aborted) throw new DOMException("Aborted", "AbortError");
  const { status, body: out } = await route((init.method || "GET").toUpperCase(), url, body);
  return new Response(JSON.stringify(out), { status, headers: { "Content-Type": "application/json" } });
}

export const DEMO_API = "https://demo.resq.local";
