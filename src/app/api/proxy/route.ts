import { NextResponse } from "next/server";

import { createRateLimiter } from "@/lib/security/rate-limit";
import { getClientIdentifier } from "@/lib/security/client-id";
import {
  preflightPublicHostnameDns,
  validatePublicHttpUrl
} from "@/lib/security/url-validation";

export const runtime = "edge";

const MAX_RESPONSE_BYTES = 2_500_000;
const FETCH_TIMEOUT_MS = 20_000;

const rateLimiter = createRateLimiter({ maxRequests: 20, windowMs: 60_000 });

/* Proxy endpoint: fetches a public URL and returns HTML with CORS headers.
   Allows client-side iframe extraction to bypass same-origin restrictions
   since blob URLs inherit the creator's origin.

   Protections:
   - Rate limit per trusted client IP
   - URL validation (protocol, private ranges)
   - DNS preflight check (resolves-to-public)
   - MIME type whitelist (HTML only)
   - Response size cap */
export async function GET(request: Request) {
  const clientKey = getClientIdentifier(request);
  const rateLimit = rateLimiter.check(clientKey);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many proxy requests. Please wait and try again." },
      { status: 429 }
    );
  }

  const { searchParams } = new URL(request.url);
  const rawUrl = searchParams.get("url");

  if (!rawUrl) {
    return NextResponse.json({ error: "Missing url parameter" }, { status: 400 });
  }

  const validation = validatePublicHttpUrl(rawUrl);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const dnsResult = await preflightPublicHostnameDns(validation.hostname);
  if (!dnsResult.ok) {
    return NextResponse.json({ error: dnsResult.error }, { status: 400 });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const response = await fetch(validation.url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml"
      }
    });
    clearTimeout(timeout);

    if (!response.ok) {
      return NextResponse.json(
        { error: `Target URL returned ${response.status}` },
        { status: 502 }
      );
    }

    const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
    if (!contentType.includes("html") && !contentType.includes("xml") && contentType !== "") {
      return NextResponse.json(
        { error: `Target URL returned unsupported content-type: ${contentType.slice(0, 80)}` },
        { status: 415 }
      );
    }

    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > MAX_RESPONSE_BYTES) {
      return NextResponse.json(
        { error: "Target URL response exceeded size limit" },
        { status: 413 }
      );
    }

    const html = new TextDecoder("utf-8", { fatal: false }).decode(buffer);

    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=60",
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return NextResponse.json(
        { error: `Target URL timed out after ${FETCH_TIMEOUT_MS / 1000} seconds` },
        { status: 504 }
      );
    }
    return NextResponse.json(
      {
        error: `Failed to fetch target URL: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      },
      { status: 502 }
    );
  }
}
