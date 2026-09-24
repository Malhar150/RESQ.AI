import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useI18n } from "../i18n";
import { Icon, Logo } from "../components/Icon";
import { apiBase, checkAdminKey, savedApiBase, setApiBase } from "../lib/api";
import { errorText } from "../lib/format";
import { useServer } from "../lib/server";

/**
 * The control room's front door. The backend's only credential is ADMIN_KEY,
 * so that is what we ask for — and we check it against the server with a
 * no-op request before letting anyone in. If the server has no key set, we
 * say so plainly and let the officer through in demo mode.
 */
export default function Gate({ onUnlock }: { onUnlock: () => void }) {
  const { t } = useI18n();
  const { state, health, recheck } = useServer();
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [server, setServer] = useState(savedApiBase() || apiBase());

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!key.trim()) return;
    setBusy(true);
    setError("");
    try {
      const ok = await checkAdminKey(key.trim());
      if (ok) onUnlock();
      else setError(t("ctl.gateWrong"));
    } catch (err) {
      setError(errorText(err, t));
    } finally {
      setBusy(false);
    }
  };

  const open = health && !health.features.adminKeySet;

  return (
    <div className="surface-control" style={{ display: "block", height: "auto" }}>
      <div className="k-gate">
        <form className="k-gate__card" onSubmit={submit}>
          <div className="k-brand"><Logo /><div><b>RESQ<i>.</i>AI</b><small>{t("ctl.subtitle")}</small></div></div>
          <h1>{t("ctl.gateTitle")}</h1>

          {state === "down" && (
            <div className="k-error" style={{ margin: 0 }}>
              <span>{apiBase() ? t("ctl.gateUnreachable", { api: apiBase() }) : t("net.noServer")}</span>
              <label className="sr-only" htmlFor="server">{t("settings.api")}</label>
              <input id="server" className="k-input mono" placeholder="https://your-backend.onrender.com" value={server}
                onChange={(e) => setServer(e.target.value)} inputMode="url" autoCapitalize="off" autoCorrect="off" spellCheck={false} />
              <button type="button" className="k-btn" onClick={() => { setApiBase(server.trim()); recheck(); }}><Icon name="refresh" />{t("common.retry")}</button>
            </div>
          )}
          {state === "checking" && <p><span className="spinner" /> {t("common.loading")}</p>}

          {open ? (
            <>
              <div className="k-gate__warn">{t("ctl.gateOpen")}</div>
              <button type="button" className="k-btn k-btn--primary" onClick={onUnlock}>{t("ctl.gateContinue")}</button>
            </>
          ) : state === "up" ? (
            <>
              <p>{t("ctl.gateBody")}</p>
              <label className="sr-only" htmlFor="adminkey">{t("ctl.gateKey")}</label>
              <input id="adminkey" className="k-input" type="password" autoComplete="current-password" placeholder={t("ctl.gateKey")}
                value={key} onChange={(e) => setKey(e.target.value)} autoFocus />
              {error && <p style={{ color: "#FF8A80" }} role="alert">{error}</p>}
              <button type="submit" className="k-btn k-btn--primary" disabled={busy || !key.trim()}>
                {busy ? <><span className="spinner" /> {t("ctl.gateChecking")}</> : <><Icon name="lock" />{t("ctl.gateEnter")}</>}
              </button>
            </>
          ) : null}

          <Link to="/" className="k-btn k-btn--ghost">{t("ctl.citizen")}</Link>
        </form>
      </div>
    </div>
  );
}
