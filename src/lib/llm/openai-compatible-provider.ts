import type { AnalysisResult } from "@/lib/analysis/types";
import { buildDesignSystemBrain, compactAnalysisForPrompt } from "./prompt-brain";
import { mockDesignMarkdownProvider } from "./mock-provider";
import type { DesignMarkdownProvider } from "./types";

interface OpenAiCompatibleOptions {
  apiKey: string;
  baseUrl: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  stream?: boolean;
  fetch?: typeof fetch;
}

interface ProviderWithKind extends DesignMarkdownProvider {
  kind: "mock" | "openai-compatible";
}

interface SseChunk {
  choices?: Array<{
    delta?: { content?: string };
    message?: { content?: string };
    text?: string;
  }>;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function buildUserContent(analysis: AnalysisResult, prompt: string): string {
  const compact = compactAnalysisForPrompt(analysis);
  return `${prompt}\n\nCompact website analysis JSON:\n${JSON.stringify(compact, null, 2)}`;
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

/* Parse a single SSE data line */
function parseSseLine(data: string): string {
  if (!data || data === "[DONE]") return "";
  try {
    return extractContentFromChunk(JSON.parse(data) as SseChunk);
  } catch {
    console.warn(`[llm] skipped malformed SSE chunk: ${data.slice(0, 120)}`);
    return "";
  }
}

/* Parse SSE event from lines buffer */
function parseSseEvents(lines: string[]): string {
  let content = "";
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) continue;
    content += parseSseLine(trimmed.slice(5).trim());
  }
  return content;
}

export async function parseOpenAiSseStream(response: Response): Promise<string> {
  if (!response.body) {
    throw new Error("LLM streaming response did not include a body.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";

    for (const event of events) {
      content += parseSseEvents(event.split("\n"));
    }
  }

  /* Process trailing buffer */
  if (buffer.trim()) {
    content += parseSseEvents(buffer.trim().split("\n"));
  }

  return content.trim();
}

async function parseJsonResponse(response: Response): Promise<string> {
  const payload = (await response.json()) as SseChunk;
  return (payload.choices?.[0]?.message?.content ?? payload.choices?.[0]?.text ?? "").trim();
}

export function openAiCompatibleProvider(
  options: OpenAiCompatibleOptions
): ProviderWithKind {
  const fetcher = options.fetch ?? fetch;
  const cleanBaseUrl = trimTrailingSlash(options.baseUrl);
  const endpoint = `${cleanBaseUrl}/chat/completions`;

  return {
    kind: "openai-compatible",
    async complete({ analysis, prompt, systemPromptOverride, maxTokensOverride }) {
      const startedAt = Date.now();
      const useStream = options.stream ?? true;
      console.info(`[llm] calling ${options.model} via ${cleanBaseUrl} (${useStream ? "stream" : "json"})`);

      const controller = new AbortController();
      const timeoutMs = options.timeoutMs ?? 120_000;
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      const requestBody = JSON.stringify({
        model: options.model,
        temperature: options.temperature ?? 0.2,
        max_tokens: maxTokensOverride ?? options.maxTokens ?? 4_000,
        stream: useStream,
        messages: [
          { role: "system", content: systemPromptOverride ?? buildDesignSystemBrain() },
          { role: "user", content: prompt }
        ]
      });
      console.info(`[llm] compacted request payload ${requestBody.length} chars, timeout ${timeoutMs}ms`);

      let response: Response;
      try {
        response = await fetcher(endpoint, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${options.apiKey}`,
            "Content-Type": "application/json",
            Accept: useStream ? "text/event-stream" : "application/json"
          },
          body: requestBody,
          signal: controller.signal
        });
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          throw new Error(`LLM request timed out after ${timeoutMs}ms.`);
        }
        throw error;
      } finally {
        clearTimeout(timeout);
      }

      if (!response.ok) {
        const detail = await response.text().catch(() => "<could not read body>");
        throw new Error(
          `LLM request failed with ${response.status}: ${detail.slice(0, 500) || response.statusText}`
        );
      }

      console.info(`[llm] response headers received in ${Date.now() - startedAt}ms`);
      const content = useStream
        ? await parseOpenAiSseStream(response)
        : await parseJsonResponse(response);
      console.info(`[llm] response body parsed in ${Date.now() - startedAt}ms`);

      if (!content) {
        throw new Error("LLM response did not include generated markdown.");
      }

      console.info(`[llm] markdown received (${content.length} chars) in ${Date.now() - startedAt}ms`);
      return content;
    }
  };
}

export function createDesignMarkdownProviderFromEnv(
  env: Partial<NodeJS.ProcessEnv> = process.env
): ProviderWithKind {
  const apiKey = env.LLM_API_KEY?.trim();
  const baseUrl = env.LLM_BASE_URL?.trim();
  const model = env.LLM_MODEL?.trim();

  if (!apiKey || !baseUrl || !model) {
    console.warn("[llm] using mock provider because LLM_API_KEY, LLM_BASE_URL, or LLM_MODEL is missing");
    return { kind: "mock", complete: mockDesignMarkdownProvider.complete };
  }

  return openAiCompatibleProvider({
    apiKey,
    baseUrl,
    model,
    temperature: env.LLM_TEMPERATURE ? Number(env.LLM_TEMPERATURE) : undefined,
    maxTokens: env.LLM_MAX_TOKENS ? Number(env.LLM_MAX_TOKENS) : undefined,
    timeoutMs: env.LLM_TIMEOUT_MS ? Number(env.LLM_TIMEOUT_MS) : undefined,
    stream: env.LLM_STREAM ? env.LLM_STREAM !== "false" : undefined
  });
}
