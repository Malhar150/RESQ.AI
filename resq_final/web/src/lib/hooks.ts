import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { getOutbox, subscribeOutbox, type OutboxItem } from "./outbox";
import { getMine, subscribeMine, type MineItem } from "./mine";

/* ---------------------------------------------------------------------------
 * Demo offline switch — makes the app behave exactly as if there were no
 * signal, so the hold-and-relay path can be shown without pulling a cable.
 * ------------------------------------------------------------------------ */
const DEMO_KEY = "resq.demoOffline";
const demoListeners = new Set<() => void>();

export function isDemoOffline(): boolean {
  try { return localStorage.getItem(DEMO_KEY) === "1"; } catch { return false; }
}
export function setDemoOffline(on: boolean) {
  try { if (on) localStorage.setItem(DEMO_KEY, "1"); else localStorage.removeItem(DEMO_KEY); } catch { /* ignore */ }
  demoListeners.forEach((fn) => fn());
  // Let anything listening for connectivity re-check (and flush when it goes back online).
  window.dispatchEvent(new Event(on ? "offline" : "online"));
}

function subscribeNet(fn: () => void) {
  window.addEventListener("online", fn);
  window.addEventListener("offline", fn);
  demoListeners.add(fn);
  return () => {
    window.removeEventListener("online", fn);
    window.removeEventListener("offline", fn);
    demoListeners.delete(fn);
  };
}

/** Real browser connectivity, overridden by the demo switch. */
export function canUseNetwork(): boolean {
  return navigator.onLine !== false && !isDemoOffline();
}

export function useNetwork() {
  const online = useSyncExternalStore(subscribeNet, () => navigator.onLine !== false, () => true);
  const demo = useSyncExternalStore(subscribeNet, isDemoOffline, () => false);
  return { online: online && !demo, browserOnline: online, demo };
}

export function useOutbox(): OutboxItem[] {
  const [items, setItems] = useState(getOutbox);
  useEffect(() => subscribeOutbox(() => setItems(getOutbox())), []);
  return items;
}

export function useMine(): MineItem[] {
  const [items, setItems] = useState(getMine);
  useEffect(() => subscribeMine(() => setItems(getMine())), []);
  return items;
}

/**
 * Poll an async loader. Pauses while the tab is hidden, refreshes as soon as
 * it's visible again, and never lets two requests overlap.
 */
export function usePoll<T>(loader: (signal: AbortSignal) => Promise<T>, intervalMs: number, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const inFlight = useRef<AbortController | null>(null);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  const run = useCallback(async () => {
    if (inFlight.current) return;
    const ctrl = new AbortController();
    inFlight.current = ctrl;
    try {
      const value = await loaderRef.current(ctrl.signal);
      if (!ctrl.signal.aborted) {
        setData(value);
        setError(null);
        setUpdatedAt(new Date());
      }
    } catch (err) {
      if (!ctrl.signal.aborted) setError(err as Error);
    } finally {
      if (inFlight.current === ctrl) inFlight.current = null;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    inFlight.current?.abort();
    inFlight.current = null;
    run();
    const id = window.setInterval(() => { if (document.visibilityState === "visible") run(); }, intervalMs);
    const onVis = () => { if (document.visibilityState === "visible") run(); };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("online", run);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("online", run);
      inFlight.current?.abort();
      inFlight.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalMs, run, ...deps]);

  return { data, error, loading, updatedAt, refresh: run, setData };
}

/** Re-render every `ms` so relative times ("3 min ago") stay honest. */
export function useTick(ms = 30000) {
  const [, set] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => set((n) => n + 1), ms);
    return () => window.clearInterval(id);
  }, [ms]);
}

/**
 * Make the phone's Back button (or browser back) close an overlay — a sheet,
 * a full-screen detail — instead of leaving the page. Pushes one history
 * entry while `open` is true; closing from the UI pops it again.
 */
export function useBackToClose(open: boolean, onClose: () => void) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const marker = `resq-overlay-${Math.random().toString(36).slice(2)}`;
    let pushed = false;
    let popped = false;
    // Deferred so React's dev double-mount doesn't push and pop an extra entry.
    const timer = window.setTimeout(() => {
      window.history.pushState({ ...(window.history.state || {}), [marker]: true }, "");
      pushed = true;
    }, 0);
    const onPop = () => {
      if (!pushed || window.history.state?.[marker]) return;
      popped = true;
      onCloseRef.current();
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("popstate", onPop);
      // Closed from the UI: remove the entry we added so Back isn't "used up".
      if (pushed && !popped && window.history.state?.[marker]) window.history.back();
    };
  }, [open]);
}

/** The browser's "install this app" prompt, captured so we can offer it in Settings. */
type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
let deferredInstall: InstallEvent | null = null;
const installListeners = new Set<() => void>();
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredInstall = e as InstallEvent;
    installListeners.forEach((fn) => fn());
  });
  window.addEventListener("appinstalled", () => { deferredInstall = null; installListeners.forEach((fn) => fn()); });
}

export function useInstallPrompt() {
  const [available, setAvailable] = useState(Boolean(deferredInstall));
  useEffect(() => {
    const fn = () => setAvailable(Boolean(deferredInstall));
    installListeners.add(fn);
    return () => { installListeners.delete(fn); };
  }, []);
  const install = useCallback(async () => {
    if (!deferredInstall) return;
    await deferredInstall.prompt();
    await deferredInstall.userChoice.catch(() => null);
    deferredInstall = null;
    setAvailable(false);
  }, []);
  return { available, install };
}
