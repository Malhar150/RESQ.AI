import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import "../styles/control.css";
import { LANGS, LANG_NAMES, LOCALE, useI18n, type Lang } from "../i18n";
import { Icon, Logo } from "../components/Icon";
import {
  adminKey, apiBase, getReports, getStats, HAZARDS, setAdminKey, trustBandOf,
  type Report, type ReportFilters,
} from "../lib/api";
import { useBackToClose, usePoll, useTick } from "../lib/hooks";
import { ago, byLeastTrusted, byNewest, byPriority, clock, errorText } from "../lib/format";
import { useServer } from "../lib/server";
import Gate from "./Gate";
import MapView from "./MapView";
import Detail from "./Detail";
import Analytics, { Timeline } from "./Analytics";

type Tab = "live" | "analytics" | "system";
type Sort = "priority" | "newest" | "trust";

const UNLOCK = "resq.ctlUnlocked";
const SOUND = "resq.ctlSound";

function toggle<T>(list: T[], v: T): T[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

/** A short two-tone alert, built in the browser — no audio file to load. */
function beep(ctx: AudioContext) {
  const now = ctx.currentTime;
  [880, 660].forEach((f, i) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, now + i * 0.18);
    g.gain.exponentialRampToValueAtTime(0.18, now + i * 0.18 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.18 + 0.16);
    o.connect(g).connect(ctx.destination);
    o.start(now + i * 0.18);
    o.stop(now + i * 0.18 + 0.17);
  });
}

export default function ControlRoom() {
  const { health } = useServer();
  const [unlocked, setUnlocked] = useState(() => {
    try { return sessionStorage.getItem(UNLOCK) === "1" || Boolean(adminKey()); } catch { return false; }
  });

  useEffect(() => {
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", "#151A21");
  }, []);

  // A server with no ADMIN_KEY lets actions through; a server with one needs it.
  const canAct = Boolean(health && (!health.features.adminKeySet || adminKey()));

  if (!unlocked) {
    return <Gate onUnlock={() => { try { sessionStorage.setItem(UNLOCK, "1"); } catch { /* ignore */ } setUnlocked(true); }} />;
  }
  return <Room canAct={canAct} onLock={() => {
    setAdminKey("");
    try { sessionStorage.removeItem(UNLOCK); } catch { /* ignore */ }
    setUnlocked(false);
  }} />;
}

