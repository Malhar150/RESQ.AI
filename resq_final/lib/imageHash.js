/**
 * Perceptual image hashing — for catching recycled disaster photos.
 *
 * The problem: during every flood, the same dramatic photo from a previous
 * flood (or from another country entirely) gets reposted as "breaking news".
 * A normal checksum won't catch it, because resizing or recompressing the
 * image changes every byte. A perceptual hash describes what the picture
 * *looks like*, so a resized, recompressed, slightly cropped copy still
 * produces a nearly identical hash.
 *
 * We use dHash (difference hash): shrink to 9x8 greyscale, then record whether
 * each pixel is brighter than the one to its right. That's 8x8 = 64 bits,
 * stored as 16 hex characters. Two images are "the same picture" if their
 * hashes differ in fewer than PHASH_THRESHOLD bits (Hamming distance).
 *
 * Image decoding needs the optional `jimp` package. If it isn't installed the
 * rest of the server still runs — photo checks just switch off.
 */

const THRESHOLD = Number(process.env.PHASH_THRESHOLD || 10);

let jimpModule;      // cached module
let jimpUnavailable = false;

async function getJimp() {
  if (jimpUnavailable) return null;
  if (jimpModule) return jimpModule;
  try {
    const mod = await import("jimp");
    // jimp v1 exports { Jimp }; v0.x exports default.
    jimpModule = mod.Jimp || mod.default || mod;
    return jimpModule;
  } catch {
    jimpUnavailable = true;
    console.warn(
      "[phash] `jimp` is not installed — duplicate-photo detection is off.\n" +
        "        Run `npm install jimp` to turn it on."
    );
    return null;
  }
}

export function isPhotoHashingAvailable() {
  return !jimpUnavailable;
}

/** Pull image bytes from an http(s) URL or a data: URI. */
async function loadBytes(source) {
  if (!source || typeof source !== "string") return null;

  if (source.startsWith("data:")) {
    const comma = source.indexOf(",");
    if (comma === -1) return null;
    return Buffer.from(source.slice(comma + 1), "base64");
  }

  if (/^https?:\/\//i.test(source)) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch(source, { signal: controller.signal });
      if (!res.ok) return null;
      const len = Number(res.headers.get("content-length") || 0);
      if (len > 12 * 1024 * 1024) return null; // don't pull huge files
      return Buffer.from(await res.arrayBuffer());
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  // Bare base64 (no data: prefix)
  if (/^[A-Za-z0-9+/=\s]+$/.test(source) && source.length > 100) {
    return Buffer.from(source.replace(/\s/g, ""), "base64");
  }

  return null;
}

/**
 * Box-sample a full-size RGBA bitmap down to `w` x `h` greyscale values.
 * Done by hand rather than with jimp's resize() so this keeps working across
 * jimp major versions, which have changed that API.
 */
function downsampleToGrey(bitmap, w, h) {
  const { data, width, height } = bitmap;
  const out = new Float64Array(w * h);

  for (let y = 0; y < h; y++) {
    const y0 = Math.floor((y * height) / h);
    const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * height) / h));

    for (let x = 0; x < w; x++) {
      const x0 = Math.floor((x * width) / w);
      const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * width) / w));

      let sum = 0;
      let count = 0;
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          const i = (yy * width + xx) * 4;
          // Rec. 601 luma
          sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
          count++;
        }
      }
      out[y * w + x] = count ? sum / count : 0;
    }
  }
  return out;
}

/**
 * Compute the 64-bit dHash of an image.
 * @param {string} source http(s) URL, data: URI, or base64 string
 * @returns {Promise<string|null>} 16 hex characters, or null if unreadable
 */
export async function hashImage(source) {
  const Jimp = await getJimp();
  if (!Jimp) return null;

  const bytes = await loadBytes(source);
  if (!bytes || bytes.length < 64) return null;

  let image;
  try {
    image = await Jimp.read(bytes);
  } catch {
    return null; // not a decodable image
  }

  const bitmap = image?.bitmap;
  if (!bitmap?.data || !bitmap.width || !bitmap.height) return null;

  const grey = downsampleToGrey(bitmap, 9, 8);

  let hex = "";
  let nibble = 0;
  let bitsInNibble = 0;

  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const bit = grey[y * 9 + x] > grey[y * 9 + x + 1] ? 1 : 0;
      nibble = (nibble << 1) | bit;
      if (++bitsInNibble === 4) {
        hex += nibble.toString(16);
        nibble = 0;
        bitsInNibble = 0;
      }
    }
  }
  return hex; // 16 chars
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
