import { NextResponse } from "next/server";
import { z } from "zod";
import { analyzeUrl } from "@/lib/analyzer/analyze-url";
import { playwrightExtractor } from "@/lib/analyzer/playwright-extractor";
import { generateWithLlm } from "@/lib/llm/generate-with-llm";
import { mockDesignMarkdownProvider } from "@/lib/llm/mock-provider";

const requestSchema = z.object({ url: z.string().min(1) });

export async function POST(request: Request) {
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
