import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { LOCALE, useI18n, type T } from "../i18n";
import { Icon } from "../components/Icon";
import { HAZARDS, newClientId, postReport, ResqError, type HazardType } from "../lib/api";
import { canUseNetwork } from "../lib/hooks";
import { hold } from "../lib/outbox";
import { remember } from "../lib/mine";
import { photoStorageEnabled, shrinkImage, uploadPhoto } from "../lib/photo";
import { errorText } from "../lib/format";
import type { ResultState } from "./ResultScreen";

const DEMO_LOC = { lat: 26.1445, lng: 91.7362 }; // Guwahati
const PEOPLE = [
  { key: "1", phrase: "1 person" },
  { key: "2–5", phrase: "about 5 people" },
  { key: "6–20", phrase: "about 20 people" },
  { key: "21–50", phrase: "about 50 people" },
  { key: "50+", phrase: "more than 50 people" },
];

/**
 * Build the description the backend classifies. The chips become plain words
 * at the front of the text — in the reporter's own language — so the duty
 * officer reads exactly what the classifier read. Head-counts are written as
 * "N people" because that's the form the classifier's head-count rule reads.
 */
function compose(t: T, hazard: HazardType | null, danger: boolean | null, people: string | null, text: string) {
  const parts: string[] = [];
  if (hazard) parts.push(t(`hazard.${hazard}` as const));
  if (danger) parts.push(t("report.dangerPhrase"));
  const head = parts.join(" — ");
  const count = PEOPLE.find((p) => p.key === people)?.phrase;
  const prefix = head + (count ? ` (${count})` : "");
  const body = text.trim();
  if (prefix && body) return `${prefix}: ${body}`;
  return prefix || body;
}

type SpeechRec = {
  lang: string; continuous: boolean; interimResults: boolean;
  start: () => void; stop: () => void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null; onerror: (() => void) | null;
};

