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

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function buildUserContent(analysis: AnalysisResult, prompt: string): string {
  const compact = compactAnalysisForPrompt(analysis);
  return `${prompt}\n\nCompact website analysis JSON:\n${JSON.stringify(compact, null, 2)}`;
}

function extractContentFromChunk(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const choice = (payload as { choices?: Array<Record<string, unknown>> }).choices?.[0];
  if (!choice) return "";

  const delta = choice.delta as { content?: unknown } | undefined;
  if (typeof delta?.content === "string") return delta.content;

  const message = choice.message as { content?: unknown } | undefined;
  if (typeof message?.content === "string") return message.content;

  if (typeof choice.text === "string") return choice.text;
  return "";
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
      for (const line of event.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;

        const data = trimmed.slice(5).trim();
        if (!data || data === "[DONE]") continue;

        try {
          content += extractContentFromChunk(JSON.parse(data));
        } catch {
          // Ignore malformed keepalive/debug events from local compatible servers.
        }
      }
    }
  }

  const trailing = buffer.trim();
  if (trailing) {
    for (const line of trailing.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const data = trimmed.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      try {
        content += extractContentFromChunk(JSON.parse(data));
      } catch {
        // Ignore trailing malformed events.
      }
    }
  }

  return content.trim();
}

async function parseJsonResponse(response: Response): Promise<string> {
  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string }; text?: string }>;
  };
  return (payload.choices?.[0]?.message?.content ?? payload.choices?.[0]?.text ?? "").trim();
}

export function openAiCompatibleProvider(
  options: OpenAiCompatibleOptions
): ProviderWithKind {
  const fetcher = options.fetch ?? fetch;
  const endpoint = `${trimTrailingSlash(options.baseUrl)}/chat/completions`;

  return {
    kind: "openai-compatible",
    async complete({ analysis, prompt }) {
      const startedAt = Date.now();
      const useStream = options.stream ?? true;
      console.info(`[llm] calling ${options.model} via ${trimTrailingSlash(options.baseUrl)} (${useStream ? "stream" : "json"})`);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 60_000);
      const requestBody = JSON.stringify({
        model: options.model,
        temperature: options.temperature ?? 0.2,
        max_tokens: options.maxTokens ?? 4_000,
        stream: useStream,
        messages: [
          { role: "system", content: buildDesignSystemBrain() },
          { role: "user", content: buildUserContent(analysis, prompt) }
        ]
      });
      console.info(`[llm] compacted request payload ${requestBody.length} chars, timeout ${options.timeoutMs ?? 60_000}ms`);

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
          throw new Error(`LLM request timed out after ${options.timeoutMs ?? 60_000}ms.`);
        }
        throw error;
      } finally {
        clearTimeout(timeout);
      }

      if (!response.ok) {
        const detail = await response.text();
        throw new Error(
          `LLM request failed with ${response.status}: ${detail || response.statusText}`
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
