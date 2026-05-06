import { NextResponse } from "next/server";

export const runtime = "edge";
import { z } from "zod";
import { analysisResultSchema } from "@/lib/analysis/types";
import { generateWithLlm } from "@/lib/llm/generate-with-llm";
import { createDesignMarkdownProviderFromEnv } from "@/lib/llm/openai-compatible-provider";
import { createRateLimiter } from "@/lib/security/rate-limit";

const requestSchema = z.object({
  analysis: analysisResultSchema,
  url: z.string().min(1)
});

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
      { error: "Invalid analysis data. Please retry extraction." },
      { status: 400 }
    );
  }

  try {
    const startedAt = Date.now();
    console.info(`[api/analyze] received pre-extracted analysis for ${parsed.data.url}`);

    const provider = createDesignMarkdownProviderFromEnv();
    const markdown = await generateWithLlm(parsed.data.analysis, provider);

    console.info(`[api/analyze] markdown completed in ${Date.now() - startedAt}ms (${markdown.length} chars)`);
    return NextResponse.json({ markdown });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "The design analysis failed. Please retry.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
