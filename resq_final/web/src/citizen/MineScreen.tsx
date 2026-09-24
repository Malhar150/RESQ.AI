import { useCallback } from "react";
import { useI18n, LOCALE } from "../i18n";
import { Icon } from "../components/Icon";
import { getReport, ResqError, type Report } from "../lib/api";
import { useMine, usePoll, useTick } from "../lib/hooks";
import { forget, type MineItem } from "../lib/mine";
import { ago, clock, errorText } from "../lib/format";
import { SevTag } from "./bits";

const STEPS = ["pending", "verified", "dispatched", "resolved"] as const;

type Row = { item: MineItem; report: Report | null; gone: boolean };

export default function MineScreen() {
  const { t, lang } = useI18n();
  const mine = useMine();
  useTick();

  const ids = mine.map((m) => `${m.client_id}:${m.id ?? ""}`).join("|");
  const load = useCallback(async (signal: AbortSignal): Promise<Row[]> => {
    const rows = await Promise.all(
      mine.slice(0, 25).map(async (item): Promise<Row> => {
        if (item.id == null) return { item, report: null, gone: false };
        try {
          return { item, report: await getReport(item.id, signal), gone: false };
        } catch (err) {
          if (err instanceof ResqError && err.kind === "notfound") return { item, report: null, gone: true };
          throw err;
        }
      })
    );
    return rows;
  }, [ids]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data, error, loading, updatedAt, refresh } = usePoll(load, 30000, [ids]);

  return (
    <div>
      <div className="c-hero">
        <h1>{t("mine.title")}</h1>
        <p>{t("mine.intro")}</p>
      </div>

      {mine.length === 0 ? (
        <div className="empty"><Icon name="list" /><span>{t("mine.empty")}</span></div>
      ) : (
        <>
          <div className="row" style={{ marginBottom: 12, justifyContent: "space-between" }}>
            <span className="hint" style={{ margin: 0 }}>{updatedAt ? t("mine.updated", { t: clock(updatedAt, LOCALE[lang]) }) : ""}</span>
            <button type="button" className="btn btn--small" onClick={() => refresh()} disabled={loading}>
              {loading ? <span className="spinner" /> : <Icon name="refresh" />}{t("common.refresh")}
            </button>
          </div>

          {error && !data && (
            <div className="errorbox" role="alert" style={{ marginBottom: 12 }}>
              <span>{errorText(error, t)}</span>
            </div>
          )}

          <div className="list">
            {(data ?? mine.map((item) => ({ item, report: null, gone: false }) as Row)).map(({ item, report, gone }) => {
              const status = report?.status ?? null;
              const step = status ? STEPS.indexOf(status as (typeof STEPS)[number]) : -1;
              return (
                <article key={item.client_id} className="item">
                  <div className="item__top">
                    {item.id != null && <span className="mono">#{item.id}</span>}
                    <span>{ago(item.filed_at, t)}</span>
                    {report && <SevTag sev={report.severity} />}
                  </div>
                  <p className="item__text">{item.description}</p>

                  {item.id == null ? (
                    <span className="tag"><Icon name="outbox" />{t("mine.waiting")}</span>
                  ) : gone ? (
                    <span className="tag">{t("mine.gone")}</span>
                  ) : report ? (
                    <div>
                      <span className="statuslabel">{t(`status.${status ?? "pending"}` as "status.pending")}</span>
                      <div className="statusline" data-dismissed={status === "dismissed"}>
                        {STEPS.map((s, i) => <span key={s} data-on={status === "dismissed" ? i === 0 : i <= step} />)}
                      </div>
                    </div>
                  ) : loading && !data ? (
                    <div className="skeleton" style={{ height: 22, width: "60%" }} />
                  ) : null}

                  {(gone || item.id == null) && (
                    <div className="item__foot">
                      <span className="spacer" />
                      {gone && <button type="button" className="btn btn--small btn--ghost" onClick={() => forget(item.client_id)}>{t("mine.forget")}</button>}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
