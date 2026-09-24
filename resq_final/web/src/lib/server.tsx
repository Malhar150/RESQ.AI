import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { apiConfigured, getHealth, type Health } from "./api";
import { canUseNetwork } from "./hooks";

type State = "checking" | "up" | "down";
interface Ctx { state: State; health: Health | null; recheck: () => Promise<void> }
const ServerCtx = createContext<Ctx>({ state: "checking", health: null, recheck: async () => {} });

/**
 * Keeps one eye on GET /health. Besides telling the UI whether the backend is
 * reachable, the first call wakes a sleeping Render instance while the person
 * is still typing their report.
 */
export function ServerProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>("checking");
  const [health, setHealth] = useState<Health | null>(null);
  const busy = useRef(false);

  const recheck = useCallback(async () => {
    if (busy.current) return;
    if (!canUseNetwork() || !apiConfigured()) { setState("down"); return; }
    busy.current = true;
    try {
      const h = await getHealth();
      setHealth(h);
      setState("up");
    } catch {
      setState("down");
    } finally {
      busy.current = false;
    }
  }, []);

  useEffect(() => {
    recheck();
    const id = window.setInterval(() => { if (document.visibilityState === "visible") recheck(); }, 30000);
    window.addEventListener("online", recheck);
    window.addEventListener("offline", recheck);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("online", recheck);
      window.removeEventListener("offline", recheck);
    };
  }, [recheck]);

  return <ServerCtx.Provider value={{ state, health, recheck }}>{children}</ServerCtx.Provider>;
}

export const useServer = () => useContext(ServerCtx);
