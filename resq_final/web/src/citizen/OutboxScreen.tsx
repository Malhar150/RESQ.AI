import { useState } from "react";
import { Link } from "react-router-dom";
import { useI18n } from "../i18n";
import { Icon } from "../components/Icon";
import { useToast } from "../components/Toast";
import { useNetwork, useOutbox, useTick } from "../lib/hooks";
import { discard, flush } from "../lib/outbox";
import { forget } from "../lib/mine";
import { ago, errorText } from "../lib/format";
import { useServer } from "../lib/server";

export default function OutboxScreen() {
  const { t } = useI18n();
  const toast = useToast();
  const items = useOutbox();
  const { online } = useNetwork();
  const { recheck } = useServer();
  const [sending, setSending] = useState(false);
  useTick();

  const sendNow = async () => {
    setSending(true);
    try {
      const res = await flush();
      if (res) toast(t("outbox.result", { a: res.accepted, s: res.skipped, f: res.failed }), res.failed ? "info" : "good");
      recheck();
    } catch (err) {
      toast(errorText(err, t), "bad");
    } finally {
      setSending(false);
    }
  };

  const remove = (clientId: string, own: boolean) => {
    discard(clientId);
    if (own) forget(clientId);
  };

  const sendable = items.filter((i) => !i.error).length;

  return (
    <div>
      <div className="c-hero">
        <h1>{t("outbox.title")}</h1>
        <p>{t("outbox.intro")}</p>
      </div>

      {items.length === 0 ? (
        <div className="empty">
          <Icon name="outbox" />
          <span>{t("outbox.empty")}</span>
        </div>
      ) : (
        <>
          <div className="row" style={{ marginBottom: 12 }}>
            <button type="button" className="btn btn--signal" onClick={sendNow} disabled={sending || !online || sendable === 0}>
              {sending ? <span className="spinner" /> : <Icon name="send" />}
              {sending ? t("outbox.sending") : `${t("outbox.sendNow")} (${sendable})`}
            </button>
            <Link to="/relay" className="btn btn--relay"><Icon name="qr" />{t("outbox.pass")}</Link>
          </div>
          {!online && <p className="hint" style={{ marginBottom: 12 }}>{t("outbox.offlineNote")}</p>}

          <div className="list">
            {items.map((i) => (
              <article key={i.client_id} className="item" data-error={Boolean(i.error)}>
                <div className="item__top">
                  {i.origin === "carried"
                    ? <span className="tag tag--relay"><Icon name="relay" />{t("outbox.carried", { n: i.hops })}</span>
                    : <span className="tag"><Icon name="phone" />{t("outbox.own")}</span>}
                  {i.photo_base64 && <span className="tag"><Icon name="photo" />{t("outbox.photo")}</span>}
                  <span>{ago(i.queued_at, t)}</span>
                </div>
                <p className="item__text">{i.description}</p>
                {i.error && <span className="tag tag--err">{t("outbox.rejected", { e: i.error })}</span>}
                <div className="item__foot">
                  <span className="mono" style={{ fontSize: 13, color: "var(--ink-3)" }}>
                    {i.latitude.toFixed(3)}, {i.longitude.toFixed(3)}
                  </span>
                  <span className="spacer" />
                  <button type="button" className="btn btn--small btn--ghost" onClick={() => remove(i.client_id, i.origin === "own")}>
                    <Icon name="trash" />{t("outbox.discard")}
                  </button>
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
