import type { AnalysisResult } from "@/lib/analysis/types";
import type { DesignMarkdownProvider } from "./types";

import { buildDesignMarkdownTaskPrompt } from "./prompt-brain";

export function buildDesignPrompt(analysis: AnalysisResult): string {
  return buildDesignMarkdownTaskPrompt(analysis.source.url);
}

export async function generateWithLlm(
  analysis: AnalysisResult,
  provider: DesignMarkdownProvider
): Promise<string> {
  return provider.complete({ analysis, prompt: buildDesignPrompt(analysis) });
}
