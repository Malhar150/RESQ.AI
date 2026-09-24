import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import jsQR from "jsqr";
import { useI18n } from "../i18n";
import { Icon } from "../components/Icon";
import { useToast } from "../components/Toast";
import { useOutbox } from "../lib/hooks";
import { getOutbox, hold } from "../lib/outbox";
import { decodeHop, encodeHop } from "../lib/qrhop";

function ShowCode() {
  const { t } = useI18n();
  const items = useOutbox();
  const [index, setIndex] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const item = items[Math.min(index, items.length - 1)];
  const encoded = item ? encodeHop(item) : null;

  useEffect(() => {
    if (index > items.length - 1) setIndex(Math.max(0, items.length - 1));
  }, [items.length, index]);

  useEffect(() => {
    if (!encoded || encoded.tooBig || !canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, [{ data: new TextEncoder().encode(encoded.text), mode: "byte" }], {
      errorCorrectionLevel: "L", margin: 2, width: 600, color: { dark: "#1B1F24", light: "#FFFFFF" },
    }).catch(() => { /* too big — handled by tooBig */ });
  }, [encoded?.text, encoded?.tooBig]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!items.length) {
    return <div className="empty"><Icon name="qr" /><span>{t("relay.noItems")}</span></div>;
  }

  return (
    <div className="qrframe">
      {encoded?.tooBig
        ? <p className="formerror" style={{ textAlign: "center" }}>{t("relay.tooBig")}</p>
        : <canvas ref={canvasRef} aria-label="QR code" />}
      <p className="item__text" style={{ textAlign: "center", fontSize: 14.5, WebkitLineClamp: 2 }}>{item.description}</p>
      <p className="hint" style={{ margin: 0 }}>
        {t("relay.hops", { n: item.hops })}{item.photo_base64 ? ` · ${t("relay.noPhoto")}` : ""}
      </p>
      {items.length > 1 && (
        <div className="qrnav">
          <button type="button" className="btn btn--small" onClick={() => setIndex((i) => Math.max(0, i - 1))} disabled={index === 0}>{t("relay.prev")}</button>
          <span>{t("relay.of", { i: index + 1, n: items.length })}</span>
          <button type="button" className="btn btn--small" onClick={() => setIndex((i) => Math.min(items.length - 1, i + 1))} disabled={index >= items.length - 1}>{t("relay.next")}</button>
        </div>
      )}
    </div>
  );
}

function Scanner() {
  const { t } = useI18n();
  const toast = useToast();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const lastRef = useRef<{ text: string; at: number }>({ text: "", at: 0 });
  const [on, setOn] = useState(false);
  const [error, setError] = useState("");

  const stop = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
    setOn(false);
  }, []);

  useEffect(() => stop, [stop]);

  const handle = useCallback((text: string) => {
    const now = Date.now();
    if (text === lastRef.current.text && now - lastRef.current.at < 4000) return; // same code still in view
    lastRef.current = { text, at: now };
    const hop = decodeHop(text);
    if (!hop) { toast(t("relay.bad"), "bad"); return; }
    if (getOutbox().some((i) => i.client_id === hop.client_id)) { toast(t("relay.already"), "info"); return; }
    hold({ ...hop, origin: "carried" });
    navigator.vibrate?.(80);
    toast(t("relay.gotIt", { n: hop.hops }), "good");
  }, [t, toast]);

  const start = async () => {
    setError("");
    if (!navigator.mediaDevices?.getUserMedia) { setError(t("relay.noCamera")); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      streamRef.current = stream;
      setOn(true);
      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play();
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
      const tick = () => {
        if (!streamRef.current) return;
        if (video.readyState >= 2 && video.videoWidth) {
          const scale = Math.min(1, 640 / video.videoWidth);
          canvas.width = Math.round(video.videoWidth * scale);
          canvas.height = Math.round(video.videoHeight * scale);
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" });
          if (code?.binaryData?.length) {
            handle(new TextDecoder().decode(new Uint8Array(code.binaryData)));
          }
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch {
      stop();
      setError(t("relay.noCamera"));
    }
  };

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div className="scanner" hidden={!on}>
        <video ref={videoRef} playsInline muted />
      </div>
      {on
        ? <button type="button" className="btn btn--block" onClick={stop}><Icon name="x" />{t("relay.stop")}</button>
        : <button type="button" className="btn btn--relay btn--block" onClick={start}><Icon name="scan" />{t("relay.startScan")}</button>}
      {error && <p className="formerror">{error}</p>}
    </div>
  );
}

export default function RelayScreen() {
  const { t } = useI18n();
  return (
    <div>
      <div className="c-hero">
        <h1>{t("relay.title")}</h1>
        <p>{t("relay.intro")}</p>
      </div>
      <div className="hopdiagram" aria-hidden="true">
        <Icon name="phone" /><i /><Icon name="phone" /><i /><Icon name="phone" /><i /><Icon name="tower" />
      </div>

      <section className="block">
        <div className="block__head"><h2>{t("relay.scanTitle")}</h2></div>
        <p className="hint" style={{ marginTop: -6, marginBottom: 12 }}>{t("relay.scanHint")}</p>
        <Scanner />
      </section>

      <section className="block">
        <div className="block__head"><h2>{t("relay.showTitle")}</h2></div>
        <p className="hint" style={{ marginTop: -6, marginBottom: 12 }}>{t("relay.showHint")}</p>
        <ShowCode />
      </section>
    </div>
  );
}
