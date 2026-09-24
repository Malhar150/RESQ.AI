/**
 * Admin authentication.
 *
 * Anything that changes an existing report — verifying it, dismissing it,
 * deleting it — is a government-side action and needs the admin key. Citizens
 * submitting reports do not need a key; that route stays open, protected by
 * rate limiting instead.
 *
 * If ADMIN_KEY is not set, the server runs in open demo mode and says so
 * loudly at startup. That's fine for a hackathon demo and not fine for
 * anything real.
 */

let warned = false;

export function adminKeyConfigured() {
  return Boolean(process.env.ADMIN_KEY && process.env.ADMIN_KEY.length >= 8);
}

/** Constant-time-ish comparison so the key can't be guessed by timing. */
function safeEqual(a = "", b = "") {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function requireAdmin(req, res, next) {
  if (!adminKeyConfigured()) {
    if (!warned) {
      warned = true;
      console.warn(
        "[auth] ADMIN_KEY is not set — verify/dismiss/delete are open to anyone.\n" +
          "       Set ADMIN_KEY in .env before putting this anywhere public."
      );
    }
    return next();
  }

  const provided =
    req.headers["x-admin-key"] ||
    (req.headers.authorization || "").replace(/^Bearer\s+/i, "");

  if (!provided || !safeEqual(String(provided), process.env.ADMIN_KEY)) {
    return res.status(401).json({
      error: "Admin key required",
      hint: "Send the key in an 'x-admin-key' header.",
    });
  }

  next();
}
