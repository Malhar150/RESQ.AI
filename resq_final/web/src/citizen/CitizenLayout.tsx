import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import "../styles/citizen.css";
import { useI18n } from "../i18n";
import { Icon, Logo } from "../components/Icon";
import { useToast } from "../components/Toast";
import { canUseNetwork, useNetwork, useOutbox } from "../lib/hooks";
import { flush, getOutbox } from "../lib/outbox";
import { useServer } from "../lib/server";
import SettingsSheet from "./SettingsSheet";
import { apiConfigured } from "../lib/api";

/**
 * Sends the outbox whenever a way out appears: on load, when the browser
 * reports it's back online, and every 30 s while anything is waiting.
 */
function useAutoFlush() {
  const { t } = useI18n();
  const toast = useToast();
  const { recheck } = useServer();
  const running = useRef(false);

  useEffect(() => {
    const attempt = async () => {
      if (running.current || !canUseNetwork()) return;
      if (!getOutbox().some((i) => !i.error)) return;
      running.current = true;
      try {
        const res = await flush();
        if (res && (res.accepted || res.skipped || res.failed)) {
          toast(t("outbox.result", { a: res.accepted, s: res.skipped, f: res.failed }), res.failed ? "info" : "good");
        }
        recheck();
      } catch {
        // Still no way through. The next tick tries again.
      } finally {
        running.current = false;
      }
    };
    attempt();
    const id = window.setInterval(attempt, 30000);
    window.addEventListener("online", attempt);
    return () => { window.clearInterval(id); window.removeEventListener("online", attempt); };
  }, [t, toast, recheck]);
}

export default function CitizenLayout() {
  const { t } = useI18n();
  const { online, demo } = useNetwork();
  const { state } = useServer();
  const outbox = useOutbox();
  const [sheet, setSheet] = useState(false);
  const { pathname } = useLocation();
  const [typing, setTyping] = useState(false);
  useAutoFlush();

  // While the on-screen keyboard is up, the bottom bar and sticky button would
  // eat half the visible space — tuck them away until typing stops.
  useEffect(() => {
    const isField = (el: EventTarget | null) =>
      el instanceof HTMLTextAreaElement ||
      (el instanceof HTMLInputElement && !["checkbox", "radio", "file", "button", "submit"].includes(el.type));
    const onIn = (e: FocusEvent) => { if (isField(e.target)) setTyping(true); };
    const onOut = () => window.setTimeout(() => setTyping(isField(document.activeElement)), 50);
    document.addEventListener("focusin", onIn);
    document.addEventListener("focusout", onOut);
    return () => { document.removeEventListener("focusin", onIn); document.removeEventListener("focusout", onOut); };
  }, []);

  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  useEffect(() => {
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", "#F4F1EA");
    document.title = "RESQ.AI";
  }, []);

  const pill = !online
    ? { s: "offline", label: demo ? t("net.demo") : t("net.offline") }
    : state === "down"
      ? { s: "server", label: t("net.server") }
      : { s: "online", label: t("net.online") };

  return (
    <div className="surface-citizen" data-typing={typing}>
      <div className="c-shell">
        <header className="c-top">
          <Link to="/" className="brand" aria-label="RESQ.AI">
            <Logo />
            <b>RESQ<i>.</i>AI</b>
          </Link>
          <span className="spacer" />
          <span className="netpill" data-state={pill.s} role="status">
            <i />{pill.label}
          </span>
          <button type="button" className="iconbtn" onClick={() => setSheet(true)} aria-label={t("nav.settings")}>
            <Icon name="globe" />
          </button>
        </header>

        {!apiConfigured() && (
          <div className="c-banner" role="alert">
            <Icon name="server" />
            <div>
              {t("net.noServer")}
              <button type="button" className="btn btn--small" style={{ marginTop: 8 }} onClick={() => setSheet(true)}>{t("net.setServer")}</button>
            </div>
          </div>
        )}

        {!online && (
          <div className="c-banner" role="alert">
            <Icon name="wifiOff" />
            <div>
              <b>{demo ? t("net.demo") : t("net.offline")}</b>
              {t("net.offlineBody")}
            </div>
          </div>
        )}

        <main className="c-main">
          <Outlet />
          <p className="c-foot">
            <Link to="/control">{t("nav.control")}</Link>
          </p>
        </main>

        <nav className="c-nav" aria-label="Main">
          <ul>
            <li><NavLink to="/" end><Icon name="alert" />{t("nav.report")}</NavLink></li>
            <li>
              <NavLink to="/outbox">
                <Icon name="outbox" />{t("nav.outbox")}
                {outbox.length > 0 && <span className="badge">{outbox.length}</span>}
              </NavLink>
            </li>
            <li><NavLink to="/relay"><Icon name="relay" />{t("nav.relay")}</NavLink></li>
            <li><NavLink to="/mine"><Icon name="list" />{t("nav.mine")}</NavLink></li>
          </ul>
        </nav>
      </div>
      {sheet && <SettingsSheet onClose={() => setSheet(false)} />}
    </div>
  );
}
