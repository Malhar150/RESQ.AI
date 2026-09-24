import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useI18n } from "../i18n";
import { Icon } from "../components/Icon";
import { IS_DEMO, type Report } from "../lib/api";

const SEV = {
  high: { color: "#EF4E43", r: 10 },
  medium: { color: "#F08C2E", r: 7.5 },
  low: { color: "#E9CF5C", r: 5.5 },
} as const;
const NONE = { color: "#8A96A6", r: 5 };

/** Reference points drawn when map tiles can't load (venue Wi-Fi, no network). */
const CITIES: [string, number, number][] = [
  ["Guwahati", 26.1445, 91.7362], ["Dibrugarh", 27.4728, 94.912], ["Silchar", 24.8333, 92.7789],
  ["Jorhat", 26.7509, 94.2037], ["Tezpur", 26.6528, 92.7926], ["Shillong", 25.5788, 91.8933],
  ["Imphal", 24.817, 93.9368], ["Kohima", 25.6751, 94.1086], ["Aizawl", 23.7271, 92.7176],
  ["Agartala", 23.8315, 91.2868], ["Itanagar", 27.0844, 93.6053], ["Gangtok", 27.3389, 88.6065],
  ["Siliguri", 26.7271, 88.3953], ["Kolkata", 22.5726, 88.3639], ["Patna", 25.5941, 85.1376],
  ["Bhubaneswar", 20.2961, 85.8245], ["Delhi", 28.6139, 77.209], ["Mumbai", 19.076, 72.8777],
  ["Chennai", 13.0827, 80.2707], ["Bengaluru", 12.9716, 77.5946], ["Hyderabad", 17.385, 78.4867],
];

const DEFAULT_VIEW: [number, number, number] = [26.2, 92.9, 7]; // Assam

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

