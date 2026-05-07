import { describe, expect, it, vi } from "vitest";
import {
  createLlmSseStream,
  createLlmStreamOptionsFromEnv
} from "./openai-compatible-provider";

async function collectStreamText(stream: ReadableStream<Uint8Array>): Promise<string[]> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const events: string[] = [];
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      const line = part.trim();
      if (line.startsWith("data:")) events.push(line.slice(5).trim());
    }
  }

  return events;
}

function mockUpstreamSse(chunks: string[], done = true): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: chunk } }] })}\n\n`)
        );
      }
      if (done) controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    }
  });
}

describe("createLlmSseStream", () => {
  it("pipes upstream SSE chunks as JSON events with type=chunk", async () => {
    const fetchMock = vi.fn(async () => new Response(mockUpstreamSse(["Hello", " world"])));

    const stream = createLlmSseStream(
      {
        apiKey: "test-key",
        baseUrl: "https://provider.example/v1/",
        model: "test-model",
        fetch: fetchMock
      },
      "system prompt",
      "user prompt"
    );

    const events = await collectStreamText(stream);
    const parsed = events.map((e) => JSON.parse(e));

    expect(parsed).toEqual([
      { type: "chunk", content: "Hello" },
      { type: "chunk", content: " world" },
      { type: "done" }
    ]);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://provider.example/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer test-key",
          Accept: "text/event-stream"
        })
      })
    );
  });

  it("sends error event when upstream returns non-ok", async () => {
    const fetchMock = vi.fn(async () => new Response("upstream failed", { status: 502 }));

    const stream = createLlmSseStream(
      { apiKey: "k", baseUrl: "https://x/v1", model: "m", fetch: fetchMock },
      "s",
      "u"
    );

    const events = (await collectStreamText(stream)).map((e) => JSON.parse(e));
    expect(events[0].type).toBe("error");
    expect(events[0].message).toContain("502");
  });

  it("sends error event on fetch rejection", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("network down");
    });

    const stream = createLlmSseStream(
      { apiKey: "k", baseUrl: "https://x/v1", model: "m", fetch: fetchMock },
      "s",
      "u"
    );

    const events = (await collectStreamText(stream)).map((e) => JSON.parse(e));
    expect(events[0]).toEqual({ type: "error", message: "network down" });
  });
});

describe("createLlmStreamOptionsFromEnv", () => {
  it("returns null when env is incomplete", () => {
    expect(createLlmStreamOptionsFromEnv({})).toBeNull();
    expect(createLlmStreamOptionsFromEnv({ LLM_API_KEY: "x" })).toBeNull();
  });

  it("returns full options when env is complete", () => {
    const options = createLlmStreamOptionsFromEnv({
      LLM_API_KEY: "key",
      LLM_BASE_URL: "https://api.openai.com/v1",
      LLM_MODEL: "gpt-4.1-mini",
      LLM_TEMPERATURE: "0.3",
      LLM_MAX_TOKENS: "8000",
      LLM_TIMEOUT_MS: "90000"
    });

    expect(options).toEqual({
      apiKey: "key",
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-4.1-mini",
      temperature: 0.3,
      maxTokens: 8000,
      timeoutMs: 90000
    });
  });
});
