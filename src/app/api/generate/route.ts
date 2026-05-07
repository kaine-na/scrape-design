import { NextResponse } from "next/server";
import { z } from "zod";
import { analysisResultSchema } from "@/lib/analysis/types";
import {
  buildDesignSystemBrain,
  buildCompactGenerationPrompt
} from "@/lib/llm/prompt-brain";
import {
  createLlmSseStream,
  createLlmStreamOptionsFromEnv
} from "@/lib/llm/openai-compatible-provider";
import { createRateLimiter } from "@/lib/security/rate-limit";
import { getClientIdentifier } from "@/lib/security/client-id";

export const runtime = "edge";

const requestSchema = z.object({
  analysis: analysisResultSchema
});

const rateLimiter = createRateLimiter({ maxRequests: 10, windowMs: 60_000 });

export async function POST(request: Request) {
  const clientKey = getClientIdentifier(request);
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

  const streamOptions = createLlmStreamOptionsFromEnv();
  if (!streamOptions) {
    return NextResponse.json(
      { error: "LLM is not configured." },
      { status: 503 }
    );
  }

  const { analysis } = parsed.data;
  const brain = buildDesignSystemBrain();
  const prompt = buildCompactGenerationPrompt(analysis);

  console.info(
    `[api/generate] streaming for ${analysis.source.url} (prompt: ${prompt.length} chars)`
  );

  const stream = createLlmSseStream(streamOptions, brain, prompt);

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no"
    }
  });
}