function Room({ canAct, onLock }: { canAct: boolean; onLock: () => void }) {
  const { t, lang, setLang } = useI18n();
  const { state: serverState, health, recheck } = useServer();
  const [tab, setTab] = useState<Tab>("live");
  const [view, setView] = useState<"list" | "map">("list");
  const [sev, setSev] = useState<string[]>([]);
  const [status, setStatus] = useState<string[]>([]);
  const [source, setSource] = useState<string[]>([]);
  const [hazard, setHazard] = useState<string>("");
  const [q, setQ] = useState("");
  const [qDebounced, setQDebounced] = useState("");
  const [sort, setSort] = useState<Sort>("priority");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [sound, setSound] = useState(() => { try { return localStorage.getItem(SOUND) === "1"; } catch { return false; } });
  const audio = useRef<AudioContext | null>(null);
  const seen = useRef<Set<string> | null>(null);
  const [now, setNow] = useState(new Date());
  useTick(30000);

  useEffect(() => { const id = window.setInterval(() => setNow(new Date()), 1000); return () => window.clearInterval(id); }, []);
  useEffect(() => { const id = window.setTimeout(() => setQDebounced(q.trim()), 350); return () => window.clearTimeout(id); }, [q]);
  useEffect(() => { document.title = `${t("ctl.title")} · RESQ.AI`; }, [t]);

  const filters: ReportFilters = useMemo(() => ({
    severity: sev, status, source, hazard_type: hazard ? [hazard] : [], q: qDebounced, limit: 500,
  }), [sev, status, source, hazard, qDebounced]);
  const filterKey = JSON.stringify(filters);

  const reportsPoll = usePoll((signal) => getReports(filters, signal), 10000, [filterKey]);
  const statsPoll = usePoll((signal) => getStats(signal), 15000);

  // Spot arrivals since the last poll so they flash and (optionally) chime.
  useEffect(() => {
    const rows = reportsPoll.data;
    if (!rows) return;
    const ids = new Set(rows.map((r) => String(r.id)));
    if (seen.current) {
      const arrived = rows.filter((r) => !seen.current!.has(String(r.id)));
      if (arrived.length) {
        setFresh(new Set(arrived.map((r) => String(r.id))));
        if (sound && audio.current && arrived.some((r) => r.severity === "high")) {
          try { beep(audio.current); } catch { /* ignore */ }
        }
        statsPoll.refresh();
      }
    }
    seen.current = seen.current ? new Set([...seen.current, ...ids]) : ids;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportsPoll.data]);

  // Changing filters shouldn't count the newly visible rows as "arrivals".
  useEffect(() => { seen.current = null; }, [filterKey]);

  const reports = useMemo(() => {
    const rows = [...(reportsPoll.data ?? [])];
    rows.sort(sort === "newest" ? byNewest : sort === "trust" ? byLeastTrusted : byPriority);
    return rows;
  }, [reportsPoll.data, sort]);

  const selected = reports.find((r) => String(r.id) === selectedId) ?? null;
  // On a phone the detail is a full-screen sheet: the Back button should close it.
  useBackToClose(Boolean(selected), () => setSelectedId(null));

  const replace = useCallback((r: Report) => {
    reportsPoll.setData((rows) => (rows ?? []).map((x) => (String(x.id) === String(r.id) ? r : x)));
    statsPoll.refresh();
  }, [reportsPoll, statsPoll]);

  const removeRow = useCallback((id: string) => {
    reportsPoll.setData((rows) => (rows ?? []).filter((x) => String(x.id) !== id));
    setSelectedId(null);
    statsPoll.refresh();
  }, [reportsPoll, statsPoll]);

  const sevLabel = useCallback((s: string) => t(`sev.${s}` as "sev.high"), [t]);

  const setSoundOn = (on: boolean) => {
    setSound(on);
    try { if (on) localStorage.setItem(SOUND, "1"); else localStorage.removeItem(SOUND); } catch { /* ignore */ }
    if (on && !audio.current) {
      try { audio.current = new AudioContext(); beep(audio.current); } catch { /* no audio */ }
    }
  };
  // Browsers only allow audio after a click, so re-arm the context on the first interaction.
  useEffect(() => {
    if (!sound || audio.current) return;
    const arm = () => { try { audio.current = new AudioContext(); } catch { /* ignore */ } };
    window.addEventListener("pointerdown", arm, { once: true });
    return () => window.removeEventListener("pointerdown", arm);
  }, [sound]);

  const stats = statsPoll.data;
  const anyFilter = sev.length || status.length || source.length || hazard || q;

  return (
    <div className="surface-control">
      <header className="k-top">
        <div className="k-brand">
          <Logo />
          <div><b>RESQ<i>.</i>AI</b><small>{t("ctl.subtitle")}</small></div>
        </div>
        <nav className="k-tabs" role="tablist">
          {([["live", "map", t("tab.live")], ["analytics", "chart", t("tab.analytics")], ["system", "server", t("tab.system")]] as const).map(([k, icon, label]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}><Icon name={icon} />{label}</button>
          ))}
        </nav>
        <span className="spacer" />
        <div className="k-status">
          <span className="k-dot" data-state={serverState}><i />
            <span className="hide-sm">{serverState === "up" ? t("sys.connected") : serverState === "down" ? t("sys.unreachable") : t("common.loading")}</span>
          </span>
          <span className="mono hide-sm">{clock(now, LOCALE[lang])}</span>
          <select className="k-select k-lang" value={lang} onChange={(e) => setLang(e.target.value as Lang)} aria-label={t("settings.lang")}>
            {LANGS.map((l) => <option key={l} value={l}>{LANG_NAMES[l]}</option>)}
          </select>
          <Link to="/" className="k-btn hide-sm">{t("ctl.citizen")}</Link>
          <button type="button" className="k-btn" onClick={onLock}><Icon name="lock" />{t("ctl.lock")}</button>
        </div>
      </header>

      <div className="k-kpis" aria-live="polite">
        <Kpi k={t("kpi.openHigh")} v={stats?.openHigh} alarm={(stats?.openHigh ?? 0) > 0} />
        <Kpi k={t("kpi.lastHour")} v={stats?.lastHour} />
        <Kpi k={t("kpi.last24")} v={stats?.last24h} />
        <Kpi k={t("kpi.total")} v={stats?.total} />
        <Kpi k={t("kpi.verified")} v={stats?.verified} />
        <Kpi k={t("kpi.mesh")} v={stats?.viaMesh} mesh />
        <Kpi k={t("kpi.suspect")} v={stats?.trust?.suspect} />
        <div className="kpi kpi--spark">
          <div className="kpi__k">{t("an.timeline")}</div>
          {stats ? <Timeline stats={stats} height={36} compact /> : <div className="skeleton" style={{ height: 36 }} />}
        </div>
      </div>

      {tab === "live" && (
        <div className="k-livewrap">
          <div className="k-mobiletabs">
            <button type="button" aria-pressed={view === "list"} onClick={() => setView("list")}>{t("feed.showList")}</button>
            <button type="button" aria-pressed={view === "map"} onClick={() => setView("map")}>{t("feed.showMap")}</button>
          </div>
          <div className="k-live" data-detail={Boolean(selected)} data-view={view}>
            <section className="k-feed" aria-label={t("tab.live")}>
              <div className="k-filters" data-open={showFilters}>
                <div className="k-searchrow">
                  <div className="k-search">
                    <Icon name="scan" />
                    <input className="k-input" type="search" placeholder={t("filter.search")} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t("filter.search")} />
                  </div>
                  <button type="button" className="k-btn k-filtertoggle" aria-expanded={showFilters} onClick={() => setShowFilters((v) => !v)}>
                    <Icon name="list" />{t("filter.title")}{(sev.length + status.length + source.length + (hazard ? 1 : 0)) ? ` · ${sev.length + status.length + source.length + (hazard ? 1 : 0)}` : ""}
                  </button>
                </div>
                <div className="k-chiprow k-collapsible" role="group" aria-label={t("filter.severity")}>
                  {(["high", "medium", "low"] as const).map((s) => (
                    <button key={s} type="button" className="k-chip" data-sev={s} aria-pressed={sev.includes(s)} onClick={() => setSev(toggle(sev, s))}><i />{t(`sev.${s}`)}</button>
                  ))}
                  <button type="button" className="k-chip" aria-pressed={source.includes("mesh")} onClick={() => setSource(toggle(source, "mesh"))}>{t("src.mesh")}</button>
                </div>
                <div className="k-chiprow k-collapsible" role="group" aria-label={t("filter.status")}>
                  {(["pending", "verified", "dispatched", "resolved", "dismissed"] as const).map((s) => (
                    <button key={s} type="button" className="k-chip" aria-pressed={status.includes(s)} onClick={() => setStatus(toggle(status, s))}>{t(`status.${s}`)}</button>
                  ))}
                </div>
                <div className="k-feedbar k-collapsible">
                  <select className="k-select" value={hazard} onChange={(e) => setHazard(e.target.value)} aria-label={t("filter.hazard")}>
                    <option value="">{t("filter.hazard")}: —</option>
                    {HAZARDS.map((h) => <option key={h} value={h}>{t(`hazard.${h}` as "hazard.flood")}</option>)}
                  </select>
                  <select className="k-select" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label={t("filter.sort")}>
                    <option value="priority">{t("sort.priority")}</option>
                    <option value="newest">{t("sort.newest")}</option>
                    <option value="trust">{t("sort.trust")}</option>
                  </select>
                  <span className="spacer" />
                  {anyFilter ? <button type="button" className="k-btn k-btn--ghost" style={{ minHeight: 28 }} onClick={() => { setSev([]); setStatus([]); setSource([]); setHazard(""); setQ(""); }}>{t("filter.clear")}</button> : null}
                </div>
                <div className="k-feedbar">
                  <span>{reportsPoll.data ? t("feed.count", { n: reports.length }) : ""}</span>
                  {fresh.size > 0 && <button type="button" className="k-newpill" onClick={() => setFresh(new Set())}>{t("feed.new", { n: fresh.size })}</button>}
                  <span className="spacer" />
                  {reportsPoll.updatedAt && <span className="mono">{clock(reportsPoll.updatedAt, LOCALE[lang])}</span>}
                  <button type="button" className="k-btn k-btn--ghost" style={{ minHeight: 28, padding: "0 6px" }} onClick={() => { reportsPoll.refresh(); statsPoll.refresh(); recheck(); }} aria-label={t("common.refresh")}>
                    <Icon name="refresh" />
                  </button>
                </div>
              </div>

              <div className="k-list" role="list">
                {reportsPoll.error && (
                  <div className="k-error" role="alert">
                    <span>{errorText(reportsPoll.error, t)}</span>
                    <button type="button" className="k-btn" onClick={() => reportsPoll.refresh()}><Icon name="refresh" />{t("common.retry")}</button>
                  </div>
                )}
                {!reportsPoll.data && reportsPoll.loading && Array.from({ length: 6 }, (_, i) => (
                  <div key={i} style={{ padding: 12, borderBottom: "1px solid var(--line)" }}>
                    <div className="skeleton" style={{ height: 14, width: "40%", marginBottom: 8 }} />
                    <div className="skeleton" style={{ height: 14, width: "90%" }} />
                  </div>
                ))}
                {reportsPoll.data && reports.length === 0 && (
                  <div className="k-empty"><Icon name="list" /><span>{anyFilter ? t("feed.empty") : t("feed.none")}</span></div>
                )}
                {reports.map((r) => (
                  <Card key={r.id} r={r} selected={String(r.id) === selectedId} fresh={fresh.has(String(r.id))}
                    onClick={() => setSelectedId(String(r.id) === selectedId ? null : String(r.id))} />
                ))}
              </div>
            </section>

            <MapView reports={reports} selectedId={selectedId} onSelect={setSelectedId} sevLabel={sevLabel} />

            <aside className="k-detail" hidden={!selected} aria-label="Report detail">
              {selected
                ? <Detail report={selected} canAct={canAct} onChanged={replace} onDeleted={removeRow} onClose={() => setSelectedId(null)} />
                : <div className="k-placeholder">{t("detail.none")}</div>}
            </aside>
          </div>
        </div>
      )}

      {tab === "analytics" && (
        statsPoll.error && !stats
          ? <div className="k-page"><div className="k-error">{errorText(statsPoll.error, t)}</div></div>
          : <Analytics stats={stats} />
      )}

      {tab === "system" && (
        <div className="k-page">
          <div className="k-grid">
            <section className="k-panel">
              <h3>{t("sys.backend")}</h3>
              <table className="k-table"><tbody>
                <tr><td>{t("sys.address")}</td><td className="mono">{apiBase()}</td></tr>
                <tr><td>{t("sys.backend")}</td><td className={serverState === "up" ? "ok" : "warn"}>{serverState === "up" ? t("sys.connected") : t("sys.unreachable")}</td></tr>
                {health && <>
                  <tr><td>{t("sys.classifier")}</td><td className="mono">{health.features.aiClassifier === "rules-only" ? t("sys.rules") : health.features.aiClassifier}</td></tr>
                  <tr><td>{t("sys.photo")}</td><td className={health.features.photoHashing ? "ok" : "warn"}>{health.features.photoHashing ? t("sys.on") : t("sys.off")} · {t("sys.threshold", { n: health.features.phashThreshold })}</td></tr>
                  <tr><td>{t("sys.schema")}</td><td className={health.features.schemaUpgraded ? "ok" : "warn"}>{health.features.schemaUpgraded ? t("sys.upgraded") : t("sys.basic")}</td></tr>
                  <tr><td>{t("sys.adminKey")}</td><td className={health.features.adminKeySet ? "ok" : "warn"}>{health.features.adminKeySet ? t("sys.set") : t("sys.notSet")}</td></tr>
                  <tr><td>{t("sys.uptime")}</td><td className="mono">{formatUptime(health.uptimeSeconds)}</td></tr>
                  <tr><td /><td className="k-note">{t("sys.updated", { t: clock(new Date(health.time), LOCALE[lang]) })}</td></tr>
                </>}
              </tbody></table>
              <button type="button" className="k-btn" style={{ marginTop: 12 }} onClick={() => recheck()}><Icon name="refresh" />{t("common.refresh")}</button>
            </section>
            <section className="k-panel">
              <h3>{t("nav.settings")}</h3>
              <label className="k-switch"><input type="checkbox" checked={sound} onChange={(e) => setSoundOn(e.target.checked)} /><Icon name="bell" width={16} height={16} />{t("sys.sound")}</label>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}

function formatUptime(s: number) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m ${s % 60}s`;
}

function Kpi({ k, v, alarm, mesh }: { k: string; v: number | undefined; alarm?: boolean; mesh?: boolean }) {
  return (
    <div className={`kpi${alarm ? " kpi--alarm" : ""}${mesh ? " kpi--mesh" : ""}`}>
      <div className="kpi__k" title={k}>{k}</div>
      <div className="kpi__v">{v ?? <span className="skeleton" style={{ display: "inline-block", width: 36, height: 24 }} />}</div>
    </div>
  );
}

function Card({ r, selected, fresh, onClick }: { r: Report; selected: boolean; fresh: boolean; onClick: () => void }) {
  const { t } = useI18n();
  const band = r.trust_band ?? trustBandOf(r.trust_score);
  const closed = r.status === "resolved" || r.status === "dismissed";
  return (
    <button type="button" role="listitem" className="k-card" data-sev={r.severity ?? ""} aria-current={selected} data-fresh={fresh} data-closed={closed} onClick={onClick}>
      <span className="k-card__edge" />
      <span className="k-card__body">
        <span className="k-card__top">
          {r.severity && <span className="sev" data-sev={r.severity}>{t(`sev.${r.severity}` as "sev.high")}</span>}
          {r.hazard_type && <span className="k-tag"><Icon name={r.hazard_type} />{t(`hazard.${r.hazard_type}` as "hazard.flood")}</span>}
          <span className="k-status-tag" data-status={r.status ?? "pending"}>{t(`status.${r.status ?? "pending"}` as "status.pending")}</span>
          <span className="time">{ago(r.created_at, t)}</span>
        </span>
        <span className="k-card__text">{r.description}</span>
        <span className="k-card__meta">
          {r.source === "mesh" ? <span className="k-tag k-tag--mesh"><Icon name="relay" />{t("src.mesh")}</span> : <span>{t("src.online")}</span>}
          {typeof r.trust_score === "number" && band && (
            <span className="k-trust" data-band={band} title={`${t("result.trust")} ${r.trust_score}/100`}>
              <b>{r.trust_score}</b><span><i style={{ width: `${r.trust_score}%` }} /></span>{t(`band.${band}` as "band.fair")}
            </span>
          )}
          {r.photo_url && <Icon name="photo" width={14} height={14} />}
          <span className="mono">#{r.id}</span>
        </span>
      </span>
    </button>
  );
}
