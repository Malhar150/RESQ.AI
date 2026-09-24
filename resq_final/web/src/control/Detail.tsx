import { useEffect, useState } from "react";
import { LOCALE, languageName, useI18n } from "../i18n";
import { flagText } from "../i18n/flags";
import { Icon } from "../components/Icon";
import {
  deleteReport, flagsOf, HAZARDS, patchReport, SEVERITIES, trustBandOf,
  type HazardType, type Report, type Severity, type Status,
} from "../lib/api";
import { ago, coords, dateTime, errorText } from "../lib/format";
import { useToast } from "../components/Toast";

const ACTIONS: { status: Status; key: "act.verify" | "act.dispatch" | "act.resolve" | "act.dismiss"; cls: string; icon: string }[] = [
  { status: "verified", key: "act.verify", cls: "k-act--verify", icon: "shield" },
  { status: "dispatched", key: "act.dispatch", cls: "k-act--dispatch", icon: "send" },
  { status: "resolved", key: "act.resolve", cls: "", icon: "check" },
  { status: "dismissed", key: "act.dismiss", cls: "k-act--dismiss", icon: "x" },
];

export default function Detail({
  report, canAct, onChanged, onDeleted, onClose,
}: {
  report: Report;
  canAct: boolean;
  onChanged: (r: Report) => void;
  onDeleted: (id: string) => void;
  onClose: () => void;
}) {
  const { t, lang } = useI18n();
  const toast = useToast();
  const [busy, setBusy] = useState<string>("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => { setConfirmDelete(false); }, [report.id]);

  const flags = flagsOf(report);
  const score = typeof report.trust_score === "number" ? report.trust_score : null;
  const band = report.trust_band ?? trustBandOf(score);
  const status = report.status ?? "pending";

  const change = async (what: string, body: Partial<{ status: Status; severity: Severity; hazard_type: HazardType }>) => {
    setBusy(what);
    try {
      const updated = await patchReport(report.id, body);
      onChanged(updated);
      const label = body.status ? t(`status.${body.status}` as "status.pending")
        : body.severity ? t(`sev.${body.severity}` as "sev.high")
        : body.hazard_type ? t(`hazard.${body.hazard_type}` as "hazard.flood") : "";
      toast(t("detail.updated", { id: report.id, what: label }), "good");
    } catch (err) {
      toast(errorText(err, t), "bad");
    } finally {
      setBusy("");
    }
  };

  const remove = async () => {
    setBusy("delete");
    try {
      await deleteReport(report.id);
      toast(t("detail.deleted", { id: report.id }), "good");
      onDeleted(String(report.id));
    } catch (err) {
      toast(errorText(err, t), "bad");
      setBusy("");
    }
  };

  const hasCoords = typeof report.latitude === "number" && typeof report.longitude === "number";

  return (
    <div className="k-detail__inner">
      <div className="k-detail__head">
        <button type="button" className="k-btn k-btn--ghost" onClick={onClose} aria-label={t("detail.close")}><Icon name="arrowLeft" /></button>
        {report.severity && <span className="sev" data-sev={report.severity}>{t(`sev.${report.severity}` as "sev.high")}</span>}
        {report.hazard_type && <span className="k-tag"><Icon name={report.hazard_type} />{t(`hazard.${report.hazard_type}` as "hazard.flood")}</span>}
        {report.source === "mesh" && <span className="k-tag k-tag--mesh"><Icon name="relay" />{t("src.mesh")}</span>}
        <span className="id mono">#{report.id}</span>
      </div>

      <p className="k-detail__text">{report.description}</p>
      {report.photo_url && (
        <a href={report.photo_url} target="_blank" rel="noreferrer">
          <img className="k-detail__photo" src={report.photo_url} alt={`Photo attached to report ${report.id}`} loading="lazy"
            onError={(e) => { (e.currentTarget.parentElement as HTMLElement).style.display = "none"; }} />
        </a>
      )}

      <section className="k-section">
        <h4>{t("detail.actions")} · <span className={`k-status-tag`} data-status={status}>{t(`status.${status}` as "status.pending")}</span></h4>
        <div className="k-actions">
          {ACTIONS.map((a) => (
            <button key={a.status} type="button" className={`k-act ${a.cls}`} data-current={status === a.status}
              disabled={!canAct || busy !== "" || status === a.status} onClick={() => change(a.status, { status: a.status })}>
              {busy === a.status ? <span className="spinner" /> : <Icon name={a.icon} width={15} height={15} />}{t(a.key)}
            </button>
          ))}
        </div>
        {status !== "pending" && (
          <button type="button" className="k-btn k-btn--ghost" style={{ marginTop: 6 }} disabled={!canAct || busy !== ""}
            onClick={() => change("pending", { status: "pending" })}>
            <Icon name="refresh" />{t("act.reopen")}
          </button>
        )}
        {!canAct && <p className="k-note" style={{ marginTop: 6 }}>{t("detail.locked")}</p>}
      </section>

      <section className="k-section">
        <h4>{t("detail.correct")}</h4>
        <div className="k-correct">
          <label>{t("detail.severity")}
            <select className="k-select" value={report.severity ?? ""} disabled={!canAct || busy !== ""}
              onChange={(e) => change("severity", { severity: e.target.value as Severity })}>
              {!report.severity && <option value="">—</option>}
              {SEVERITIES.map((s) => <option key={s} value={s}>{t(`sev.${s}` as "sev.high")}</option>)}
            </select>
          </label>
          <label>{t("detail.hazard")}
            <select className="k-select" value={report.hazard_type ?? ""} disabled={!canAct || busy !== "" || report.hazard_type === undefined}
              onChange={(e) => change("hazard", { hazard_type: e.target.value as HazardType })}>
              {!report.hazard_type && <option value="">—</option>}
              {HAZARDS.map((h) => <option key={h} value={h}>{t(`hazard.${h}` as "hazard.flood")}</option>)}
            </select>
          </label>
        </div>
      </section>

      <section className="k-section">
        <h4>{t("detail.trustWhy", { s: score ?? t("detail.unscored") })}</h4>
        {score !== null && (
          <div className="k-trustbig" data-band={band ?? "fair"}>
            <b>{score}</b>
            <span className="bar"><i style={{ width: `${Math.max(2, score)}%` }} /></span>
            {band && <span>{t(`band.${band}` as "band.fair")}</span>}
          </div>
        )}
        {flags.length ? (
          <div className="k-flags">
            {flags.map((f, i) => {
              const d = Number(f.delta) || 0;
              const { label, detail } = flagText(f, lang);
              return (
                <div key={`${f.code}-${i}`} className="k-flag" data-neg={d < 0} data-zero={d === 0}>
                  <span>{label}</span><span className="d">{d > 0 ? "+" : ""}{d}</span>
                  {detail && <small>{detail}</small>}
                </div>
              );
            })}
          </div>
        ) : <p className="k-note">{t("detail.noFlags")}</p>}
      </section>

      <section className="k-section">
        <h4>{t("detail.record")}</h4>
        <dl className="k-kv">
          <dt>{t("detail.filed")}</dt><dd>{dateTime(report.created_at, LOCALE[lang])} · {ago(report.created_at, t)}</dd>
          <dt>{t("detail.arrived")}</dt><dd>{report.source === "mesh" ? t("src.mesh") : t("src.online")}</dd>
          <dt>{t("detail.position")}</dt>
          <dd className="mono">
            {coords(report, 5)}
            {hasCoords && (
              <> · <a href={`https://www.google.com/maps?q=${report.latitude},${report.longitude}`} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>{t("detail.openMap")}</a></>
            )}
          </dd>
          {report.language && <><dt>{t("detail.language")}</dt><dd>{languageName(report.language)}</dd></>}
          {report.ai_model && (
            <><dt>{t("detail.model")}</dt><dd className="mono">{report.ai_model}{typeof report.ai_confidence === "number" ? ` · ${t("detail.confidence", { p: Math.round(report.ai_confidence * 100) })}` : ""}</dd></>
          )}
          {report.verified_at && <><dt>{t("detail.verifiedAt")}</dt><dd>{dateTime(report.verified_at, LOCALE[lang])}</dd></>}
          {report.photo_hash && <><dt>{t("detail.photoPrint")}</dt><dd className="mono">{report.photo_hash}</dd></>}
        </dl>
      </section>

      <section className="k-section">
        {confirmDelete ? (
          <div className="k-confirm" role="alertdialog" aria-label={t("detail.delete")}>
            <span>{t("detail.deleteConfirm")}</span>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" className="k-btn k-btn--danger" onClick={remove} disabled={busy !== ""}>
                {busy === "delete" ? <span className="spinner" /> : <Icon name="trash" />}{t("common.delete")}
              </button>
              <button type="button" className="k-btn" onClick={() => setConfirmDelete(false)}>{t("common.cancel")}</button>
            </div>
          </div>
        ) : (
          <button type="button" className="k-btn k-btn--danger" disabled={!canAct || busy !== ""} onClick={() => setConfirmDelete(true)}>
            <Icon name="trash" />{t("detail.delete")}
          </button>
        )}
      </section>
    </div>
  );
}
