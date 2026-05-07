import { describe, expect, it } from "vitest";
import type { AnalysisResult } from "@/lib/analysis/types";
import {
  buildCompactGenerationPrompt,
  buildDesignSystemBrain
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
    sections: []
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
  evidence: [],
  assumptions: [],
  gaps: []
};

describe("prompt brain", () => {
  it("frames the brain without self-identifying as an AI", () => {
    const brain = buildDesignSystemBrain();

    expect(brain).toContain("frontend designer");
    expect(brain.toLowerCase()).not.toContain("you are an ai");
  });

  it("builds a compact generation prompt under 10K chars", () => {
    const prompt = buildCompactGenerationPrompt(analysis);

    expect(prompt.length).toBeLessThan(10_000);
    expect(prompt).toContain("https://example.com/");
    expect(prompt).toContain("NEVER invent values");
    expect(prompt).toContain("REQUIRED SECTIONS");
    expect(prompt).toContain("Do NOT summarize page content");
  });

  it("limits colors, components, and other tokens in the compact prompt", () => {
    const prompt = buildCompactGenerationPrompt(analysis);
    const dataSection = prompt.slice(prompt.indexOf("EXTRACTED DESIGN DATA:"));
    const parsed = JSON.parse(dataSection.slice(dataSection.indexOf("{")));

    expect(parsed.colors.primary.length).toBeLessThanOrEqual(8);
    expect(parsed.components.length).toBeLessThanOrEqual(6);
    expect(parsed.colors.neutral.length).toBeGreaterThan(0);
  });
});
