import type { AnalysisResult } from "@/lib/analysis/types";

export interface DesignMarkdownProvider {
  complete(input: {
    analysis: AnalysisResult;
    prompt: string;
    systemPromptOverride?: string;
    maxTokensOverride?: number;
  }): Promise<string>;
}
