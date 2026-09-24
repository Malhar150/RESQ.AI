import { Link, Navigate, useLocation } from "react-router-dom";
import { languageName, useI18n } from "../i18n";
import { Icon } from "../components/Icon";
import { flagsOf, trustBandOf, type Analysis, type Report } from "../lib/api";
import type { OutboxItem } from "../lib/outbox";
import { FlagList, TrustMeter } from "./bits";

export type ResultState =
  | { kind: "sent"; report: Report; analysis: Analysis | null; duplicate: boolean }
  | { kind: "held"; item: OutboxItem };

export default function ResultScreen() {
  const { t } = useI18n();
  const state = useLocation().state as ResultState | null;
  if (!state) return <Navigate to="/" replace />;

  if (state.kind === "held") {
    return (
      <div className="verdict" data-state="held">
        <div className="verdict__band">
          <span className="eyebrow"><Icon name="outbox" />{t("nav.outbox")}</span>
          <h2>{t("result.held")}</h2>
          <p>{t("result.heldBody")}</p>
        </div>
        <div className="verdict__body">
          <div>
            <h3>{t("report.preview")}</h3>
            <p className="reason">{state.item.description}</p>
          </div>
          <div className="actions">
            <Link to="/relay" className="btn btn--relay btn--block"><Icon name="qr" />{t("result.toRelay")}</Link>
            <Link to="/outbox" className="btn btn--block">{t("nav.outbox")}</Link>
            <Link to="/" className="btn btn--ghost btn--block">{t("result.another")}</Link>
          </div>
        </div>
      </div>
    );
  }

  const { report, analysis, duplicate } = state;
  const sev = analysis?.severity ?? report.severity ?? null;
  const hazard = analysis?.hazard_type ?? report.hazard_type ?? null;
  const score = typeof analysis?.trust_score === "number" ? analysis.trust_score : report.trust_score ?? null;
  const band = analysis?.trust_band ?? trustBandOf(score);
  const flags = analysis?.flags ?? flagsOf(report);
  const model = analysis?.model ?? report.ai_model;
  const language = analysis?.language ?? report.language;

  return (
    <div className="verdict" data-sev={sev ?? undefined}>
      <div className="verdict__band">
        <span className="eyebrow"><Icon name="check" />{t("result.received")} · #{report.id}</span>
        <h2>{sev ? t("result.priority", { sev: t(`sev.${sev}` as const) }) : t("sev.none")}</h2>
        {hazard && <p>{t(`hazard.${hazard}` as const)}</p>}
        {duplicate && <p>{t("result.dup")}</p>}
      </div>

      <div className="verdict__body">
        {analysis?.reasoning && (
          <div>
            <h3>{t("result.how")}</h3>
            <p className="reason">{analysis.reasoning}</p>
            <div className="meta">
              {model && <span>{t("result.classifier", { model })}</span>}
              {language && <span>{t("result.lang", { lang: languageName(language) })}</span>}
            </div>
          </div>
        )}

        {typeof score === "number" && (
          <div>
            <h3>{t("result.trust")}</h3>
            <TrustMeter score={score} band={band} />
          </div>
        )}

        {flags.length > 0 && (
          <div>
            <h3>{t("result.signals")}</h3>
            <FlagList flags={flags} />
          </div>
        )}

        <div>
          <h3>{t("result.next")}</h3>
          <p>{t("result.nextBody")}</p>
        </div>

        <div className="actions">
          <Link to="/mine" className="btn btn--ink btn--block">{t("result.track")}</Link>
          <Link to="/" className="btn btn--block">{t("result.another")}</Link>
        </div>
      </div>
    </div>
  );
}
