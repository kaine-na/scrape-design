import matter from "gray-matter";
import { describe, expect, it } from "vitest";
import { generateDesignMarkdown } from "./design-md";
import type { AnalysisResult } from "@/lib/analysis/types";

const analysis: AnalysisResult = {
  source: {
    url: "https://example.com/",
    analyzedAt: "2026-05-05T00:00:00.000Z",
    scanType: "single-page"
  },
  confidence: { overall: "medium" },
  page: {
    title: "Example",
    description: "Example page",
    sections: [{ role: "hero", heading: "Hero", order: 0 }]
  },
  tokens: {
    colors: [{ name: "primary", value: "#111111", source: "detected", confidence: "high" }],
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
  evidence: ["Detected primary color."],
  assumptions: ["Button hierarchy inferred from placement."],
  gaps: ["No mobile screenshot captured."]
};

describe("generateDesignMarkdown", () => {
  it("creates valid front matter and required sections", () => {
    const markdown = generateDesignMarkdown(analysis);
    const parsed = matter(markdown);

    expect(parsed.data.source.url).toBe("https://example.com/");
    expect(markdown).toContain("## 8. Interaction & Feedback States");
    expect(markdown).toContain("## 9. Motion & Animation Guidelines");
    expect(markdown).toContain("## 17. Evidence, Assumptions & Gaps");
  });
});
