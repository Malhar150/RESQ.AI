// @ts-nocheck
/*
 * DEMO ONLY — a verbatim copy of the rule engine in the backend's
 * lib/imageHash.js (image decoding done with a canvas instead of jimp), so the in-browser demo
 * fingerprints photos exactly the way the real server does with no API key.
 * The real app never loads this file.
 */
const THRESHOLD = 10;

/** 64-bit dHash of an image (data: URL), computed on a canvas. */
export async function hashImage(source) {
  if (!source || typeof source !== "string" || !source.startsWith("data:")) return null;
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = source;
    });
    const canvas = document.createElement("canvas");
    canvas.width = 9;
    canvas.height = 8;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, 9, 8);
    const d = ctx.getImageData(0, 0, 9, 8).data;
    const grey = [];
    for (let i = 0; i < 72; i++) grey.push(0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]);
    let hex = "";
    let nibble = 0;
    let bits = 0;
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        nibble = (nibble << 1) | (grey[y * 9 + x] > grey[y * 9 + x + 1] ? 1 : 0);
        if (++bits === 4) { hex += nibble.toString(16); nibble = 0; bits = 0; }
      }
    }
    return hex;
  } catch {
    return null;
  }
}

/** Number of differing bits between two hex hashes. Lower = more similar. */
export function hammingDistance(a, b) {
  if (!a || !b || a.length !== b.length) return Infinity;
  let dist = 0;
  for (let i = 0; i < a.length; i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) {
      dist += x & 1;
      x >>= 1;
    }
  }
  return dist;
}

/**
 * Find previously stored reports whose photo looks like this one.
 * @param {string} hash        hash of the incoming photo
 * @param {Array}  priorRows   [{ id, photo_hash, created_at, description }]
 */
export function findLookalikes(hash, priorRows = []) {
  if (!hash) return [];
  return priorRows
    .filter((r) => r.photo_hash && r.photo_hash !== null)
    .map((r) => ({ ...r, distance: hammingDistance(hash, r.photo_hash) }))
    .filter((r) => r.distance <= THRESHOLD)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 5);
}

export const PHASH_THRESHOLD = THRESHOLD;
