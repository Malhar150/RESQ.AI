import { useEffect, useRef, useState } from "react";
import { useI18n } from "../i18n";
import type { Stats } from "../lib/api";

const HIGH = "#EF4E43";
const REST = "#6AA8FF";

/** Arrivals per hour, last 24 h. Stacked: high-severity on the baseline, the rest above it. */
export function Timeline({ stats, height = 180, compact = false }: { stats: Stats; height?: number; compact?: boolean }) {
  const { t } = useI18n();
  const [hover, setHover] = useState<number | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [measured, setMeasured] = useState(720);
  // Draw at the real pixel width so axis text is never stretched on a phone.
  useEffect(() => {
    if (!wrap.current) return;
    const ro = new ResizeObserver(([e]) => { if (e.contentRect.width > 0) setMeasured(Math.round(e.contentRect.width)); });
    ro.observe(wrap.current);
    return () => ro.disconnect();
  }, []);
  const data = stats.timeline;
  const max = Math.max(1, ...data.map((d) => d.total));
  const W = measured;
  const H = height;
  const padL = compact ? 0 : 28;
  const padB = compact ? 0 : 20;
  const plotW = W - padL;
  const plotH = H - padB - (compact ? 0 : 6);
  const slot = plotW / data.length;
  const bw = Math.max(2, slot - (compact ? 2 : 4));
  const y = (v: number) => (plotH * v) / max;
  const ticks = compact ? [] : niceTicks(max);

  return (
    <div className="chartwrap" ref={wrap} onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ height }} role="img"
        aria-label={`${t("an.timeline")}: ${data.map((d) => d.total).join(", ")}`}>
        {ticks.map((v) => (
          <g key={v}>
            <line className="grid" x1={padL} x2={W} y1={plotH - y(v) + 6} y2={plotH - y(v) + 6} />
            <text className="axis" x={padL - 6} y={plotH - y(v) + 10} textAnchor="end">{v}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const x = padL + i * slot + (slot - bw) / 2;
          const base = plotH + (compact ? 0 : 6);
          const hH = y(d.high);
          const rH = y(d.total - d.high);
          return (
            <g key={i}>
              {d.high > 0 && <rect x={x} y={base - hH} width={bw} height={hH} fill={HIGH} rx={compact ? 1 : 2} />}
              {d.total - d.high > 0 && <rect x={x} y={base - hH - rH - (d.high ? 2 : 0)} width={bw} height={rH} fill={REST} rx={compact ? 1 : 2} opacity={hover === null || hover === i ? 1 : .55} />}
              <rect className="hit" x={padL + i * slot} y={0} width={slot} height={H} onMouseEnter={() => setHover(i)} onClick={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={compact ? -1 : 0} />
            </g>
          );
        })}
        {!compact && [23, 18, 12, 6, 0].map((h) => {
          const i = data.findIndex((d) => d.hoursAgo === h);
          if (i < 0) return null;
          return <text key={h} className="axis" x={padL + i * slot + slot / 2} y={H - 4} textAnchor={h === 0 ? "end" : h === 23 ? "start" : "middle"}>{h === 0 ? t("an.now") : `-${h}h`}</text>;
        })}
      </svg>
      {hover !== null && !compact && (
        <div className="k-tip" style={{ left: `${((padL + hover * slot + slot / 2) / W) * 100}%`, top: 0 }}>
          <b>{data[hover].hoursAgo === 0 ? t("an.now") : t("an.hoursAgo", { n: data[hover].hoursAgo })}</b>
          {" · "}{t("an.all")} {data[hover].total} · {t("an.highLine")} {data[hover].high}
        </div>
      )}
    </div>
  );
}

function niceTicks(max: number) {
  const step = max <= 4 ? 1 : max <= 10 ? 2 : max <= 25 ? 5 : Math.ceil(max / 5 / 5) * 5;
  const out: number[] = [];
  for (let v = step; v <= max; v += step) out.push(v);
  return out;
}

function HBars({ rows, colors }: { rows: { key: string; label: string; value: number }[]; colors?: Record<string, string> }) {
  const { t } = useI18n();
  const total = rows.reduce((s, r) => s + r.value, 0);
  if (!total) return <p className="k-note">{t("an.empty")}</p>;
  const max = Math.max(...rows.map((r) => r.value));
  return (
    <div className="hbars">
      {rows.map((r) => (
        <div key={r.key} className="hbar" title={`${r.label}: ${r.value} (${Math.round((r.value / total) * 100)}%)`}>
          <span className="lbl">{r.label}</span>
          <span className="track"><span className="fill" style={{ display: "block", width: `${(r.value / max) * 100}%`, background: colors?.[r.key] }} /></span>
          <span className="val">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

export default function Analytics({ stats }: { stats: Stats | null }) {
  const { t } = useI18n();
  if (!stats) {
    return (
      <div className="k-page"><div className="k-grid">
        {[0, 1, 2, 3].map((i) => <div key={i} className="k-panel"><div className="skeleton" style={{ height: 160 }} /></div>)}
      </div></div>
    );
  }

  const sevRows = (["high", "medium", "low"] as const).map((s) => ({ key: s, label: t(`sev.${s}`), value: stats.bySeverity[s] || 0 }));
  const statusRows = (["pending", "verified", "dispatched", "resolved", "dismissed"] as const)
    .map((s) => ({ key: s, label: t(`status.${s}`), value: stats.byStatus[s] || 0 }));
  const sourceRows = [
    { key: "online", label: t("src.online"), value: stats.bySource.online || 0 },
    { key: "mesh", label: t("src.mesh"), value: stats.bySource.mesh || 0 },
  ];
  const hazardRows = stats.byHazard
    ? Object.entries(stats.byHazard).sort((a, b) => b[1] - a[1])
      .map(([k, v]) => ({ key: k, label: k === "unknown" ? "—" : t(`hazard.${k}` as "hazard.flood"), value: v }))
    : null;
  const trustRows = [
    ...(["strong", "fair", "weak", "suspect"] as const).map((b) => ({ key: b, label: t(`band.${b}`), value: stats.trust[b] || 0 })),
    { key: "unscored", label: t("an.unscored"), value: stats.trust.unscored || 0 },
  ];

  return (
    <div className="k-page">
      <div className="k-grid">
        <section className="k-panel k-panel--wide">
          <h3>{t("an.timeline")}</h3>
          <div className="k-legend-row">
            <span><i style={{ background: HIGH }} />{t("an.highLine")}</span>
            <span><i style={{ background: REST }} />{t("an.all")}</span>
          </div>
          <Timeline stats={stats} />
        </section>
        <section className="k-panel"><h3>{t("an.severity")}</h3>
          <HBars rows={sevRows} colors={{ high: "#EF4E43", medium: "#F08C2E", low: "#E9CF5C" }} /></section>
        <section className="k-panel"><h3>{t("an.status")}</h3><HBars rows={statusRows} /></section>
        <section className="k-panel"><h3>{t("an.hazard")}</h3>
          {hazardRows ? <HBars rows={hazardRows} /> : <p className="k-note">{t("an.noHazard")}</p>}</section>
        <section className="k-panel"><h3>{t("an.source")}</h3><HBars rows={sourceRows} colors={{ mesh: "#6AA8FF", online: "#8A96A6" }} /></section>
        <section className="k-panel"><h3>{t("an.trust")}</h3>
          <HBars rows={trustRows} colors={{ strong: "#4FC08D", fair: "#9CC46A", weak: "#F08C2E", suspect: "#EF4E43", unscored: "#5A6573" }} /></section>
      </div>
    </div>
  );
}
