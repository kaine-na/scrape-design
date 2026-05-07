import type { AnalysisResult } from "@/lib/analysis/types";
import type { DesignMarkdownProvider } from "./types";
import {
  buildDesignMarkdownTaskPrompt,
  buildDesignSystemBrain,
  buildSectionPrompt,
  compactAnalysisForPrompt,
  SECTION_GROUPS
} from "./prompt-brain";

export function buildDesignPrompt(analysis: AnalysisResult): string {
  const base = buildDesignMarkdownTaskPrompt(analysis.source.url);
  const compactJson = JSON.stringify(compactAnalysisForPrompt(analysis), null, 2);
  return `${base}\n\nCompact website analysis JSON:\n${compactJson}`;
}

/* Parallel generation: split 17 sections into 5 groups, generate concurrently */
export async function generateWithLlmParallel(
  analysis: AnalysisResult,
  provider: DesignMarkdownProvider
): Promise<string> {
  const brain = buildDesignSystemBrain();
  const compactJson = JSON.stringify(compactAnalysisForPrompt(analysis), null, 2);
  const baseContext = `Design system analysis JSON:\n${compactJson}`;

  console.info(`[llm-parallel] generating ${SECTION_GROUPS.length} section groups in parallel`);

  const groupPromises = SECTION_GROUPS.map(async (group) => {
    const groupPrompt = buildSectionPrompt(group, baseContext);
    const startedAt = Date.now();

    try {
      const result = await provider.complete({
        analysis,
        prompt: groupPrompt,
        systemPromptOverride: brain,
        maxTokensOverride: 600
      });
      console.info(`[llm-parallel] group "${group.id}" done in ${Date.now() - startedAt}ms (${result.length} chars)`);
      return { id: group.id, content: result };
    } catch (error) {
      console.error(`[llm-parallel] group "${group.id}" failed after ${Date.now() - startedAt}ms:`, error);
      return { id: group.id, content: `<!-- Group "${group.name}" generation failed: ${error instanceof Error ? error.message : "unknown"} -->` };
    }
  });

  const results = await Promise.all(groupPromises);

  /* Merge in order: header + front matter, then each group */
  const header = `---\nsource: ${analysis.source.url}\nanalyzed: ${analysis.source.analyzedAt}\ntool: scrape-design\n---\n\n`;
  const sections = results.map((r) => r.content.trim()).filter(Boolean);

  return header + sections.join("\n\n---\n\n");
}

/* Single monolithic generation (original, for backward compat) */
export async function generateWithLlm(
  analysis: AnalysisResult,
  provider: DesignMarkdownProvider
): Promise<string> {
  return provider.complete({ analysis, prompt: buildDesignPrompt(analysis) });
}
