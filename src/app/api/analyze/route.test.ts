import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/analyzer/playwright-extractor", () => ({
  playwrightExtractor: {
    extract: async () => ({
      title: "Example",
      description: "Example page",
      sections: [{ role: "hero", heading: "Example", order: 0 }],
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
    })
  }
}));

import { POST } from "./route";

describe("POST /api/analyze", () => {
  it("returns generated markdown for a valid URL", async () => {
    const request = new Request("http://localhost/api/analyze", {
      method: "POST",
      body: JSON.stringify({ url: "https://example.com" })
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.markdown).toContain("# DESIGN.md");
  });

  it("rejects invalid URLs", async () => {
    const request = new Request("http://localhost/api/analyze", {
      method: "POST",
      body: JSON.stringify({ url: "http://localhost:3000" })
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
  });
});
