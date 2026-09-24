/**
 * Reports filed from this phone, so the person can follow what happened to
 * them (pending → verified → dispatched → resolved). Stored on the device only.
 */
import type { Report } from "./api";

export interface MineItem {
  client_id: string;
  id: string | number | null; // null while it is still held in the outbox
  description: string;
  filed_at: string;
}

const KEY = "resq.mine";
const listeners = new Set<() => void>();

function read(): MineItem[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function write(items: MineItem[]) {
  try { localStorage.setItem(KEY, JSON.stringify(items.slice(0, 50))); } catch { /* ignore */ }
  listeners.forEach((fn) => fn());
}

export function getMine(): MineItem[] { return read(); }

export function subscribeMine(fn: () => void) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function remember(item: MineItem) {
  const items = read().filter((i) => i.client_id !== item.client_id);
  write([item, ...items]);
}

/** After a sync, attach server ids to the items that were waiting for one. */
export function linkIds(reports: Report[]) {
  if (!reports?.length) return;
  const byClient = new Map(reports.filter((r) => r.client_id).map((r) => [r.client_id as string, r.id]));
  if (!byClient.size) return;
  const items = read();
  let changed = false;
  const next = items.map((i) => {
    if (i.id == null && byClient.has(i.client_id)) { changed = true; return { ...i, id: byClient.get(i.client_id)! }; }
    return i;
  });
  if (changed) write(next);
}

export function forget(clientId: string) {
  write(read().filter((i) => i.client_id !== clientId));
}
