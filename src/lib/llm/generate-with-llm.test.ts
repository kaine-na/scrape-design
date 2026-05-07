import { describe, expect, it } from "vitest";
import { generateWithLlm } from "./generate-with-llm";
import type { AnalysisResult } from "@/lib/analysis/types";

const analysis: AnalysisResult = {
  source: { url: "https://example.com/", analyzedAt: "2026-05-05T00:00:00.000Z", scanType: "single-page" },
  confidence: { overall: "medium" },
  page: { title: "Example", sections: [] },
  tokens: { colors: [], typography: [], spacing: [], radius: [], shadows: [], gradients: [], effects: [], motion: [], breakpoints: [] },
  components: [],
  evidence: [],
  assumptions: [],
  gaps: []
};

describe("generateWithLlm", () => {
  it("delegates to provider with structured analysis", async () => {
    const markdown = await generateWithLlm(analysis, {
      complete: async ({ analysis }) => `# DESIGN.md\n${analysis.source.url}`
    });

    expect(markdown).toContain("https://example.com/");
  });

  it("builds an implementation-focused prompt", async () => {
    let capturedPrompt = "";

    await generateWithLlm(analysis, {
      complete: async ({ prompt }) => {
        capturedPrompt = prompt;
        return "# DESIGN.md";
      }
    });

    expect(capturedPrompt).toContain("NEVER invent values");
    expect(capturedPrompt).toContain("Merge duplicate components");
  });
});
