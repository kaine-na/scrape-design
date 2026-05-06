import { describe, expect, it } from "vitest";
import type { AnalysisResult } from "@/lib/analysis/types";
import {
  buildDesignMarkdownTaskPrompt,
  buildDesignSystemBrain,
  compactAnalysisForPrompt
} from "./prompt-brain";

const analysis: AnalysisResult = {
  source: {
    url: "https://example.com/",
    analyzedAt: "2026-05-05T00:00:00.000Z",
    scanType: "single-page"
  },
  confidence: { overall: "medium" },
  page: {
    title: "Example",
    description: "A".repeat(500),
    sections: Array.from({ length: 20 }, (_, order) => ({
      role: order === 0 ? "hero" : "section",
      heading: `Heading ${order}`,
      order
    }))
  },
  tokens: {
    colors: Array.from({ length: 25 }, (_, index) => ({
      name: `color-${index}`,
      value: `rgb(${index}, ${index}, ${index})`,
      source: "detected",
      confidence: "medium"
    })),
    typography: [],
    spacing: [],
    radius: [],
    shadows: [],
    gradients: [],
    effects: [],
    motion: [],
    breakpoints: []
  },
  components: Array.from({ length: 20 }, (_, index) => ({
    type: "button",
    name: `button-${index}`,
    description: "Repeated button",
    styles: {
      color: "rgb(0, 0, 0)",
      backgroundColor: index % 2 === 0 ? "rgb(255, 255, 255)" : "rgb(0, 0, 0)",
      padding: "12px 16px"
    },
    states: [],
    confidence: "medium"
  })),
  evidence: Array.from({ length: 40 }, (_, index) => `Evidence ${index}`),
  assumptions: [],
  gaps: []
};

describe("prompt brain", () => {
  it("compacts analysis before sending it to the LLM", () => {
    const compact = compactAnalysisForPrompt(analysis);

    expect(compact.page.description?.length).toBeLessThan(410);
    expect(compact.page.sections.length).toBeLessThanOrEqual(20);
    expect(compact.tokens.colors.length).toBeLessThanOrEqual(24);
    expect(compact.components.length).toBeLessThanOrEqual(12);
    expect(compact.evidence.length).toBeLessThanOrEqual(30);
  });

  it("frames the brain without self-identifying as an AI", () => {
    const brain = buildDesignSystemBrain();

    expect(brain).toContain("world-class senior design-system architect");
    expect(brain.toLowerCase()).not.toContain("you are an ai");
  });

  it("creates a concrete DESIGN.md task prompt", () => {
    const prompt = buildDesignMarkdownTaskPrompt("https://example.com/");

    expect(prompt).toContain("Return ONLY valid Markdown");
    expect(prompt).toContain("Merge duplicate components");
  });
});
