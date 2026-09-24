/**
 * RESQ.AI backend client.
 *
 * Talks to the existing Express API exactly as it is — no new routes, no
 * changed shapes. Every type below mirrors what routes/reports.js and
 * routes/stats.js actually return.
 */
import { isNativeApp } from "./platform";

/** Built with `npm run build:demo`: the backend runs inside the page (src/demo). */
export const IS_DEMO = import.meta.env.VITE_DEMO === "1";

export type Severity = "high" | "medium" | "low";
export type Status = "pending" | "verified" | "dispatched" | "resolved" | "dismissed";
export type Source = "online" | "mesh";
export type HazardType =
  | "flood" | "landslide" | "storm" | "earthquake" | "fire"
  | "building_collapse" | "medical" | "infrastructure" | "other";
export type TrustBand = "strong" | "fair" | "weak" | "suspect";

export const SEVERITIES: Severity[] = ["high", "medium", "low"];
export const STATUSES: Status[] = ["pending", "verified", "dispatched", "resolved", "dismissed"];
export const HAZARDS: HazardType[] = [
  "flood", "landslide", "storm", "earthquake", "fire",
  "building_collapse", "medical", "infrastructure", "other",
];

export interface Flag { code: string; label: string; detail: string; delta: number }

export interface Report {
  id: number | string;
  created_at: string;
  description: string;
  photo_url: string | null;
  latitude: number | null;
  longitude: number | null;
  severity: Severity | null;
  status: Status | null;
  source: Source | null;
  // Present once sql/001_upgrade.sql has been run.
  client_id?: string | null;
  photo_hash?: string | null;
  hazard_type?: HazardType | null;
  language?: string | null;
  trust_score?: number | null;
  flags?: Flag[] | string | null;
  ai_confidence?: number | null;
  ai_model?: string | null;
  reporter_hash?: string | null;
  verified_at?: string | null;
  trust_band?: TrustBand | null;
}

export interface Analysis {
  severity: Severity;
  hazard_type: HazardType;
  language: string;
  confidence: number;
  model: string;
  reasoning: string;
  score?: number;
  trust_score: number;
  trust_band: TrustBand;
  flags: Flag[];
}

export interface Health {
  status: string;
  service: string;
  uptimeSeconds: number;
  features: {
    database: boolean;
    schemaUpgraded: boolean;
    aiClassifier: string;
    photoHashing: boolean;
    phashThreshold: number;
    adminKeySet: boolean;
  };
  time: string;
}

export interface Stats {
  total: number;
  verified: number;
  viaMesh: number;
  high: number;
  openHigh: number;
  last24h: number;
  lastHour: number;
  bySeverity: Record<string, number>;
  byStatus: Record<string, number>;
  bySource: Record<string, number>;
  byHazard: Record<string, number> | null;
  trust: { strong: number; fair: number; weak: number; suspect: number; unscored: number };
  timeline: { hoursAgo: number; total: number; high: number }[];
  generatedAt: string;
}

export interface NewReport {
  description: string;
  latitude: number;
  longitude: number;
  photo_url?: string | null;
  photo_base64?: string | null;
  source?: Source;
  client_id?: string;
}

export interface SyncResult {
  accepted: number;
  skipped: number;
  failed: number;
  reports: Report[];
  details: {
    skipped: { client_id: string; reason: string }[];
    failed: { client_id: string | null; errors: string[] }[];
  };
}

export interface ReportFilters {
  severity?: string[];
  status?: string[];
  source?: string[];
  hazard_type?: string[];
  q?: string;
  since?: string;
  limit?: number;
}

/* ------------------------------------------------------------------------
 * Configuration: where is the backend, and what is the admin key?
 * Order: ?api= in the URL → saved in this browser → VITE_RESQ_API → localhost.
 * --------------------------------------------------------------------- */

const LS_API = "resq.apiBase";
const LS_KEY = "resq.adminKey";