export default function MapView({
  reports, selectedId, onSelect, sevLabel,
}: {
  reports: Report[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  sevLabel: (s: string) => string;
}) {
  const { t } = useI18n();
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.FeatureGroup | null>(null);
  const fallback = useRef<L.LayerGroup | null>(null);
  const fitted = useRef(false);
  const [offline, setOffline] = useState(false);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const reportsRef = useRef(reports);
  reportsRef.current = reports;

  /** Frame every report — but only once the map is actually on screen with a size. */
  const fitIfReady = (m: L.Map) => {
    if (fitted.current || !el.current || el.current.clientWidth < 10 || el.current.clientHeight < 10) return;
    const pts = reportsRef.current
      .filter((r) => typeof r.latitude === "number" && typeof r.longitude === "number")
      .map((r) => [r.latitude, r.longitude] as [number, number]);
    if (!pts.length) return;
    fitted.current = true;
    m.fitBounds(L.latLngBounds(pts).pad(0.2), { maxZoom: 10 });
  };

  // Create the map once.
  useEffect(() => {
    if (!el.current || map.current) return;
    const m = L.map(el.current, { zoomControl: true, preferCanvas: true, worldCopyJump: false, minZoom: 3, maxZoom: 18 })
      .setView([DEFAULT_VIEW[0], DEFAULT_VIEW[1]], DEFAULT_VIEW[2]);
    map.current = m;

    let loaded = 0;
    let failed = 0;
    const tiles = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18, subdomains: "abc", crossOrigin: true,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>',
    });
    // If tiles can't be fetched (venue Wi-Fi, no network), stop asking for
    // them and draw a coordinate grid instead, so the map keeps working.
    const giveUp = () => {
      if (loaded > 0) return;
      setOffline(true);
      if (m.hasLayer(tiles)) m.removeLayer(tiles);
    };
    tiles.on("tileload", () => { loaded++; setOffline(false); });
    tiles.on("tileerror", () => { failed++; if (failed >= 2) giveUp(); });
    // The Claude demo page can't load outside images, so it goes straight to the grid.
    if (navigator.onLine === false || IS_DEMO) setOffline(true); else tiles.addTo(m);
    const timer = window.setTimeout(giveUp, 6000);
    const retry = () => { if (!m.hasLayer(tiles)) { failed = 0; tiles.addTo(m); } };
    window.addEventListener("online", retry);

    layer.current = L.featureGroup().addTo(m);

    const ro = new ResizeObserver(() => { m.invalidateSize(); fitIfReady(m); });
    ro.observe(el.current);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("online", retry);
      ro.disconnect();
      m.remove();
      map.current = null;
    };
  }, []);

  // Coordinate grid + city names when tiles are unavailable.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (offline && !fallback.current) {
      const g = L.layerGroup();
      for (let lat = 6; lat <= 38; lat++) {
        L.polyline([[lat, 66], [lat, 100]], { color: "#26303C", weight: lat % 5 === 0 ? 1.2 : 0.6, interactive: false }).addTo(g);
      }
      for (let lng = 66; lng <= 100; lng++) {
        L.polyline([[6, lng], [38, lng]], { color: "#26303C", weight: lng % 5 === 0 ? 1.2 : 0.6, interactive: false }).addTo(g);
      }
      for (const [name, lat, lng] of CITIES) {
        L.circleMarker([lat, lng], { radius: 2.5, color: "#7D8998", weight: 1, fillColor: "#7D8998", fillOpacity: 1, interactive: false })
          .bindTooltip(name, { permanent: true, direction: "right", className: "city-label", offset: [4, 0] })
          .addTo(g);
      }
      g.addTo(m);
      layer.current?.bringToFront();
      fallback.current = g;
    } else if (!offline && fallback.current) {
      fallback.current.remove();
      fallback.current = null;
    }
  }, [offline]);

  // Draw markers whenever the data or the selection changes.
  useEffect(() => {
    const m = map.current;
    const g = layer.current;
    if (!m || !g) return;
    g.clearLayers();

    const pts: L.LatLngExpression[] = [];
    // Draw low first so high-severity marks sit on top.
    const order = { low: 0, medium: 1, high: 2 } as Record<string, number>;
    const sorted = [...reports].sort((a, b) => (order[a.severity ?? ""] ?? -1) - (order[b.severity ?? ""] ?? -1));

    for (const r of sorted) {
      if (typeof r.latitude !== "number" || typeof r.longitude !== "number") continue;
      const s = (r.severity && SEV[r.severity]) || NONE;
      const selected = String(r.id) === selectedId;
      const closed = r.status === "resolved" || r.status === "dismissed";
      const suspect = typeof r.trust_score === "number" && r.trust_score < 30;
      pts.push([r.latitude, r.longitude]);

      const mk = L.circleMarker([r.latitude, r.longitude], {
        radius: selected ? s.r + 4 : s.r,
        color: selected ? "#FFFFFF" : r.source === "mesh" ? "#6AA8FF" : "#0E1116",
        weight: selected ? 3 : r.source === "mesh" ? 2.5 : 2,
        dashArray: suspect ? "3 3" : undefined,
        fillColor: s.color,
        fillOpacity: closed ? 0.35 : 0.9,
      });
      mk.bindTooltip(
        `<b>${esc(r.severity ? sevLabel(r.severity) : "—")}</b> · #${esc(String(r.id))}<br>${esc(String(r.description || "").slice(0, 120))}`,
        { direction: "top", offset: [0, -s.r] }
      );
      mk.on("click", () => onSelectRef.current(String(r.id)));
      mk.addTo(g);
    }

    fitIfReady(m);
  }, [reports, selectedId, sevLabel]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pan to a newly selected report if it's off-screen.
  useEffect(() => {
    const m = map.current;
    if (!m || !selectedId) return;
    const r = reports.find((x) => String(x.id) === selectedId);
    if (r && typeof r.latitude === "number" && typeof r.longitude === "number") {
      const ll = L.latLng(r.latitude, r.longitude);
      if (!m.getBounds().pad(-0.1).contains(ll)) m.panTo(ll, { animate: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const fitAll = () => {
    const pts = reports.filter((r) => typeof r.latitude === "number" && typeof r.longitude === "number")
      .map((r) => [r.latitude, r.longitude] as [number, number]);
    if (pts.length && map.current) map.current.fitBounds(L.latLngBounds(pts).pad(0.2), { maxZoom: 10 });
  };

  return (
    <div className="k-map">
      <div ref={el} style={{ position: "absolute", inset: 0 }} aria-label="Map of reports" role="region" />
      <div className="k-legend" aria-hidden="true">
        {(["high", "medium", "low"] as const).map((s) => (
          <span key={s}><i style={{ width: SEV[s].r * 2, height: SEV[s].r * 2, background: SEV[s].color }} />{sevLabel(s)}</span>
        ))}
        <span><i style={{ width: 12, height: 12, background: "transparent", border: "2.5px solid #6AA8FF" }} />{t("src.mesh")}</span>
      </div>
      <div className="k-maptools">
        <button type="button" className="k-btn" onClick={fitAll}><Icon name="map" />{t("map.fit")}</button>
      </div>
      {offline && <div className="k-mapnote" role="status">{t("map.offline")}</div>}
    </div>
  );
}
