import { useEffect, useState } from "react";
import { LANGS, LANG_NAMES, useI18n } from "../i18n";
import { apiBase, getHealth, savedApiBase, setApiBase } from "../lib/api";
import { isDemoOffline, setDemoOffline, useBackToClose, useInstallPrompt } from "../lib/hooks";
import { useServer } from "../lib/server";
import { errorText } from "../lib/format";
import { useToast } from "../components/Toast";
import { Icon } from "../components/Icon";

const DEFAULT_API =
  (window as unknown as { RESQ_CONFIG?: { apiBase?: string } }).RESQ_CONFIG?.apiBase ||
  (import.meta.env.VITE_RESQ_API as string | undefined) ||
  "http://localhost:4000";

export default function SettingsSheet({ onClose }: { onClose: () => void }) {
  const { t, lang, setLang } = useI18n();
  const toast = useToast();
  const { recheck } = useServer();
  const [api, setApi] = useState(savedApiBase());
  const [demo, setDemo] = useState(isDemoOffline());
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const { available: canInstall, install } = useInstallPrompt();
  useBackToClose(true, onClose);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const save = () => {
    setApiBase(api.trim());
    if (demo !== isDemoOffline()) setDemoOffline(demo);
    recheck();
    toast(t("settings.saved"), "good");
    onClose();
  };

  const test = async () => {
    const previous = savedApiBase();
    setApiBase(api.trim());
    setTesting(true);
    setTestMsg(null);
    try {
      const h = await getHealth();
      const c = h.features.aiClassifier === "rules-only" ? t("sys.rules") : h.features.aiClassifier;
      setTestMsg({ ok: true, text: t("settings.ok", { c }) });
    } catch (err) {
      setTestMsg({ ok: false, text: `${errorText(err, t)} (${apiBase()})` });
    } finally {
      setApiBase(previous);
      setTesting(false);
    }
  };

  return (
    <div className="sheet-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <h2 id="settings-title">{t("settings.title")}</h2>

        <div className="field">
          <span className="label">{t("settings.lang")}</span>
          <div className="langgrid">
            {LANGS.map((l) => (
              <button key={l} type="button" lang={l} aria-pressed={lang === l} onClick={() => setLang(l)}>
                {LANG_NAMES[l]}
              </button>
            ))}
          </div>
        </div>

        {canInstall && (
          <div className="field">
            <button type="button" className="btn btn--ink btn--block" onClick={install}><Icon name="phone" />{t("settings.install")}</button>
            <p className="hint">{t("settings.installHint")}</p>
          </div>
        )}

        <div className="field">
          <label className="switch">
            <input type="checkbox" checked={demo} onChange={(e) => setDemo(e.target.checked)} />
            <span>
              <b>{t("settings.demoOffline")}</b>
              <span className="hint" style={{ display: "block", marginTop: 2 }}>{t("settings.demoOfflineHint")}</span>
            </span>
          </label>
        </div>

        <div className="field">
          <label htmlFor="api">{t("settings.api")}</label>
          <input id="api" className="input mono" value={api} onChange={(e) => setApi(e.target.value)}
            placeholder={DEFAULT_API} inputMode="url" autoCapitalize="off" autoCorrect="off" spellCheck={false} />
          <p className="hint">{t("settings.apiHint", { d: DEFAULT_API })}</p>
          <div className="row" style={{ marginTop: 8 }}>
            <button type="button" className="btn btn--small" onClick={test} disabled={testing}>
              {testing ? <span className="spinner" /> : null}{t("settings.test")}
            </button>
            {testMsg && <span style={{ fontSize: 14, color: testMsg.ok ? "var(--good)" : "var(--sev-high)" }}>{testMsg.text}</span>}
          </div>
        </div>

        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="btn btn--ghost" onClick={onClose}>{t("common.cancel")}</button>
          <button type="button" className="btn btn--ink" onClick={save}>{t("common.save")}</button>
        </div>
      </div>
    </div>
  );
}
