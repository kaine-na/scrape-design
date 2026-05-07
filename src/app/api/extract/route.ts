import { NextResponse } from "next/server";
import { z } from "zod";

import { analysisResultSchema } from "@/lib/analysis/types";
import {
  buildBrowserlessEndpoint,
  mapBrowserlessError
} from "@/lib/browserless/client";
import { getBrowserlessConfig } from "@/lib/browserless/config";
import { buildBrowserlessExtractionQuery } from "@/lib/browserless/extraction-script";
import { normalizeBrowserlessResult } from "@/lib/browserless/normalize";
import { validatePublicHttpUrl } from "@/lib/security/url-validation";

export const runtime = "edge";

const requestSchema = z.object({
  url: z.string().min(1),
  mode: z.literal("high-fidelity").default("high-fidelity")
});

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
    return jsonError("Invalid JSON body.", "INVALID_JSON", 400);
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError("Invalid request body.", "INVALID_REQUEST", 400);
  }

  const urlResult = validatePublicHttpUrl(parsed.data.url);
  if (!urlResult.ok) {
    return jsonError(urlResult.error, "INVALID_URL", 400);
  }

  const config = getBrowserlessConfig();
  if (!config.enabled) {
    return jsonError("Browserless is not configured.", config.error, 503);
  }

  const endpoint = buildBrowserlessEndpoint(config);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
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
      return jsonError("Browserless extraction failed.", code, 502);
    }

    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      return jsonError(
        "Browserless returned an invalid response.",
        "BROWSERLESS_REQUEST_FAILED",
        502
      );
    }

    const graphQlErrorMessage = getGraphQlErrorMessage(json);
    if (graphQlErrorMessage) {
      const code = mapBrowserlessError(200, graphQlErrorMessage);
      return jsonError("Browserless extraction failed.", code, 502);
    }

    const raw = getBrowserlessRawValue(json);
    if (raw == null) {
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
      return jsonError(
        "Extracted analysis failed schema validation.",
        "EXTRACTION_INVALID",
        502
      );
    }

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
    return jsonError(
      isAbort
        ? "Browserless extraction timed out."
        : "Browserless extraction failed.",
      isAbort ? "BROWSERLESS_TIMEOUT" : "BROWSERLESS_REQUEST_FAILED",
      502
    );
  } finally {
    clearTimeout(timeoutId);
  }
}
