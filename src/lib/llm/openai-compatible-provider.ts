const DEFAULT_MAX_TOKENS = 4_000;
const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_TEMPERATURE = 0.2;

interface SseChunk {
  choices?: Array<{
    delta?: { content?: string };
    message?: { content?: string };
    text?: string;
    finish_reason?: string;
  }>;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

/* Extract text content from an SSE chunk - handles delta, message, and text paths */
function extractContentFromChunk(payload: SseChunk): string {
  const choice = payload.choices?.[0];
  if (!choice) return "";

  if (typeof choice.delta?.content === "string") return choice.delta.content;
  if (typeof choice.message?.content === "string") return choice.message.content;
  if (typeof choice.text === "string") return choice.text;
  return "";
}

// ─── SSE Streaming Provider ──────────────────────────────────────────

export interface LlmStreamOptions {
  apiKey: string;
  baseUrl: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  fetch?: typeof fetch;
}

/**
 * Creates a ReadableStream that pipes LLM SSE chunks directly to the client.
 * Each SSE event is a JSON string: {"type":"chunk","content":"..."} or {"type":"done"} or {"type":"error","message":"..."}
 */
export function createLlmSseStream(
  options: LlmStreamOptions,
  systemPrompt: string,
  userPrompt: string
): ReadableStream<Uint8Array> {
  const fetcher = options.fetch ?? fetch;
  const cleanBaseUrl = trimTrailingSlash(options.baseUrl);
  const endpoint = `${cleanBaseUrl}/chat/completions`;
  const encoder = new TextEncoder();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return new ReadableStream({
    async start(streamController) {
      function sendEvent(data: string) {
        streamController.enqueue(encoder.encode(`data: ${data}\n\n`));
      }

      const startedAt = Date.now();
      const abortController = new AbortController();
      const timeout = setTimeout(() => abortController.abort(), timeoutMs);

      try {
        const response = await fetcher(endpoint, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${options.apiKey}`,
            "Content-Type": "application/json",
            Accept: "text/event-stream"
          },
          body: JSON.stringify({
            model: options.model,
            temperature: options.temperature ?? DEFAULT_TEMPERATURE,
            max_tokens: options.maxTokens ?? DEFAULT_MAX_TOKENS,
            stream: true,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt }
            ]
          }),
          signal: abortController.signal
        });

        clearTimeout(timeout);

        if (!response.ok) {
          const detail = await response.text().catch(() => "");
          sendEvent(JSON.stringify({
            type: "error",
            message: `LLM error ${response.status}: ${detail.slice(0, 200) || response.statusText}`
          }));
          streamController.close();
          return;
        }

        if (!response.body) {
          sendEvent(JSON.stringify({ type: "error", message: "No response body from LLM" }));
          streamController.close();
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let chunkCount = 0;

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split("\n\n");
          buffer = events.pop() ?? "";

          for (const event of events) {
            const lines = event.split("\n");
            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed.startsWith("data:")) continue;
              const data = trimmed.slice(5).trim();
              if (data === "[DONE]") continue;

              try {
                const payload = JSON.parse(data) as SseChunk;
                const content = extractContentFromChunk(payload);
                if (content) {
                  sendEvent(JSON.stringify({ type: "chunk", content }));
                  chunkCount++;
                }
              } catch {
                // Skip malformed chunks silently
              }
            }
          }
        }

        console.info(`[llm-stream] ${options.model} completed in ${Date.now() - startedAt}ms (${chunkCount} chunks)`);
        sendEvent(JSON.stringify({ type: "done" }));
        streamController.close();
      } catch (error) {
        clearTimeout(timeout);
        const isAbort = error instanceof Error && error.name === "AbortError";
        const message = isAbort
          ? `LLM request timed out after ${timeoutMs}ms`
          : error instanceof Error ? error.message : "Unknown LLM error";
        sendEvent(JSON.stringify({ type: "error", message }));
        streamController.close();
      }
    }
  });
}

export function createLlmStreamOptionsFromEnv(
  env: Partial<NodeJS.ProcessEnv> = process.env
): LlmStreamOptions | null {
  const apiKey = env.LLM_API_KEY?.trim();
  const baseUrl = env.LLM_BASE_URL?.trim();
  const model = env.LLM_MODEL?.trim();

  if (!apiKey || !baseUrl || !model) return null;

  return {
    apiKey,
    baseUrl,
    model,
    temperature: env.LLM_TEMPERATURE ? Number(env.LLM_TEMPERATURE) : undefined,
    maxTokens: env.LLM_MAX_TOKENS ? Number(env.LLM_MAX_TOKENS) : undefined,
    timeoutMs: env.LLM_TIMEOUT_MS ? Number(env.LLM_TIMEOUT_MS) : undefined
  };
}
