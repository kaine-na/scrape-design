import { describe, expect, it } from "vitest";
import { analysisResultSchema } from "./types";

describe("analysisResultSchema", () => {
  it("accepts a minimal single-page analysis result", () => {
    const result = analysisResultSchema.parse({
      source: {
        url: "https://example.com",
        analyzedAt: "2026-05-05T00:00:00.000Z",
        scanType: "single-page"
      },
      confidence: { overall: "medium" },
      page: {
        title: "Example",
        description: "Example page",
        sections: []
      },
      tokens: {
        colors: [],
        typography: [],
        spacing: [],
        radius: [],
        shadows: [],
        gradients: [],
        effects: [],
        motion: [],
        breakpoints: []
      },
      components: [],
      evidence: [],
      assumptions: [],
      gaps: []
    });

    expect(result.source.scanType).toBe("single-page");
  });
});
