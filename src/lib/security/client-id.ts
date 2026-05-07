/**
 * Extract a trusted client identifier for rate limiting.
 *
 * Priority order:
 * 1. `cf-connecting-ip` — set by Cloudflare edge, cannot be spoofed by clients
 * 2. `x-real-ip` — set by Vercel edge, cannot be spoofed
 * 3. `x-forwarded-for` (first value) — fallback; can be spoofed when no trusted proxy
 * 4. "anonymous" — last resort when no headers present
 *
 * On Cloudflare Pages / Vercel, `cf-connecting-ip` and `x-real-ip` are stripped
 * from inbound requests and re-set by the platform, preventing client spoofing.
 */
export function getClientIdentifier(request: Request): string {
  const cfIp = request.headers.get("cf-connecting-ip");
  if (cfIp) return cfIp.trim();

  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp.trim();

  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) return first;
  }

  return "anonymous";
}
