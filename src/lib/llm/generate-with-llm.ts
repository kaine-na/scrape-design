import type { AnalysisResult } from "@/lib/analysis/types";
import type { DesignMarkdownProvider } from "./types";

export function buildDesignPrompt(analysis: AnalysisResult): string {
  return `Generate a comprehensive AI-ready DESIGN.md for ${analysis.source.url}. Include YAML front matter, tokens, components, interactions, motion, responsive behavior, accessibility, implementation guidance, validation criteria, and evidence/assumptions/gaps. Do not overclaim uncertain findings.`;
}

export async function generateWithLlm(
  analysis: AnalysisResult,
  provider: DesignMarkdownProvider
): Promise<string> {
  return provider.complete({ analysis, prompt: buildDesignPrompt(analysis) });
}
