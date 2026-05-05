import { describe, expect, it } from "vitest";
import { analyzeUrl } from "./analyze-url";

describe("analyzeUrl", () => {
  it("returns a valid analysis result for a provided extractor result", async () => {
    const result = await analyzeUrl("https://example.com", {
      extract: async () => ({
        title: "Example Domain",
        description: "A fixture page",
        sections: [{ role: "hero", heading: "Example Domain", order: 0 }],
        tokens: {
          colors: [{ name: "text", value: "#111111", source: "detected" }],
          typography: [],
          spacing: [],
          radius: [],
          shadows: [],
          motion: [],
          breakpoints: []
        },
        components: [],
        evidence: ["Extracted title and hero heading."],
        assumptions: [],
        gaps: []
      })
    });

    expect(result.source.url).toBe("https://example.com/");
    expect(result.page.title).toBe("Example Domain");
    expect(result.confidence.overall).toBe("medium");
  });
});