function getSpeech(): (new () => SpeechRec) | null {
  const w = window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

const DRAFT = "resq.draft";

export default function ReportScreen() {
  const { t, lang } = useI18n();
  const navigate = useNavigate();

  const draft = useMemo(() => {
    try { return JSON.parse(sessionStorage.getItem(DRAFT) || "{}"); } catch { return {}; }
  }, []);

  const [hazard, setHazard] = useState<HazardType | null>(draft.hazard ?? null);
  const [danger, setDanger] = useState<boolean | null>(draft.danger ?? null);
  const [people, setPeople] = useState<string | null>(draft.people ?? null);
  const [text, setText] = useState<string>(draft.text ?? "");
  const [lat, setLat] = useState<string>(draft.lat ?? "");
  const [lng, setLng] = useState<string>(draft.lng ?? "");
  const [locMsg, setLocMsg] = useState<string>("");
  const [locating, setLocating] = useState(false);
  const [manual, setManual] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoErr, setPhotoErr] = useState("");
  const [busy, setBusy] = useState<"" | "upload" | "send">("");
  const [slow, setSlow] = useState(false);
  const [error, setError] = useState("");
  const [listening, setListening] = useState(false);
  const recRef = useRef<SpeechRec | null>(null);

  useEffect(() => {
    try { sessionStorage.setItem(DRAFT, JSON.stringify({ hazard, danger, people, text, lat, lng })); } catch { /* ignore */ }
  }, [hazard, danger, people, text, lat, lng]);

  const locate = () => {
    if (!("geolocation" in navigator)) { setLocMsg(t("report.locUnavailable")); setManual(true); return; }
    setLocating(true);
    setLocMsg(t("report.locating"));
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude.toFixed(6));
        setLng(pos.coords.longitude.toFixed(6));
        setLocMsg(t("report.locAccuracy", { m: Math.round(pos.coords.accuracy) }));
        setLocating(false);
      },
      () => { setLocMsg(t("report.locDenied")); setLocating(false); setManual(true); },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
    );
  };

  // If location permission was granted before, fetch a fix straight away.
  useEffect(() => {
    if (lat && lng) return;
    const perms = (navigator as Navigator & { permissions?: Permissions }).permissions;
    perms?.query({ name: "geolocation" as PermissionName }).then((s) => { if (s.state === "granted") locate(); }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const Speech = getSpeech();
  const toggleSpeech = () => {
    if (!Speech) return;
    if (listening) { recRef.current?.stop(); return; }
    try {
      const rec = new Speech();
      rec.lang = LOCALE[lang];
      rec.continuous = true;
      rec.interimResults = false;
      rec.onresult = (e) => {
        let add = "";
        for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) add += e.results[i][0].transcript;
        if (add) setText((prev) => (prev ? `${prev.trimEnd()} ${add.trim()}` : add.trim()));
      };
      rec.onend = () => setListening(false);
      rec.onerror = () => setListening(false);
      recRef.current = rec;
      rec.start();
      setListening(true);
    } catch { setListening(false); }
  };
  useEffect(() => () => recRef.current?.stop(), []);

  const onPhoto = async (file: File | undefined) => {
    setPhotoErr("");
    if (!file) return;
    try { setPhoto(await shrinkImage(file)); } catch { setPhotoErr(t("report.photoError")); }
  };

  const description = compose(t, hazard, danger, people, text);
  const latN = Number(lat);
  const lngN = Number(lng);
  const hasLoc = lat !== "" && lng !== "" && Number.isFinite(latN) && Number.isFinite(lngN);
  const locValid = hasLoc && Math.abs(latN) <= 90 && Math.abs(lngN) <= 180;
  const offline = !canUseNetwork();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (!description.trim()) { setError(t("report.needWhat")); return; }
    if (description.length > 4000) { setError(t("report.tooLong")); return; }
    if (!hasLoc) { setError(t("report.needLoc")); return; }
    if (!locValid) { setError(t("report.badLoc")); return; }

    const client_id = newClientId();
    const base = { client_id, description, latitude: latN, longitude: lngN };

    const holdIt = (photoB64: string | null) => {
      const { item } = hold({ ...base, photo_base64: photoB64 ? shrinkForQueue(photoB64) : null });
      remember({ client_id, id: null, description, filed_at: item.queued_at });
      finish({ kind: "held", item });
    };

    const finish = (state: ResultState) => {
      try { sessionStorage.removeItem(DRAFT); } catch { /* ignore */ }
      navigate("/sent", { state });
    };

    if (!canUseNetwork()) { holdIt(photo); return; }

    let photo_url: string | null = null;
    let photo_base64: string | null = null;
    if (photo) {
      if (photoStorageEnabled) {
        setBusy("upload");
        try { photo_url = await uploadPhoto(photo, client_id); } catch { photo_base64 = photo; }
      } else {
        photo_base64 = photo;
      }
    }

    setBusy("send");
    const slowTimer = window.setTimeout(() => setSlow(true), 8000);
    try {
      const res = await postReport({ ...base, photo_url, photo_base64, source: "online" });
      remember({ client_id, id: res.report.id, description, filed_at: res.report.created_at });
      finish({ kind: "sent", report: res.report, analysis: res.analysis ?? null, duplicate: Boolean(res.duplicate) });
    } catch (err) {
      if (err instanceof ResqError && err.offline) { holdIt(photo); return; }
      setError(errorText(err, t));
    } finally {
      window.clearTimeout(slowTimer);
      setSlow(false);
      setBusy("");
    }
  };

  return (
    <form onSubmit={submit} noValidate>
      <div className="c-hero">
        <h1>{t("report.title")}</h1>
        <p>{t("app.tagline")}</p>
      </div>

      <section className="block" aria-labelledby="q1">
        <div className="block__head"><span className="block__num">1</span><h2 id="q1">{t("report.what")}</h2></div>
        <div className="hazards">
          {HAZARDS.map((h) => (
            <button key={h} type="button" className="hz" aria-pressed={hazard === h} onClick={() => setHazard(hazard === h ? null : h)}>
              <Icon name={h} />
              <span>{t(`hazard.${h}` as const)}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="block" aria-labelledby="q2">
        <div className="block__head"><span className="block__num">2</span><h2 id="q2">{t("report.danger")}</h2></div>
        <div className="choice">
          <button type="button" data-tone="danger" aria-pressed={danger === true} onClick={() => setDanger(danger === true ? null : true)}>
            <span className="dot" />{t("report.dangerYes")}
          </button>
          <button type="button" data-tone="calm" aria-pressed={danger === false} onClick={() => setDanger(danger === false ? null : false)}>
            <span className="dot" />{t("report.dangerNo")}
          </button>
        </div>
        <p className="label" style={{ marginTop: 16 }}>{t("report.people")}</p>
        <div className="chips" style={{ marginTop: 0 }}>
          {PEOPLE.map((p) => (
            <button key={p.key} type="button" className="chip" aria-pressed={people === p.key} onClick={() => setPeople(people === p.key ? null : p.key)}>
              {p.key}
            </button>
          ))}
        </div>
      </section>

      <section className="block" aria-labelledby="q3">
        <div className="block__head"><span className="block__num">3</span><h2 id="q3">{t("report.describe")}</h2></div>
        <div className="textarea-wrap">
          <textarea id="desc" className="textarea" value={text} maxLength={3800}
            onChange={(e) => setText(e.target.value)} placeholder={t("report.placeholder")} aria-describedby="desc-hint" />
          {text.length > 3000 && <span className="count mono">{text.length}/3800</span>}
        </div>
        <p className="hint" id="desc-hint">{t("report.describeHint")}</p>
        {Speech && (
          <button type="button" className="btn btn--small" style={{ marginTop: 10 }} onClick={toggleSpeech} aria-pressed={listening}>
            {listening ? <span className="spinner" /> : <Icon name="mic" />}
            {listening ? t("report.listening") : t("report.speak")}
          </button>
        )}
      </section>

      <section className="block" aria-labelledby="q4">
        <div className="block__head"><span className="block__num">4</span><h2 id="q4">{t("report.location")}</h2></div>
        <div className="loc" data-empty={!hasLoc}>
          <Icon name="pin" />
          <div style={{ flex: 1 }}>
            {hasLoc ? <span className="mono">{latN.toFixed(4)}, {lngN.toFixed(4)}</span> : <span>{t("report.needLoc")}</span>}
            {locMsg && <small>{locMsg}</small>}
          </div>
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <button type="button" className="btn btn--ink" onClick={locate} disabled={locating}>
            {locating ? <span className="spinner" /> : <Icon name="locate" />}{t("report.locate")}
          </button>
          <button type="button" className="linkbtn" onClick={() => setManual((m) => !m)}>{t("report.locManual")}</button>
          <button type="button" className="linkbtn" onClick={() => { setLat(String(DEMO_LOC.lat)); setLng(String(DEMO_LOC.lng)); setLocMsg(""); }}>
            {t("report.demoLoc")}
          </button>
        </div>
        {manual && (
          <div className="row" style={{ marginTop: 10 }}>
            <input className="input mono" inputMode="decimal" aria-label={t("report.lat")} placeholder={t("report.lat")}
              value={lat} onChange={(e) => setLat(e.target.value.trim())} aria-invalid={lat !== "" && !(Math.abs(Number(lat)) <= 90)} />
            <input className="input mono" inputMode="decimal" aria-label={t("report.lng")} placeholder={t("report.lng")}
              value={lng} onChange={(e) => setLng(e.target.value.trim())} aria-invalid={lng !== "" && !(Math.abs(Number(lng)) <= 180)} />
          </div>
        )}
      </section>

      <section className="block" aria-labelledby="q5">
        <div className="block__head"><span className="block__num">5</span><h2 id="q5">{t("report.photo")}</h2></div>
        <div className="photo-pick">
          {photo && <img src={photo} alt="" />}
          <div style={{ display: "grid", gap: 8 }}>
            <label className="btn filebtn">
              <Icon name="camera" />{t("report.addPhoto")}
              <input type="file" accept="image/*" capture="environment" onChange={(e) => { onPhoto(e.target.files?.[0]); e.target.value = ""; }} />
            </label>
            {photo && <button type="button" className="linkbtn" onClick={() => setPhoto(null)}>{t("report.removePhoto")}</button>}
          </div>
        </div>
        {photoErr && <p className="formerror">{photoErr}</p>}
        <p className="hint">{t("report.photoNote")}{!photoStorageEnabled && photo ? ` ${t("report.photoLocal")}` : ""}</p>
      </section>

      {description && (
        <section className="block">
          <p className="preview-label">{t("report.preview")}</p>
          <p className="preview">{description}</p>
        </section>
      )}

      <div className="submitbar">
        <button type="submit" className={`btn btn--huge btn--block ${offline ? "btn--ink" : "btn--signal"}`} disabled={busy !== ""}>
          {busy ? <span className="spinner" /> : <Icon name={offline ? "outbox" : "send"} />}
          {busy === "upload" ? t("report.uploading") : busy === "send" ? t("report.sending") : offline ? t("report.hold") : t("report.send")}
        </button>
        {error && <p className="formerror" role="alert">{error}</p>}
        {slow && <p className="hint" role="status">{t("report.slow")}</p>}
      </div>
    </form>
  );
}

/** Photos held in the outbox live in localStorage, so keep them small. */
function shrinkForQueue(dataUrl: string): string | null {
  return dataUrl.length > 400_000 ? null : dataUrl;
}
