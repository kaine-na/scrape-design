import { NextResponse } from "next/server";
import { z } from "zod";
import { analyzeUrl } from "@/lib/analyzer/analyze-url";
import { playwrightExtractor } from "@/lib/analyzer/playwright-extractor";
import { generateWithLlm } from "@/lib/llm/generate-with-llm";
import { mockDesignMarkdownProvider } from "@/lib/llm/mock-provider";
import { createRateLimiter } from "@/lib/security/rate-limit";

const requestSchema = z.object({ url: z.string().min(1) });
const rateLimiter = createRateLimiter({ maxRequests: 10, windowMs: 60_000 });

export async function POST(request: Request) {
  const clientKey =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anonymous";
  const rateLimit = rateLimiter.check(clientKey);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please wait and try again." },
      { status: 429 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Please enter a valid public website URL." },
      { status: 400 }
    );
  }

  try {
    const analysis = await analyzeUrl(parsed.data.url, playwrightExtractor);
    const markdown = await generateWithLlm(analysis, mockDesignMarkdownProvider);
    return NextResponse.json({ analysis, markdown });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "The design analysis failed. Please retry.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
