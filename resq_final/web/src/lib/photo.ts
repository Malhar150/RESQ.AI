/**
 * Photos: shrink on the phone, then either
 *   - upload to a Supabase Storage bucket (if VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
 *     and VITE_PHOTO_BUCKET are set) and send the public URL as photo_url, or
 *   - send the image inline as photo_base64, which the backend fingerprints for
 *     the reused-photo check but does not store.
 */

const SB_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/+$/, "") || "";
const SB_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || "";
const BUCKET = (import.meta.env.VITE_PHOTO_BUCKET as string | undefined) || "";

export const photoStorageEnabled = Boolean(SB_URL && SB_KEY && BUCKET);

/** Downscale to at most `max` px on the long side and re-encode as JPEG. */
export async function shrinkImage(file: File, max = 1024, quality = 0.72): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("not an image"));
      el.src = url;
    });
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no canvas");
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL("image/jpeg", quality);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [head, body] = dataUrl.split(",");
  const mime = /data:([^;]+)/.exec(head)?.[1] || "image/jpeg";
  const bin = atob(body);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/** Upload to Supabase Storage. Returns the public URL. Throws on failure. */
export async function uploadPhoto(dataUrl: string, name: string): Promise<string> {
  if (!photoStorageEnabled) throw new Error("photo storage not configured");
  const path = `reports/${new Date().toISOString().slice(0, 10)}/${name}.jpg`;
  const res = await fetch(`${SB_URL}/storage/v1/object/${encodeURIComponent(BUCKET)}/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SB_KEY}`,
      apikey: SB_KEY,
      "Content-Type": "image/jpeg",
      "x-upsert": "true",
    },
    body: dataUrlToBlob(dataUrl),
  });
  if (!res.ok) throw new Error(`upload failed (${res.status})`);
  return `${SB_URL}/storage/v1/object/public/${encodeURIComponent(BUCKET)}/${path}`;
}
