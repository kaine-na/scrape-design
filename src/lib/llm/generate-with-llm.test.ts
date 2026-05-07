import { describe, expect, it, vi } from "vitest";
import { generateWithLlm, generateWithLlmParallel } from "./generate-with-llm";
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
    expect(capturedPrompt).toContain("Compact website analysis JSON");
  });
});

describe("generateWithLlmParallel", () => {
  it("generates section groups with bounded non-streaming calls", async () => {
    const complete = vi.fn(async ({ prompt, streamOverride, maxTokensOverride }) => {
      expect(prompt).toContain("Generate ONLY these sections");
      expect(streamOverride).toBe(false);
      expect(maxTokensOverride).toBe(1200);
      return "# Section";
    });

    const markdown = await generateWithLlmParallel(analysis, { complete });

    expect(complete).toHaveBeenCalledTimes(5);
    expect(markdown).toContain("source: https://example.com/");
    expect(markdown).not.toContain("generation failed");
  });

  it("falls back to monolithic generation when a section group keeps failing", async () => {
    const complete = vi.fn(async ({ streamOverride, maxTokensOverride }) => {
      if (streamOverride === false) throw new Error("blank section response");
      expect(streamOverride).toBe(true);
      expect(maxTokensOverride).toBe(3000);
      return "# Fallback DESIGN.md";
    });

    const markdown = await generateWithLlmParallel(analysis, { complete });

    expect(markdown).toBe("# Fallback DESIGN.md");
    expect(complete).toHaveBeenCalledWith(expect.objectContaining({ streamOverride: true, maxTokensOverride: 3000 }));
  });
});
