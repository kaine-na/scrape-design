import { NextResponse } from "next/server";
import { validatePublicHttpUrl } from "@/lib/security/url-validation";

/* Proxy endpoint: fetches a public URL and returns HTML with CORS headers.
   Allows client-side iframe extraction to bypass same-origin restrictions
   since blob URLs inherit the creator's origin. */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawUrl = searchParams.get("url");

  if (!rawUrl) {
    return NextResponse.json({ error: "Missing url parameter" }, { status: 400 });
  }

  const validation = validatePublicHttpUrl(rawUrl);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);

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

    const html = await response.text();

    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=60"
      }
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return NextResponse.json(
        { error: "Target URL timed out after 20 seconds" },
        { status: 504 }
      );
    }
    return NextResponse.json(
      { error: `Failed to fetch target URL: ${error instanceof Error ? error.message : "Unknown error"}` },
      { status: 502 }
    );
  }
}
