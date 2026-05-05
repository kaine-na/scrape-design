import { describe, expect, it, vi } from "vitest";
import {
  createDesignMarkdownProviderFromEnv,
  openAiCompatibleProvider,
  parseOpenAiSseStream
} from "./openai-compatible-provider";

const analysis = {
  source: {
    url: "https://example.com/",
    analyzedAt: "2026-05-05T00:00:00.000Z",
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
    motion: [],
    breakpoints: []
  },
  components: [],
  evidence: [],
  assumptions: [],
  gaps: []
};

describe("openAiCompatibleProvider", () => {
  it("calls an OpenAI-compatible chat completions endpoint with streaming enabled by default", async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"# DESIGN.md"}}]}\n\n'));
        controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"\\nGenerated"}}]}\n\n'));
        controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
        controller.close();
      }
    });
    const fetchMock = vi.fn(async () => new Response(stream));

    const provider = openAiCompatibleProvider({
      apiKey: "test-key",
      baseUrl: "https://provider.example/v1/",
      model: "test-model",
      fetch: fetchMock
    });

    const markdown = await provider.complete({ analysis, prompt: "Generate DESIGN.md" });

    expect(markdown).toBe("# DESIGN.md\nGenerated");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://provider.example/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer test-key",
          "Content-Type": "application/json",
          Accept: "text/event-stream"
        })
      })
    );
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(body.model).toBe("test-model");
    expect(body.stream).toBe(true);
    expect(body.messages[1].content).toContain("Generate DESIGN.md");
  });

  it("can parse non-streaming JSON responses when stream is disabled", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ choices: [{ message: { content: "# DESIGN.md\nGenerated" } }] })
    );

    const provider = openAiCompatibleProvider({
      apiKey: "test-key",
      baseUrl: "https://provider.example/v1/",
      model: "test-model",
      stream: false,
      fetch: fetchMock
    });

    const markdown = await provider.complete({ analysis, prompt: "Generate DESIGN.md" });

    expect(markdown).toBe("# DESIGN.md\nGenerated");
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(body.stream).toBe(false);
  });

  it("parses OpenAI-compatible SSE chunks", async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n'));
        controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":" world"}}]}\n\n'));
        controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
        controller.close();
      }
    });

    await expect(parseOpenAiSseStream(new Response(stream))).resolves.toBe("Hello world");
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
