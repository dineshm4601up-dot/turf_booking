/**
 * In-memory fixed-window rate limiter. Deliberately simple, with one real
 * limitation: this Map lives in a single server process, so on serverless
 * platforms that run multiple instances (Vercel, etc.) each instance tracks
 * its own counts, and the effective limit is "N requests per window per
 * instance" rather than a global guarantee. For a production deployment
 * expecting multiple instances, replace this with a shared store (Upstash
 * Redis, Vercel KV, or a Postgres table + a single SQL UPDATE) -- the call
 * site below only needs the same two-field return shape.
 */
const buckets = new Map<string, { count: number; windowStart: number }>();

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

export function checkRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now - bucket.windowStart >= windowMs) {
    buckets.set(key, { count: 1, windowStart: now });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (bucket.count < limit) {
    bucket.count += 1;
    return { allowed: true, retryAfterSeconds: 0 };
  }

  const retryAfterSeconds = Math.ceil((bucket.windowStart + windowMs - now) / 1000);
  return { allowed: false, retryAfterSeconds: Math.max(retryAfterSeconds, 1) };
}

/** Best-effort client identifier for rate limiting; proxies may not set this. */
export function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0]?.trim() ?? "unknown";
  return request.headers.get("x-real-ip") ?? "unknown";
}
