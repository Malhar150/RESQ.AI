import type { T } from "../i18n";
import { ResqError, type Report } from "./api";

export function ago(iso: string | null | undefined, t: T): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return "—";
  const m = Math.floor(Math.max(0, ms) / 60000);
  if (m < 1) return t("time.justNow");
  if (m < 60) return t("time.min", { n: m });
  const h = Math.floor(m / 60);
  if (h < 24) return t("time.hr", { n: h });
  return t("time.day", { n: Math.floor(h / 24) });
}

export function clock(d: Date | string, locale = "en-IN"): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", hour12: false });
}

export function dateTime(iso: string, locale = "en-IN"): string {
  return new Date(iso).toLocaleString(locale, {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false,
  });
}

export function coords(r: Pick<Report, "latitude" | "longitude">, digits = 4): string {
  if (typeof r.latitude !== "number" || typeof r.longitude !== "number") return "—";
  return `${r.latitude.toFixed(digits)}, ${r.longitude.toFixed(digits)}`;
}

/** Turn any thrown value into a sentence for the person in front of the screen. */
export function errorText(err: unknown, t: T): string {
  if (err instanceof ResqError) {
    switch (err.kind) {
      case "network": return t("err.network");
      case "timeout": return t("err.timeout");
      case "rate": return t("err.rate", { s: err.retryAfter ?? 60 });
      case "validation": return t("err.validation", { m: err.details?.join("; ") || err.message });
      case "auth": return t("err.auth");
      case "notfound": return t("err.notfound");
      default: return t("err.server", { m: err.message });
    }
  }
  return t("err.server", { m: (err as Error)?.message || String(err) });
}

const SEV_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };
const STATUS_RANK: Record<string, number> = { pending: 0, verified: 1, dispatched: 2, resolved: 3, dismissed: 4 };

/**
 * "Priority" order for the control room: unactioned before actioned, then
 * high severity first, then trusted before suspect, then newest.
 */
export function byPriority(a: Report, b: Report): number {
  const open = (r: Report) => (r.status === "resolved" || r.status === "dismissed" ? 1 : 0);
  return (
    open(a) - open(b) ||
    (STATUS_RANK[a.status ?? "pending"] > 0 ? 1 : 0) - (STATUS_RANK[b.status ?? "pending"] > 0 ? 1 : 0) ||
    (SEV_RANK[a.severity ?? ""] ?? 3) - (SEV_RANK[b.severity ?? ""] ?? 3) ||
    (b.trust_score ?? 50) - (a.trust_score ?? 50) ||
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

export const byNewest = (a: Report, b: Report) =>
  new Date(b.created_at).getTime() - new Date(a.created_at).getTime();

export const byLeastTrusted = (a: Report, b: Report) =>
  (a.trust_score ?? 999) - (b.trust_score ?? 999) || byNewest(a, b);
