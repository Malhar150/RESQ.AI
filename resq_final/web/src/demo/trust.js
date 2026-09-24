// @ts-nocheck
/*
 * DEMO ONLY — a verbatim copy of the rule engine in the backend's
 * lib/trust.js (IP hashing replaced), so the in-browser demo
 * scores reports exactly the way the real server does with no API key.
 * The real app never loads this file.
 */
/**
 * Trust scoring — how much should a duty officer believe this report?
 *
 * No single signal proves a report is fake. A reused photo might be someone
 * illustrating a real problem with the closest picture they had. So we don't
 * block anything: we compute a 0-100 score and attach human-readable flags,
 * and the officer decides. The dashboard sorts and colours by this, so the
 * suspicious ones surface instead of hiding in a wall of identical cards.
 *
 * Signals, roughly in order of weight:
 *   - the photo has been seen before (perceptual hash match)
 *   - nobody else nearby is reporting anything  (vs.)  neighbours corroborate
 *   - coordinates fall outside the service area
 *   - the same device is firing off reports in a burst
 *   - the text is too thin to act on, or looks like spam
 */

import { findLookalikes, PHASH_THRESHOLD } from "./imageHash.js";

// Generous bounding box around India, with the North East well inside it.
const INDIA_BBOX = { minLat: 6.0, maxLat: 37.6, minLng: 68.0, maxLng: 97.5 };

const CORROBORATION_RADIUS_KM = 5;
const CORROBORATION_WINDOW_HOURS = 6;
const BURST_WINDOW_MINUTES = 10;
const BURST_LIMIT = 5;

/** Great-circle distance in kilometres. */
export function distanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** In the demo every report comes from this one browser. */
export function reporterHash() {
  return "demo-browser";
}

function hoursSince(iso) {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return Infinity;
  return (Date.now() - t) / 36e5;
}

/**
 * @param {object} incoming  { description, latitude, longitude, photo_hash, reporter_hash, source }
 * @param {Array}  priorRows recent reports from the database
 * @returns {{ trust_score:number, flags:Array<{code,label,detail,delta}> }}
 */
export function scoreTrust(incoming, priorRows = []) {
  const flags = [];
  let score = 70; // start at "plausible but unverified"

  const add = (code, label, detail, delta) => {
    flags.push({ code, label, detail, delta });
    score += delta;
  };

  const text = String(incoming.description || "").trim();
  const { latitude: lat, longitude: lng } = incoming;

  /* --- 1. Recycled photo ------------------------------------------------ */
  if (incoming.photo_hash) {
    const matches = findLookalikes(incoming.photo_hash, priorRows);
    if (matches.length) {
      const best = matches[0];
      const age = hoursSince(best.created_at);
      const exact = best.distance === 0;
      add(
        "duplicate_photo",
        exact ? "Photo already submitted" : "Photo looks reused",
        `Matches report #${best.id} from ${age < 1 ? "under an hour" : `${Math.round(age)}h`} ago ` +
          `(${best.distance}/64 bits different, threshold ${PHASH_THRESHOLD}).`,
        exact ? -45 : -30
      );
    } else {
      add("photo_new", "Photo not seen before", "No perceptual match in recent reports.", +8);
    }
  } else if (incoming.photo_url) {
    add("photo_unreadable", "Photo could not be checked", "The image could not be downloaded or decoded.", -3);
  } else {
    add("no_photo", "No photo attached", "Nothing to verify visually.", -5);
  }

  /* --- 2. Location sanity ---------------------------------------------- */
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lng);
  if (!hasCoords) {
    add("no_location", "No usable coordinates", "Cannot place this on the map.", -20);
  } else if (
    lat < INDIA_BBOX.minLat || lat > INDIA_BBOX.maxLat ||
    lng < INDIA_BBOX.minLng || lng > INDIA_BBOX.maxLng
  ) {
    add(
      "out_of_area",
      "Outside the service area",
      `${lat.toFixed(3)}, ${lng.toFixed(3)} falls outside India.`,
      -35
    );
  } else if (lat === 0 && lng === 0) {
    add("null_island", "Coordinates are 0, 0", "Usually means the device had no GPS fix.", -25);
  }

  /* --- 3. Corroboration from neighbours --------------------------------- */
  if (hasCoords) {
    const nearby = priorRows.filter((r) => {
      if (!Number.isFinite(r.latitude) || !Number.isFinite(r.longitude)) return false;
      if (hoursSince(r.created_at) > CORROBORATION_WINDOW_HOURS) return false;
      if (incoming.reporter_hash && r.reporter_hash === incoming.reporter_hash) return false;
      return distanceKm(lat, lng, r.latitude, r.longitude) <= CORROBORATION_RADIUS_KM;
    });

    if (nearby.length >= 3) {
      add(
        "well_corroborated",
        `${nearby.length} nearby reports agree`,
        `Other people within ${CORROBORATION_RADIUS_KM} km reported in the last ${CORROBORATION_WINDOW_HOURS}h.`,
        +22
      );
    } else if (nearby.length >= 1) {
      add(
        "corroborated",
        `${nearby.length} nearby report${nearby.length > 1 ? "s" : ""} agree`,
        `Within ${CORROBORATION_RADIUS_KM} km in the last ${CORROBORATION_WINDOW_HOURS}h.`,
        +12
      );
    }
  }

  /* --- 4. Burst from one device ----------------------------------------- */
  if (incoming.reporter_hash) {
    const recent = priorRows.filter(
      (r) =>
        r.reporter_hash === incoming.reporter_hash &&
        hoursSince(r.created_at) * 60 <= BURST_WINDOW_MINUTES
    );
    if (recent.length >= BURST_LIMIT) {
      add(
        "burst",
        "Rapid repeat submissions",
        `${recent.length} reports from the same device in ${BURST_WINDOW_MINUTES} minutes.`,
        -25
      );
    }
  }

  /* --- 5. Text quality --------------------------------------------------- */
  if (text.length < 12) {
    add("too_short", "Description too thin", "Not enough detail to dispatch on.", -15);
  } else if (text.length > 60) {
    add("detailed", "Detailed description", `${text.length} characters of context.`, +6);
  }

  if (/(.)\1{6,}/.test(text) || /\b(test|asdf|qwerty|lorem ipsum)\b/i.test(text)) {
    add("spam_like", "Looks like a test entry", "Contains filler or keyboard-mash text.", -30);
  }

  const exactTextDupe = priorRows.find(
    (r) =>
      r.description &&
      r.description.trim().toLowerCase() === text.toLowerCase() &&
      hoursSince(r.created_at) <= 24
  );
  if (exactTextDupe) {
    add(
      "duplicate_text",
      "Identical text already filed",
      `Same wording as report #${exactTextDupe.id} within 24h.`,
      -20
    );
  }

  /* --- 6. Arrival path --------------------------------------------------- */
  if (incoming.source === "mesh") {
    add(
      "mesh_relay",
      "Arrived by device mesh",
      "Relayed offline from a device with no network — expect delay, not fabrication.",
      0
    );
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  return { trust_score: score, flags };
}

/** Bucket the score for the dashboard. */
export function trustBand(score) {
  if (score >= 75) return "strong";
  if (score >= 50) return "fair";
  if (score >= 30) return "weak";
  return "suspect";
}
