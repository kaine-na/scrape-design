import { describe, expect, it, vi } from "vitest";

/* Mock the LLM provider to skip real API calls */
vi.mock("@/lib/llm/openai-compatible-provider", () => ({
  createDesignMarkdownProviderFromEnv: () => ({
    kind: "mock",
    complete: async () => "# DESIGN.md\n\nMocked output"
  })
}));

import { POST } from "./route";

const mockAnalysis = {
  source: {
    url: "https://example.com/",
    analyzedAt: "2026-01-01T00:00:00.000Z",
    scanType: "single-page" as const
  },
  confidence: { overall: "medium" as const },
  page: { title: "Example", sections: [] },
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
  evidence: ["Mock extraction."],
  assumptions: [],
  gaps: []
};

describe("POST /api/analyze", () => {
  it("returns generated markdown for valid pre-extracted analysis", async () => {
    const request = new Request("http://localhost/api/analyze", {
      method: "POST",
      body: JSON.stringify({ analysis: mockAnalysis, url: "https://example.com" })
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.markdown).toContain("# DESIGN.md");
  });

  it("rejects missing analysis data", async () => {
    const request = new Request("http://localhost/api/analyze", {
      method: "POST",
      body: JSON.stringify({ url: "https://example.com" })
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });
});
