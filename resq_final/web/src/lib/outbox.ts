/**
 * The outbox — reports held on this device until there is a way to send them.
 *
 * Two kinds of item live here:
 *   own     — filed on this phone while it had no connection
 *   carried — scanned off someone else's phone (QR hop), being carried onward
 *
 * Both go up through POST /reports/sync with source "mesh". Each carries the
 * client_id minted on the phone where it was first written, so the backend
 * de-duplicates if two carriers deliver the same report.
 */
import { newClientId, syncReports, type NewReport, type SyncResult } from "./api";
import { linkIds } from "./mine";

export interface OutboxItem {
  client_id: string;
  description: string;
  latitude: number;
  longitude: number;
  photo_url?: string | null;
  photo_base64?: string | null;
  queued_at: string;
  /** How many phones this report has passed through before this one (0 = written here). */
  hops: number;
  origin: "own" | "carried";
  /** Set when the server rejected it; kept so the person can fix or discard it. */
  error?: string | null;
}

const KEY = "resq.outbox";
const listeners = new Set<() => void>();

function read(): OutboxItem[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function write(items: OutboxItem[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    // Storage full (usually photos). Drop photos from the oldest items and retry once.
    const slim = items.map((i, n) => (n < items.length - 1 ? { ...i, photo_base64: null } : i));
    try { localStorage.setItem(KEY, JSON.stringify(slim)); } catch { /* give up quietly */ }
  }
  listeners.forEach((fn) => fn());
}

export function getOutbox(): OutboxItem[] { return read(); }

export function subscribeOutbox(fn: () => void): () => void {
  listeners.add(fn);
  const onStorage = (e: StorageEvent) => { if (e.key === KEY) fn(); };
  window.addEventListener("storage", onStorage);
  return () => { listeners.delete(fn); window.removeEventListener("storage", onStorage); };
}

export function hold(
  report: Omit<OutboxItem, "client_id" | "queued_at" | "hops" | "origin"> &
    Partial<Pick<OutboxItem, "client_id" | "queued_at" | "hops" | "origin">>
): { item: OutboxItem; added: boolean } {
  const items = read();
  const item: OutboxItem = {
    client_id: report.client_id || newClientId(),
    queued_at: report.queued_at || new Date().toISOString(),
    hops: report.hops ?? 0,
    origin: report.origin ?? "own",
    description: report.description,
    latitude: report.latitude,
    longitude: report.longitude,
    photo_url: report.photo_url ?? null,
    photo_base64: report.photo_base64 ?? null,
    error: null,
  };
  if (items.some((i) => i.client_id === item.client_id)) return { item, added: false };
  write([...items, item]);
  return { item, added: true };
}

export function discard(clientId: string) {
  write(read().filter((i) => i.client_id !== clientId));
}

let flushing: Promise<SyncResult | null> | null = null;

/**
 * Send everything held. Removes what the server accepted or already had;
 * keeps anything it rejected, marked with the reason. Only one flush runs at
 * a time — a second call while one is in flight gets the same promise.
 */
export function flush(): Promise<SyncResult | null> {
  if (flushing) return flushing;
  // Items the server already rejected stay put until the person discards them.
  const items = read().filter((i) => !i.error);
  if (!items.length) return Promise.resolve(null);

  flushing = (async () => {
    try {
      const batch = items.slice(0, 100); // the backend takes at most 100 per call
      const payload: NewReport[] = batch.map((i) => ({
        client_id: i.client_id,
        description: i.description,
        latitude: i.latitude,
        longitude: i.longitude,
        photo_url: i.photo_url || null,
        ...(i.photo_base64 ? { photo_base64: i.photo_base64 } : {}),
        source: "mesh",
      }));
      const res = await syncReports(payload);

      const failed = new Map<string, string>();
      for (const f of res.details?.failed || []) {
        if (f.client_id) failed.set(f.client_id, (f.errors || []).join("; "));
      }
      const sentIds = new Set(batch.map((i) => i.client_id));
      const remaining = read()
        .filter((i) => !sentIds.has(i.client_id) || failed.has(i.client_id))
        .map((i) => (failed.has(i.client_id) ? { ...i, error: failed.get(i.client_id) } : i));
      write(remaining);
      linkIds(res.reports || []);
      return res;
    } finally {
      flushing = null;
    }
  })();
  return flushing;
}

export function isFlushing() { return flushing !== null; }
