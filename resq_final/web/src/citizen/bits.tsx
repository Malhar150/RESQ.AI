import { useI18n } from "../i18n";
import { flagText } from "../i18n/flags";
import type { Flag, TrustBand } from "../lib/api";

export function TrustMeter({ score, band }: { score: number; band: TrustBand | null }) {
  const { t } = useI18n();
  return (
    <div className="trustmeter" data-band={band ?? "fair"}>
      <span className="num">{score}</span>
      <span className="bar" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={score} aria-label={t("result.trust")}>
        <i style={{ width: `${Math.max(2, Math.min(100, score))}%` }} />
      </span>
      {band && <span className="band">{t(`band.${band}` as const)}</span>}
    </div>
  );
}

export function FlagList({ flags }: { flags: Flag[] }) {
  const { lang } = useI18n();
  return (
    <div className="flags">
      {flags.map((f, i) => {
        const d = Number(f.delta) || 0;
        const { label, detail } = flagText(f, lang);
        return (
          <div key={`${f.code}-${i}`} className="flagrow" data-neg={d < 0} data-zero={d === 0}>
            <b>{label}</b>
            <span className="d">{d > 0 ? "+" : ""}{d}</span>
            {detail && <small>{detail}</small>}
          </div>
        );
      })}
    </div>
  );
}

export function SevTag({ sev }: { sev: string | null | undefined }) {
  const { t } = useI18n();
  if (!sev) return null;
  return <span className="sev" data-sev={sev}>{t(`sev.${sev}` as "sev.high")}</span>;
}
