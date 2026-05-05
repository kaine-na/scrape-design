import type { AnalysisResult } from "@/lib/analysis/types";
import { mockDesignMarkdownProvider } from "./mock-provider";
import type { DesignMarkdownProvider } from "./types";

interface OpenAiCompatibleOptions {
  apiKey: string;
  baseUrl: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  fetch?: typeof fetch;
}

interface ProviderWithKind extends DesignMarkdownProvider {
  kind: "mock" | "openai-compatible";
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function buildSystemPrompt(): string {
  return [
    "You generate comprehensive AI-ready DESIGN.md files from structured website analysis data.",
    "Write specific, evidence-backed design guidance.",
    "Do not leave placeholder instructions in the output.",
    "Clearly distinguish detected, observed, and inferred details.",
    "If the analysis data is weak, explain gaps and provide cautious recommendations."
  ].join(" ");
}

function buildUserContent(analysis: AnalysisResult, prompt: string): string {
  return `${prompt}\n\nStructured analysis JSON:\n${JSON.stringify(analysis, null, 2)}`;
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
      console.info(`[llm] calling ${options.model} via ${trimTrailingSlash(options.baseUrl)}`);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 60_000);
      const requestBody = JSON.stringify({
        model: options.model,
        temperature: options.temperature ?? 0.2,
        max_tokens: options.maxTokens ?? 6_000,
        stream: false,
        messages: [
          { role: "system", content: buildSystemPrompt() },
          { role: "user", content: buildUserContent(analysis, prompt) }
        ]
      });
      console.info(`[llm] request payload ${requestBody.length} chars, timeout ${options.timeoutMs ?? 60_000}ms`);

      let response: Response;
      try {
        response = await fetcher(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${options.apiKey}`,
          "Content-Type": "application/json"
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
      const payload = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      console.info(`[llm] response json parsed in ${Date.now() - startedAt}ms`);
      const content = payload.choices?.[0]?.message?.content?.trim();
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
    timeoutMs: env.LLM_TIMEOUT_MS ? Number(env.LLM_TIMEOUT_MS) : undefined
  });
}
