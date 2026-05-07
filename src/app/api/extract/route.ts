import { NextResponse } from "next/server";
import { z } from "zod";

import { analysisResultSchema } from "@/lib/analysis/types";
import {
  buildBrowserlessEndpoint,
  mapBrowserlessError
} from "@/lib/browserless/client";
import { getBrowserlessConfig } from "@/lib/browserless/config";
import { getBrowserlessEnv } from "@/lib/browserless/env";
import { buildBrowserlessExtractionQuery } from "@/lib/browserless/extraction-script";
import { normalizeBrowserlessResult } from "@/lib/browserless/normalize";
import {
  preflightPublicHostnameDns,
  validatePublicHttpUrl
} from "@/lib/security/url-validation";

export const runtime = "edge";

const requestSchema = z.object({
  url: z.string().min(1),
  mode: z.literal("high-fidelity").default("high-fidelity")
});

let activeBrowserlessExtractions = 0;

function jsonError(error: string, code: string, status: number) {
  return NextResponse.json({ error, code }, { status });
}

function getBrowserlessRawValue(payload: unknown): unknown {
  if (typeof payload !== "object" || payload === null) return undefined;
  const data = "data" in payload ? payload.data : undefined;
  if (typeof data !== "object" || data === null) return undefined;
  const evaluate = "evaluate" in data ? data.evaluate : undefined;
  if (typeof evaluate !== "object" || evaluate === null) return undefined;
  return "value" in evaluate ? evaluate.value : undefined;
}

function getGraphQlErrorMessage(payload: unknown) {
  if (typeof payload !== "object" || payload === null || !("errors" in payload)) {
    return undefined;
  }
  const errors = payload.errors;
  if (!Array.isArray(errors)) return undefined;
  return errors
    .map((error) => {
      if (typeof error === "object" && error !== null && "message" in error) {
        return typeof error.message === "string" ? error.message : undefined;
      }
      return undefined;
    })
    .filter(Boolean)
    .join("; ");
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    console.error("[api/extract] invalid JSON body");
    return jsonError("Invalid JSON body.", "INVALID_JSON", 400);
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    console.error("[api/extract] invalid request body:", parsed.error.flatten());
    return jsonError("Invalid request body.", "INVALID_REQUEST", 400);
  }

  const urlResult = validatePublicHttpUrl(parsed.data.url);
  if (!urlResult.ok) {
    console.error("[api/extract] URL validation failed:", urlResult.error);
    return jsonError(urlResult.error, "INVALID_URL", 400);
  }

  console.info("[api/extract] extracting:", urlResult.url);

  const config = getBrowserlessConfig(await getBrowserlessEnv());
  if (!config.enabled) {
    console.error("[api/extract] Browserless not configured. Set BROWSERLESS_API_TOKEN.");
    return jsonError("Browserless is not configured.", config.error, 503);
  }

  if (activeBrowserlessExtractions >= config.maxConcurrency) {
    console.warn("[api/extract] concurrency limit reached:", activeBrowserlessExtractions);
    return jsonError(
      "Browserless extraction concurrency limit reached.",
      "BROWSERLESS_QUOTA_OR_CONCURRENCY",
      429
    );
  }

  activeBrowserlessExtractions += 1;

  const endpoint = buildBrowserlessEndpoint(config);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const dnsResult = await preflightPublicHostnameDns(urlResult.hostname);
    if (!dnsResult.ok) {
      console.error("[api/extract] DNS preflight rejected:", urlResult.hostname, dnsResult.error);
      return jsonError(dnsResult.error, "INVALID_URL", 400);
    }

    console.info("[api/extract] DNS OK, calling Browserless:", endpoint.host);

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: buildBrowserlessExtractionQuery(urlResult.url, config.timeoutMs)
      }),
      signal: controller.signal
    });

    const text = await response.text();
    if (!response.ok) {
      const code = mapBrowserlessError(response.status, text);
      console.error("[api/extract] Browserless HTTP error:", response.status, code, text.slice(0, 500));
      return jsonError("Browserless extraction failed.", code, 502);
    }

    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      console.error("[api/extract] Browserless returned non-JSON:", text.slice(0, 500));
      return jsonError(
        "Browserless returned an invalid response.",
        "BROWSERLESS_REQUEST_FAILED",
        502
      );
    }

    const graphQlErrorMessage = getGraphQlErrorMessage(json);
    if (graphQlErrorMessage) {
      const code = mapBrowserlessError(200, graphQlErrorMessage);
      console.error("[api/extract] Browserless GraphQL errors:", graphQlErrorMessage);
      return jsonError("Browserless extraction failed.", code, 502);
    }

    const raw = getBrowserlessRawValue(json);
    if (raw == null) {
      console.error("[api/extract] Browserless returned empty evaluate value. Response:", JSON.stringify(json).slice(0, 500));
      return jsonError(
        "Browserless returned an empty extraction.",
        "EXTRACTION_EMPTY",
        502
      );
    }

    let rawValue: unknown;
    try {
      rawValue = typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch {
      console.error("[api/extract] evaluate value is not valid JSON:", String(raw).slice(0, 300));
      return jsonError(
        "Browserless returned an invalid extraction.",
        "EXTRACTION_INVALID",
        502
      );
    }

    const analysis = normalizeBrowserlessResult({
      requestedUrl: urlResult.url,
      raw: rawValue
    });
    const validation = analysisResultSchema.safeParse(analysis);
    if (!validation.success) {
      console.error("[api/extract] analysis failed schema validation:", validation.error.flatten());
      return jsonError(
        "Extracted analysis failed schema validation.",
        "EXTRACTION_INVALID",
        502
      );
    }

    console.info("[api/extract] extraction successful:", analysis.tokens.colors.length, "colors,", analysis.components.length, "components");
    return NextResponse.json({
      analysis: validation.data,
      meta: {
        provider: "browserless",
        browser: config.browser,
        region: config.region,
        timedOut: false
      }
    });
  } catch (error) {
    const isAbort = error instanceof Error && error.name === "AbortError";
    if (isAbort) {
      console.error("[api/extract] extraction timed out after", config.timeoutMs, "ms");
    } else {
      console.error("[api/extract] extraction threw:", error);
    }
    return jsonError(
      isAbort
        ? "Browserless extraction timed out."
        : "Browserless extraction failed.",
      isAbort ? "BROWSERLESS_TIMEOUT" : "BROWSERLESS_REQUEST_FAILED",
      502
    );
  } finally {
    activeBrowserlessExtractions = Math.max(0, activeBrowserlessExtractions - 1);
    clearTimeout(timeoutId);
  }
}
