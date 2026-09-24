/**
 * React hooks for RESQ.AI — optional, but they remove most of the wiring work.
 *
 * Put this next to resq-api.js in your src/ folder.
 *
 *   import { useReports, useStats } from "./useResqData";
 *
 *   function Dashboard() {
 *     const { reports, loading, error, refresh } = useReports({ pollMs: 15000 });
 *     const { stats } = useStats({ pollMs: 15000 });
 *     ...
 *   }
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchReports, fetchStats } from "./resq-api";

/**
 * Live list of reports.
 * @param {object} options { filters, pollMs }
 */
export function useReports({ filters = {}, pollMs = 15000 } = {}) {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Compare by value so a fresh object literal each render doesn't restart polling.
  const filterKey = JSON.stringify(filters);
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  const refresh = useCallback(async () => {
    try {
      const rows = await fetchReports(filtersRef.current);
      setReports(rows);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const tick = () => { if (!cancelled) refresh(); };

    setLoading(true);
    tick();

    if (!pollMs) return () => { cancelled = true; };
    const id = setInterval(tick, pollMs);
    return () => { cancelled = true; clearInterval(id); };
  }, [filterKey, pollMs, refresh]);

  return { reports, loading, error, refresh, setReports };
}

/** Live dashboard counters. */
export function useStats({ pollMs = 15000 } = {}) {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    try {
      setStats(await fetchStats());
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const tick = () => { if (!cancelled) refresh(); };

    tick();
    if (!pollMs) return () => { cancelled = true; };
    const id = setInterval(tick, pollMs);
    return () => { cancelled = true; clearInterval(id); };
  }, [pollMs, refresh]);

  return { stats, error, refresh };
}

/** Whether the browser currently has a connection. Drives the offline banner. */
export function useOnline() {
  const [online, setOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine
  );

  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);

  return online;
}
