import type { AnalysisResult } from "@/lib/analysis/types";

export interface DesignMarkdownProvider {
  complete(input: {
    analysis: AnalysisResult;
    prompt: string;
    systemPromptOverride?: string;
    maxTokensOverride?: number;
    streamOverride?: boolean;
  }): Promise<string>;
}
