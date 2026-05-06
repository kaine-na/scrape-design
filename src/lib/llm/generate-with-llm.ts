import type { AnalysisResult } from "@/lib/analysis/types";
import type { DesignMarkdownProvider } from "./types";

import { buildDesignMarkdownTaskPrompt } from "./prompt-brain";

export function buildDesignPrompt(analysis: AnalysisResult): string {
  const base = buildDesignMarkdownTaskPrompt(analysis.source.url);
  const stats = [
    `Context: ${analysis.tokens.colors.length} colors, ${analysis.tokens.gradients.length} gradients`,
    `${analysis.tokens.shadows.length} shadow tokens, ${analysis.tokens.effects.length} effects`,
    `${analysis.components.length} component families detected`,
    `Evidence level: ${analysis.evidence.length} items, ${analysis.gaps.length} gaps`
  ].join("; ");
  return `${base}\n\nDetected signals: ${stats}`;
}

export async function generateWithLlm(
  analysis: AnalysisResult,
  provider: DesignMarkdownProvider
): Promise<string> {
  return provider.complete({ analysis, prompt: buildDesignPrompt(analysis) });
}