function safeGet(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function safeSet(key: string, value: string | null) {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch { /* storage blocked — settings just won't persist */ }
}

const clean = (u: string) => u.trim().replace(/\/+$/, "");

(function captureUrlOverride() {
  try {
    const fromUrl = new URLSearchParams(location.search).get("api");
    if (fromUrl) safeSet(LS_API, clean(fromUrl));
  } catch { /* ignore */ }
})();

export function apiBase(): string {
  if (IS_DEMO) return "https://demo.resq.local";
  const saved = safeGet(LS_API);
  if (saved) return clean(saved);
  const runtime = (window as unknown as { RESQ_CONFIG?: { apiBase?: string } }).RESQ_CONFIG?.apiBase;
  if (runtime) return clean(runtime);
  const env = import.meta.env.VITE_RESQ_API as string | undefined;
  if (env) return clean(env);
  // Inside the Android app "localhost" is the phone itself, so there is no
  // sensible default — the person sets the server address once in Settings.
  if (isNativeApp()) return "";
  return "http://localhost:4000";
}

/** False only in the Android app before a server address has been set. */
export function apiConfigured(): boolean { return apiBase() !== ""; }

export function savedApiBase(): string { return safeGet(LS_API) || ""; }
export function setApiBase(url: string) { safeSet(LS_API, url ? clean(url) : null); }

export function adminKey(): string { return safeGet(LS_KEY) || ""; }
export function setAdminKey(key: string) { safeSet(LS_KEY, key || null); }

/* ------------------------------------------------------------------------
 * Request helper
 * --------------------------------------------------------------------- */

export type ErrorKind = "network" | "timeout" | "validation" | "auth" | "rate" | "notfound" | "server";

export class ResqError extends Error {
  kind: ErrorKind;
  status: number;
  details?: string[];
  retryAfter?: number;
  constructor(message: string, kind: ErrorKind, status = 0, details?: string[], retryAfter?: number) {
    super(message);
    this.name = "ResqError";
    this.kind = kind;
    this.status = status;
    this.details = details;
    this.retryAfter = retryAfter;
  }
  /** True when nothing reached the server — safe to hold the report and retry later. */
  get offline() { return this.kind === "network" || this.kind === "timeout"; }
}

interface RequestOpts {
  method?: string;
  body?: unknown;
  timeoutMs?: number;
  admin?: boolean;
  signal?: AbortSignal;
}

async function request<T>(path: string, opts: RequestOpts = {}): Promise<T> {
  const { method = "GET", body, timeoutMs = 25000, admin = false } = opts;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  if (opts.signal) opts.signal.addEventListener("abort", () => controller.abort(), { once: true });

  if (!apiBase()) throw new ResqError("No server address set.", "network");

  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (admin && adminKey()) headers["x-admin-key"] = adminKey();

  let res: Response;
  try {
    const doFetch = import.meta.env.VITE_DEMO === "1" ? (await import("../demo/server")).demoFetch : fetch;
    res = await doFetch(apiBase() + path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    if ((err as Error).name === "AbortError") {
      throw new ResqError("The server took too long to answer.", "timeout");
    }
    throw new ResqError(`Could not reach the server at ${apiBase()}.`, "network");
  }
  clearTimeout(timer);

  let json: Record<string, unknown> | null = null;
  try { json = await res.json(); } catch { /* empty body */ }

  if (!res.ok) {
    const msg = String(json?.detail || json?.error || `HTTP ${res.status}`);
    const details = Array.isArray(json?.details) ? (json!.details as string[]) : undefined;
    const kind: ErrorKind =
      res.status === 400 ? "validation"
      : res.status === 401 || res.status === 403 ? "auth"
      : res.status === 404 ? "notfound"
      : res.status === 429 ? "rate"
      : "server";
    const retry = Number(res.headers.get("Retry-After")) || undefined;
    throw new ResqError(msg, kind, res.status, details, retry);
  }
  return json as T;
}

/* ------------------------------------------------------------------------
 * Endpoints
 * --------------------------------------------------------------------- */

export const getHealth = (signal?: AbortSignal) =>
  request<Health>("/health", { timeoutMs: 15000, signal });

export const getStats = (signal?: AbortSignal) => request<Stats>("/stats", { signal });

export async function getReports(filters: ReportFilters = {}, signal?: AbortSignal): Promise<Report[]> {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) {
    if (v === undefined || v === null || v === "") continue;
    if (Array.isArray(v)) { if (v.length) p.set(k, v.join(",")); }
    else p.set(k, String(v));
  }
  const qs = p.toString();
  const res = await request<{ reports: Report[]; count: number }>(`/reports${qs ? `?${qs}` : ""}`, { signal });
  return res.reports || [];
}

export async function getReport(id: string | number, signal?: AbortSignal): Promise<Report> {
  const res = await request<{ report: Report }>(`/reports/${encodeURIComponent(String(id))}`, { signal });
  return res.report;
}

export function postReport(body: NewReport) {
  return request<{ report: Report; analysis?: Analysis; duplicate?: boolean }>("/reports", {
    method: "POST",
    body,
    timeoutMs: 45000, // classifier + photo hashing + Render cold start
  });
}

export function syncReports(reports: NewReport[]) {
  return request<SyncResult>("/reports/sync", { method: "POST", body: { reports }, timeoutMs: 60000 });
}

export async function patchReport(
  id: string | number,
  changes: Partial<{ status: Status; severity: Severity; hazard_type: HazardType }>
): Promise<Report> {
  const res = await request<{ report: Report }>(`/reports/${encodeURIComponent(String(id))}`, {
    method: "PATCH",
    body: changes,
    admin: true,
  });
  return res.report;
}

export function deleteReport(id: string | number) {
  return request<{ deleted: string | number }>(`/reports/${encodeURIComponent(String(id))}`, {
    method: "DELETE",
    admin: true,
  });
}

/**
 * Check an admin key without changing anything.
 *
 * Preferred: re-send an existing report's current status. That runs the admin
 * check and returns 200 with nothing actually changed. (A "verified" report is
 * skipped, because re-verifying would bump its verified_at.)
 * Fallback for an empty table: an empty PATCH, which the backend answers with
 * 401 for a bad key and 400 ("Nothing to update") for a good one.
 */
export async function checkAdminKey(key: string): Promise<boolean> {
  const previous = adminKey();
  setAdminKey(key);
  try {
    const [row] = await getReports({ status: ["pending", "dispatched", "resolved", "dismissed"], limit: 1 });
    if (row && row.status) {
      await request(`/reports/${encodeURIComponent(String(row.id))}`, {
        method: "PATCH", body: { status: row.status }, admin: true, timeoutMs: 20000,
      });
    } else {
      await request("/reports/0", { method: "PATCH", body: {}, admin: true, timeoutMs: 20000 });
    }
    return true;
  } catch (err) {
    const e = err as ResqError;
    if (e.kind === "validation" || e.kind === "notfound") return true;
    setAdminKey(previous);
    if (e.kind === "auth") return false;
    throw e;
  }
}

export function flagsOf(r: Pick<Report, "flags">): Flag[] {
  const f = r.flags;
  if (Array.isArray(f)) return f;
  if (typeof f === "string") {
    try { const parsed = JSON.parse(f); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
  }
  return [];
}

export function trustBandOf(score: number | null | undefined): TrustBand | null {
  if (typeof score !== "number") return null;
  if (score >= 75) return "strong";
  if (score >= 50) return "fair";
  if (score >= 30) return "weak";
  return "suspect";
}

export function newClientId(): string {
  try { if (crypto.randomUUID) return crypto.randomUUID(); } catch { /* insecure context */ }
  return `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
