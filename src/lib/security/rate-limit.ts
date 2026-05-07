interface RateLimitOptions {
  maxRequests: number;
  windowMs: number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * In-memory rate limiter. Suitable for single-instance deployments and
 * per-instance limiting at the edge. For distributed rate limiting
 * (multi-region, multi-instance), use a shared store like Upstash Redis.
 *
 * Prevents memory growth by opportunistically cleaning up expired buckets.
 */
const CLEANUP_THRESHOLD = 1_000;

export function createRateLimiter(options: RateLimitOptions) {
  const buckets = new Map<string, Bucket>();

  function cleanupExpired(now: number) {
    if (buckets.size < CLEANUP_THRESHOLD) return;
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
  }

  return {
    check(key: string, now = Date.now()) {
      cleanupExpired(now);

      const bucket = buckets.get(key);
      if (!bucket || bucket.resetAt <= now) {
        buckets.set(key, { count: 1, resetAt: now + options.windowMs });
        return { allowed: true, remaining: options.maxRequests - 1 };
      }

      if (bucket.count >= options.maxRequests) {
        return { allowed: false, remaining: 0, resetAt: bucket.resetAt };
      }

      bucket.count += 1;
      return { allowed: true, remaining: options.maxRequests - bucket.count };
    }
  };
}
