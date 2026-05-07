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

const requiredMarkdown = [
  "# Source Summary",
  "# Design Tokens",
  "# Component Specifications",
  "# Do's and Don'ts",
  "## Don'ts",
  "# Validation Checklist",
  "# Evidence"
].join("\n\n");

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
      expect(maxTokensOverride).toBeGreaterThanOrEqual(1200);
      return requiredMarkdown;
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
      expect(maxTokensOverride).toBe(4000);
      return "# Fallback DESIGN.md";
    });

    const markdown = await generateWithLlmParallel(analysis, { complete });

    expect(markdown).toBe("# Fallback DESIGN.md");
    expect(complete).toHaveBeenCalledWith(expect.objectContaining({ streamOverride: true, maxTokensOverride: 4000 }));
  });

  it("falls back to monolithic generation when required sections are missing", async () => {
    let fallbackUsed = false;
    const complete = vi.fn(async ({ streamOverride, maxTokensOverride }) => {
      if (streamOverride === false) return "# Partial Section";
      fallbackUsed = true;
      expect(maxTokensOverride).toBe(4000);
      return "# Full DESIGN.md";
    });

    const markdown = await generateWithLlmParallel(analysis, { complete });

    expect(fallbackUsed).toBe(true);
    expect(markdown).toBe("# Full DESIGN.md");
  });
});
