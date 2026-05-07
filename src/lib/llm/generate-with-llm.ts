import type { AnalysisResult } from "@/lib/analysis/types";
import type { DesignMarkdownProvider } from "./types";
import {
  buildDesignMarkdownTaskPrompt,
  buildDesignSystemBrain,
  buildSectionPrompt,
  compactAnalysisForPrompt,
  SECTION_GROUPS,
  type SectionGroup
} from "./prompt-brain";

const PARALLEL_CONCURRENCY = 2;
const DEFAULT_GROUP_MAX_TOKENS = 1_200;
const GROUP_MAX_TOKENS: Record<string, number> = {
  foundations: 1_500,
  "typography-color": 1_200,
  "layout-components": 1_800,
  "motion-responsive-a11y": 1_200,
  implementation: 2_000
};
const MONOLITHIC_MAX_TOKENS = 4_000;

export function buildDesignPrompt(analysis: AnalysisResult): string {
  const base = buildDesignMarkdownTaskPrompt(analysis.source.url);
  const compactJson = JSON.stringify(compactAnalysisForPrompt(analysis), null, 2);
  return `${base}\n\nCompact website analysis JSON:\n${compactJson}`;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  task: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await task(items[currentIndex], currentIndex);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker())
  );

  return results;
}

async function generateGroup(
  group: SectionGroup,
  analysis: AnalysisResult,
  provider: DesignMarkdownProvider,
  baseContext: string,
  brain: string
): Promise<string> {
  const groupPrompt = buildSectionPrompt(group, baseContext);
  let lastError: unknown;

  for (let attempt = 1; attempt <= 2; attempt++) {
    const startedAt = Date.now();
    try {
      const result = await provider.complete({
        analysis,
        prompt: groupPrompt,
        systemPromptOverride: brain,
        maxTokensOverride: GROUP_MAX_TOKENS[group.id] ?? DEFAULT_GROUP_MAX_TOKENS,
        streamOverride: false
      });
      console.info(`[llm-parallel] group "${group.id}" done in ${Date.now() - startedAt}ms (${result.length} chars, attempt ${attempt})`);
      return result;
    } catch (error) {
      lastError = error;
      console.warn(`[llm-parallel] group "${group.id}" failed in ${Date.now() - startedAt}ms (attempt ${attempt}/2):`, error);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`Group "${group.id}" failed.`);
}

function hasRequiredSections(markdown: string): boolean {
  const normalized = markdown.toLowerCase();
  const required = [
    "source summary",
    "design tokens",
    "component specifications",
    "do's and don'ts",
    "don'ts",
    "validation checklist",
    "evidence"
  ];

  return required.every((section) => normalized.includes(section));
}

/* Parallel generation: split 17 sections into groups, generate with bounded concurrency */
export async function generateWithLlmParallel(
  analysis: AnalysisResult,
  provider: DesignMarkdownProvider
): Promise<string> {
  const brain = buildDesignSystemBrain();
  const compactJson = JSON.stringify(compactAnalysisForPrompt(analysis), null, 2);
  const baseContext = `Design system analysis JSON:\n${compactJson}`;

  console.info(
    `[llm-parallel] generating ${SECTION_GROUPS.length} section groups with concurrency ${PARALLEL_CONCURRENCY}`
  );

  try {
    const sections = await mapWithConcurrency(
      SECTION_GROUPS,
      PARALLEL_CONCURRENCY,
      (group) => generateGroup(group, analysis, provider, baseContext, brain)
    );

    const header = `---\nsource: ${analysis.source.url}\nanalyzed: ${analysis.source.analyzedAt}\ntool: scrape-design\n---\n\n`;
    const markdown = header + sections.map((section) => section.trim()).filter(Boolean).join("\n\n---\n\n");

    if (!hasRequiredSections(markdown)) {
      throw new Error("Generated DESIGN.md is missing required sections.");
    }

    return markdown;
  } catch (error) {
    console.warn("[llm-parallel] falling back to monolithic generation after section failure:", error);
    return provider.complete({
      analysis,
      prompt: buildDesignPrompt(analysis),
      systemPromptOverride: brain,
      maxTokensOverride: MONOLITHIC_MAX_TOKENS,
      streamOverride: true
    });
  }
}

/* Single monolithic generation (original, for backward compat) */
export async function generateWithLlm(
  analysis: AnalysisResult,
  provider: DesignMarkdownProvider
): Promise<string> {
  return provider.complete({ analysis, prompt: buildDesignPrompt(analysis) });
}
