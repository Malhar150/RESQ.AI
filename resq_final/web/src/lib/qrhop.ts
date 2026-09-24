/**
 * QR hop — moving a held report from one phone to another with no network.
 *
 * Phone A shows a report from its outbox as a QR code. Phone B scans it with
 * the camera and adds it to its own outbox as a "carried" report, one hop
 * further along. Whichever phone reaches signal first delivers it; the shared
 * client_id means the backend keeps only one copy.
 *
 * Photos don't fit in a QR code, so they stay on the phone that took them.
 */
import type { OutboxItem } from "./outbox";

const PREFIX = "RESQ1";
/** Keep codes small enough to scan off a phone screen reliably. */
export const QR_MAX_BYTES = 1400;

interface Wire { c: string; d: string; la: number; lo: number; t: string; h: number }

export function encodeHop(item: OutboxItem): { text: string; bytes: number; tooBig: boolean } {
  const wire: Wire = {
    c: item.client_id,
    d: item.description,
    la: Math.round(item.latitude * 1e5) / 1e5,
    lo: Math.round(item.longitude * 1e5) / 1e5,
    t: item.queued_at,
    h: item.hops,
  };
  const text = PREFIX + JSON.stringify(wire);
  const bytes = new TextEncoder().encode(text).length;
  return { text, bytes, tooBig: bytes > QR_MAX_BYTES };
}

export type DecodedHop = Pick<OutboxItem, "client_id" | "description" | "latitude" | "longitude" | "queued_at" | "hops">;

export function decodeHop(text: string): DecodedHop | null {
  if (!text || !text.startsWith(PREFIX)) return null;
  try {
    const w = JSON.parse(text.slice(PREFIX.length)) as Partial<Wire>;
    if (typeof w.c !== "string" || !w.c || w.c.length > 100) return null;
    if (typeof w.d !== "string" || !w.d.trim() || w.d.length > 4000) return null;
    if (typeof w.la !== "number" || typeof w.lo !== "number") return null;
    if (Math.abs(w.la) > 90 || Math.abs(w.lo) > 180) return null;
    return {
      client_id: w.c,
      description: w.d,
      latitude: w.la,
      longitude: w.lo,
      queued_at: typeof w.t === "string" && !Number.isNaN(Date.parse(w.t)) ? w.t : new Date().toISOString(),
      hops: (Number.isFinite(w.h) ? Number(w.h) : 0) + 1,
    };
  } catch {
    return null;
  }
}
