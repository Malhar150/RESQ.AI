/**
 * Rate limiting — a small in-memory fixed-window counter.
 *
 * Purpose is narrow: stop one device from flooding the control room with
 * hundreds of reports, whether by malice or by a retry loop in a flaky
 * network. It is intentionally dependency-free and per-process, which is
 * enough for a single Render instance. If you ever scale to several
 * instances, move this to Redis or Supabase.
 */

const WINDOW_MS = 60_000;
const buckets = new Map(); // key -> { count, resetAt }

// Keep the map from growing forever on a long-running server.
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}, WINDOW_MS).unref?.();

function clientKey(req) {
  return (
    (req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
    req.socket?.remoteAddress ||
    "unknown"
  );
}

/**
 * @param {number} limit requests allowed per minute
 */
export function rateLimit(limit = Number(process.env.RATE_LIMIT_PER_MIN || 20)) {
  return function rateLimitMiddleware(req, res, next) {
    const key = clientKey(req);
    const now = Date.now();

    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + WINDOW_MS };
      buckets.set(key, bucket);
    }

    bucket.count++;

    const remaining = Math.max(0, limit - bucket.count);
    res.set("X-RateLimit-Limit", String(limit));
    res.set("X-RateLimit-Remaining", String(remaining));

    if (bucket.count > limit) {
      const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
      res.set("Retry-After", String(retryAfter));
      return res.status(429).json({
        error: "Too many reports from this device",
        detail: `Limit is ${limit} per minute. Try again in ${retryAfter}s.`,
      });
    }

    next();
  };
}
