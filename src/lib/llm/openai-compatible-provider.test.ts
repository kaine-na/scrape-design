import { describe, expect, it, vi } from "vitest";
import {
  createDesignMarkdownProviderFromEnv,
  openAiCompatibleProvider
} from "./openai-compatible-provider";

describe("openAiCompatibleProvider", () => {
  it("calls an OpenAI-compatible chat completions endpoint", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ choices: [{ message: { content: "# DESIGN.md\nGenerated" } }] })
    );

    const provider = openAiCompatibleProvider({
      apiKey: "test-key",
      baseUrl: "https://provider.example/v1/",
      model: "test-model",
      fetch: fetchMock
    });

    const markdown = await provider.complete({
      analysis: {
        source: {
          url: "https://example.com/",
          analyzedAt: "2026-05-05T00:00:00.000Z",
          scanType: "single-page"
        },
        confidence: { overall: "medium" },
        page: { title: "Example", sections: [] },
        tokens: {
          colors: [],
          typography: [],
          spacing: [],
          radius: [],
          shadows: [],
          motion: [],
          breakpoints: []
        },
        components: [],
        evidence: [],
        assumptions: [],
        gaps: []
      },
      prompt: "Generate DESIGN.md"
    });

    expect(markdown).toBe("# DESIGN.md\nGenerated");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://provider.example/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer test-key",
          "Content-Type": "application/json"
        })
      })
    );
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(body.model).toBe("test-model");
    expect(body.messages[1].content).toContain("Generate DESIGN.md");
  });

  it("falls back to the mock provider when env is incomplete", () => {
    const provider = createDesignMarkdownProviderFromEnv({});
    expect(provider.kind).toBe("mock");
  });

  it("uses OpenAI-compatible provider when env is complete", () => {
    const provider = createDesignMarkdownProviderFromEnv({
      LLM_API_KEY: "key",
      LLM_BASE_URL: "https://api.openai.com/v1",
      LLM_MODEL: "gpt-4.1-mini"
    });
    expect(provider.kind).toBe("openai-compatible");
  });
});
