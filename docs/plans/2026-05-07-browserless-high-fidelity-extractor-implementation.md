# Browserless High-Fidelity Extractor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a Browserless.io high-fidelity extraction path that works locally and on Cloudflare Pages while preserving the current client extractor as a fallback.

**Architecture:** Add a new edge-compatible `/api/extract` route that validates a URL, calls Browserless with a short real-browser session, runs a compact DOM/style extraction script, validates the returned `AnalysisResult`, and returns it to the frontend. The frontend defaults to `/api/extract` for high-fidelity extraction, then calls `/api/analyze` as it does today; if Browserless fails, it shows a clear error and can fall back to the existing client extractor.

**Tech Stack:** Next.js App Router, TypeScript, Zod, Cloudflare Pages Functions Edge Runtime, Browserless.io HTTP/BrowserQL-compatible API via `fetch`, Vitest, React Testing Library.

---

## Preconditions

- Do not commit any Browserless API token.
- Use `BROWSERLESS_API_TOKEN` from `.env.local` locally and Cloudflare Pages environment variables in production.
- Keep Browserless timeout below the free-plan 1-minute session limit.
- Keep existing tests passing after each task.

---

### Task 1: Document Browserless Environment Variables

**Files:**
- Modify: `.env.example`
- Modify: `README.md`

**Step 1: Update `.env.example`**

Add these variables below the existing LLM variables:

```env
# Browserless.io high-fidelity extractor
BROWSERLESS_API_TOKEN=
BROWSERLESS_REGION=sfo
BROWSERLESS_BROWSER=chrome
BROWSERLESS_TIMEOUT_MS=50000
BROWSERLESS_USE_RESIDENTIAL_PROXY=false
BROWSERLESS_MAX_CONCURRENCY=2
```

**Step 2: Update README deployment section**

Add a short Browserless section:

```markdown
### Browserless.io

High-fidelity extraction uses Browserless.io. Configure the same variables locally in `.env.local` and in Cloudflare Pages environment variables:

- `BROWSERLESS_API_TOKEN`
- `BROWSERLESS_REGION=sfo`
- `BROWSERLESS_BROWSER=chrome`
- `BROWSERLESS_TIMEOUT_MS=50000`
- `BROWSERLESS_USE_RESIDENTIAL_PROXY=false`
- `BROWSERLESS_MAX_CONCURRENCY=2`

Free-plan limits to respect: 1k units/month, 2 concurrent browsers, 1 minute max session time. Residential proxies are disabled by default.
```

**Step 3: Verify docs only**

Run:

```bash
git diff -- .env.example README.md
```

Expected: only documentation/env sample changes.

**Step 4: Commit**

```bash
git add .env.example README.md
git commit -m "docs: add Browserless environment configuration"
```

---

### Task 2: Add Browserless Configuration Module

**Files:**
- Create: `src/lib/browserless/config.ts`
- Create: `src/lib/browserless/config.test.ts`

**Step 1: Write failing tests**

Create `src/lib/browserless/config.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { getBrowserlessConfig } from "./config";

describe("getBrowserlessConfig", () => {
  it("returns disabled config when token is missing", () => {
    const config = getBrowserlessConfig({});
    expect(config.enabled).toBe(false);
    expect(config.error).toBe("BROWSERLESS_NOT_CONFIGURED");
  });

  it("uses safe defaults", () => {
    const config = getBrowserlessConfig({ BROWSERLESS_API_TOKEN: "token" });
    expect(config.enabled).toBe(true);
    if (!config.enabled) throw new Error("expected enabled config");
    expect(config.region).toBe("sfo");
    expect(config.browser).toBe("chrome");
    expect(config.timeoutMs).toBe(50_000);
    expect(config.useResidentialProxy).toBe(false);
    expect(config.maxConcurrency).toBe(2);
  });

  it("caps timeout below Browserless free session limit", () => {
    const config = getBrowserlessConfig({
      BROWSERLESS_API_TOKEN: "token",
      BROWSERLESS_TIMEOUT_MS: "120000"
    });
    expect(config.enabled).toBe(true);
    if (!config.enabled) throw new Error("expected enabled config");
    expect(config.timeoutMs).toBe(55_000);
  });
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
npx vitest run src/lib/browserless/config.test.ts
```

Expected: FAIL because `src/lib/browserless/config.ts` does not exist.

**Step 3: Implement minimal config module**

Create `src/lib/browserless/config.ts`:

```ts
export type BrowserlessRegion = "sfo" | "lon" | "ams";
export type BrowserlessBrowser = "chrome" | "webkit" | "firefox";

export type BrowserlessConfig =
  | { enabled: false; error: "BROWSERLESS_NOT_CONFIGURED" }
  | {
      enabled: true;
      token: string;
      region: BrowserlessRegion;
      browser: BrowserlessBrowser;
      timeoutMs: number;
      useResidentialProxy: boolean;
      maxConcurrency: number;
    };

type Env = Record<string, string | undefined>;

const regionSet = new Set(["sfo", "lon", "ams"]);
const browserSet = new Set(["chrome", "webkit", "firefox"]);

function parsePositiveInt(value: string | undefined, fallback: number) {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getBrowserlessConfig(env: Env = process.env): BrowserlessConfig {
  const token = env.BROWSERLESS_API_TOKEN?.trim();
  if (!token) return { enabled: false, error: "BROWSERLESS_NOT_CONFIGURED" };

  const regionCandidate = env.BROWSERLESS_REGION ?? "sfo";
  const browserCandidate = env.BROWSERLESS_BROWSER ?? "chrome";

  const timeoutMs = Math.min(
    parsePositiveInt(env.BROWSERLESS_TIMEOUT_MS, 50_000),
    55_000
  );

  return {
    enabled: true,
    token,
    region: regionSet.has(regionCandidate)
      ? (regionCandidate as BrowserlessRegion)
      : "sfo",
    browser: browserSet.has(browserCandidate)
      ? (browserCandidate as BrowserlessBrowser)
      : "chrome",
    timeoutMs,
    useResidentialProxy: env.BROWSERLESS_USE_RESIDENTIAL_PROXY === "true",
    maxConcurrency: Math.min(
      parsePositiveInt(env.BROWSERLESS_MAX_CONCURRENCY, 2),
      2
    )
  };
}
```

**Step 4: Verify test passes**

Run:

```bash
npx vitest run src/lib/browserless/config.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/lib/browserless/config.ts src/lib/browserless/config.test.ts
git commit -m "feat: add Browserless configuration parser"
```

---

### Task 3: Add Browserless Endpoint Builder and Error Mapping

**Files:**
- Create: `src/lib/browserless/client.ts`
- Create: `src/lib/browserless/client.test.ts`

**Step 1: Write failing tests**

Create `src/lib/browserless/client.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildBrowserlessEndpoint, mapBrowserlessError } from "./client";

describe("buildBrowserlessEndpoint", () => {
  it("builds a Browserless BrowserQL endpoint without leaking token in logs", () => {
    const endpoint = buildBrowserlessEndpoint({
      token: "secret-token",
      region: "sfo",
      browser: "chrome"
    });

    expect(endpoint.toString()).toContain("browserless.io");
    expect(endpoint.searchParams.get("token")).toBe("secret-token");
  });
});

describe("mapBrowserlessError", () => {
  it("maps quota and concurrency errors", () => {
    expect(mapBrowserlessError(429, "Too many concurrent sessions")).toBe(
      "BROWSERLESS_QUOTA_OR_CONCURRENCY"
    );
  });

  it("maps timeout errors", () => {
    expect(mapBrowserlessError(504, "timeout")).toBe("BROWSERLESS_TIMEOUT");
  });
});
```

**Step 2: Run failing test**

```bash
npx vitest run src/lib/browserless/client.test.ts
```

Expected: FAIL because module does not exist.

**Step 3: Implement client helpers**

Create `src/lib/browserless/client.ts`:

```ts
import type { BrowserlessBrowser, BrowserlessRegion } from "./config";

export type BrowserlessErrorCode =
  | "BROWSERLESS_TIMEOUT"
  | "BROWSERLESS_QUOTA_OR_CONCURRENCY"
  | "BROWSERLESS_REQUEST_FAILED";

const regionHosts: Record<BrowserlessRegion, string> = {
  sfo: "production-sfo.browserless.io",
  lon: "production-lon.browserless.io",
  ams: "production-ams.browserless.io"
};

export function buildBrowserlessEndpoint(input: {
  token: string;
  region: BrowserlessRegion;
  browser: BrowserlessBrowser;
}) {
  const host = regionHosts[input.region];
  const endpoint = new URL(`https://${host}/${input.browser}/bql`);
  endpoint.searchParams.set("token", input.token);
  return endpoint;
}

export function mapBrowserlessError(
  status: number,
  message: string
): BrowserlessErrorCode {
  const lower = message.toLowerCase();
  if (status === 408 || status === 504 || lower.includes("timeout")) {
    return "BROWSERLESS_TIMEOUT";
  }
  if (
    status === 402 ||
    status === 409 ||
    status === 429 ||
    lower.includes("quota") ||
    lower.includes("concurrent")
  ) {
    return "BROWSERLESS_QUOTA_OR_CONCURRENCY";
  }
  return "BROWSERLESS_REQUEST_FAILED";
}
```

**Step 4: Verify test passes**

```bash
npx vitest run src/lib/browserless/client.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/lib/browserless/client.ts src/lib/browserless/client.test.ts
git commit -m "feat: add Browserless client helpers"
```

---

### Task 4: Add Browserless Extraction Script Builder

**Files:**
- Create: `src/lib/browserless/extraction-script.ts`
- Create: `src/lib/browserless/extraction-script.test.ts`

**Step 1: Write failing tests**

Create `src/lib/browserless/extraction-script.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildBrowserlessExtractionQuery } from "./extraction-script";

describe("buildBrowserlessExtractionQuery", () => {
  it("builds a BrowserQL mutation with target URL and extraction function", () => {
    const query = buildBrowserlessExtractionQuery("https://example.com", 50_000);
    expect(query).toContain("https://example.com");
    expect(query).toContain("mutation");
    expect(query).toContain("goto");
    expect(query).toContain("evaluate");
  });
});
```

**Step 2: Run failing test**

```bash
npx vitest run src/lib/browserless/extraction-script.test.ts
```

Expected: FAIL because module does not exist.

**Step 3: Implement query builder**

Create `src/lib/browserless/extraction-script.ts` with a compact BrowserQL query builder. The first version may use a minimal extraction script; later tasks validate the resulting shape.

```ts
export function buildBrowserlessExtractionQuery(url: string, timeoutMs: number) {
  const safeUrl = JSON.stringify(url);
  const timeout = Math.max(5_000, Math.min(timeoutMs, 55_000));

  return `
mutation ExtractDesignSystem {
  goto(url: ${safeUrl}, waitUntil: networkIdle, timeout: ${timeout}) {
    status
  }
  evaluate(content: """
    async () => {
      const pick = (selector) => Array.from(document.querySelectorAll(selector)).slice(0, 12);
      const visible = (el) => {
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      };
      const sampleStyles = (el) => {
        const style = getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return {
          selector: el.tagName.toLowerCase(),
          text: (el.textContent || '').trim().slice(0, 160),
          rect: { width: Math.round(rect.width), height: Math.round(rect.height) },
          styles: {
            color: style.color,
            backgroundColor: style.backgroundColor,
            backgroundImage: style.backgroundImage,
            fontFamily: style.fontFamily,
            fontSize: style.fontSize,
            fontWeight: style.fontWeight,
            lineHeight: style.lineHeight,
            letterSpacing: style.letterSpacing,
            borderRadius: style.borderRadius,
            boxShadow: style.boxShadow,
            textShadow: style.textShadow,
            padding: style.padding,
            margin: style.margin,
            display: style.display,
            gap: style.gap,
            transform: style.transform,
            filter: style.filter,
            backdropFilter: style.backdropFilter,
            transition: style.transition,
            animation: style.animation
          }
        };
      };

      await new Promise((resolve) => setTimeout(resolve, 1200));
      window.scrollTo(0, Math.min(document.body.scrollHeight, 900));
      await new Promise((resolve) => setTimeout(resolve, 500));
      window.scrollTo(0, 0);

      const headings = pick('h1,h2,h3').filter(visible).map(sampleStyles);
      const buttons = pick('button,a,[role="button"],input,textarea,select').filter(visible).map(sampleStyles);
      const sections = pick('header,main,section,article,footer,nav').filter(visible).map(sampleStyles);
      const cards = pick('[class*="card"],[class*="feature"],[class*="pricing"],li').filter(visible).map(sampleStyles);
      const images = pick('img,picture,svg').filter(visible).map(sampleStyles);

      return {
        title: document.title,
        description: document.querySelector('meta[name="description"]')?.getAttribute('content') || '',
        url: location.href,
        viewport: { width: innerWidth, height: innerHeight },
        samples: { headings, buttons, sections, cards, images }
      };
    }
  """) {
    value
  }
}
`;
}
```

**Step 4: Verify test passes**

```bash
npx vitest run src/lib/browserless/extraction-script.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/lib/browserless/extraction-script.ts src/lib/browserless/extraction-script.test.ts
git commit -m "feat: build Browserless extraction query"
```

---

### Task 5: Convert Browserless Raw Result to AnalysisResult

**Files:**
- Create: `src/lib/browserless/normalize.ts`
- Create: `src/lib/browserless/normalize.test.ts`

**Step 1: Write failing test**

Create `src/lib/browserless/normalize.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { analysisResultSchema } from "@/lib/analysis/types";
import { normalizeBrowserlessResult } from "./normalize";

describe("normalizeBrowserlessResult", () => {
  it("converts Browserless samples into AnalysisResult", () => {
    const result = normalizeBrowserlessResult({
      requestedUrl: "https://example.com",
      raw: {
        title: "Example",
        description: "Example description",
        samples: {
          headings: [
            {
              text: "Hero title",
              styles: {
                color: "rgb(10, 20, 30)",
                fontFamily: "Inter",
                fontSize: "64px",
                fontWeight: "700",
                lineHeight: "1.1"
              }
            }
          ],
          buttons: [],
          sections: [],
          cards: [],
          images: []
        }
      }
    });

    expect(() => analysisResultSchema.parse(result)).not.toThrow();
    expect(result.page.title).toBe("Example");
    expect(result.tokens.colors.length).toBeGreaterThan(0);
    expect(result.tokens.typography.length).toBeGreaterThan(0);
  });
});
```

**Step 2: Run failing test**

```bash
npx vitest run src/lib/browserless/normalize.test.ts
```

Expected: FAIL because module does not exist.

**Step 3: Implement normalizer**

Create `src/lib/browserless/normalize.ts`. Keep this simple and schema-first. Deduplicate token values and map sample groups to `AnalysisResult`.

```ts
import type { AnalysisResult } from "@/lib/analysis/types";

type RawStyleSample = {
  text?: string;
  selector?: string;
  styles?: Record<string, string | undefined>;
};

type RawBrowserlessResult = {
  title?: string;
  description?: string;
  samples?: Record<string, RawStyleSample[]>;
};

function pushUniqueToken(
  target: AnalysisResult["tokens"]["colors"],
  seen: Set<string>,
  name: string,
  value: string | undefined,
  role?: string
) {
  if (!value || seen.has(value) || value === "rgba(0, 0, 0, 0)") return;
  seen.add(value);
  target.push({ name, value, role, source: "observed", confidence: "medium" });
}

export function normalizeBrowserlessResult(input: {
  requestedUrl: string;
  raw: RawBrowserlessResult;
}): AnalysisResult {
  const samples = input.raw.samples ?? {};
  const allSamples = Object.values(samples).flat();
  const seenColors = new Set<string>();
  const seenTypography = new Set<string>();

  const colors: AnalysisResult["tokens"]["colors"] = [];
  const typography: AnalysisResult["tokens"]["typography"] = [];
  const spacing: AnalysisResult["tokens"]["spacing"] = [];
  const radii: AnalysisResult["tokens"]["radii"] = [];
  const shadows: AnalysisResult["tokens"]["shadows"] = [];
  const gradients: AnalysisResult["tokens"]["gradients"] = [];
  const effects: AnalysisResult["tokens"]["effects"] = [];

  allSamples.forEach((sample, index) => {
    const styles = sample.styles ?? {};
    pushUniqueToken(colors, seenColors, `color-${colors.length + 1}`, styles.color, "foreground");
    pushUniqueToken(colors, seenColors, `surface-${colors.length + 1}`, styles.backgroundColor, "surface");

    const typeValue = [styles.fontFamily, styles.fontSize, styles.fontWeight, styles.lineHeight]
      .filter(Boolean)
      .join(" / ");
    if (typeValue && !seenTypography.has(typeValue)) {
      seenTypography.add(typeValue);
      typography.push({
        name: `type-${typography.length + 1}`,
        value: typeValue,
        role: sample.text ? sample.text.slice(0, 60) : undefined,
        source: "observed",
        confidence: "medium"
      });
    }

    if (styles.padding) spacing.push({ name: `spacing-${index + 1}`, value: styles.padding, source: "observed", confidence: "low" });
    if (styles.borderRadius) radii.push({ name: `radius-${index + 1}`, value: styles.borderRadius, source: "observed", confidence: "medium" });
    if (styles.boxShadow && styles.boxShadow !== "none") shadows.push({ name: `shadow-${index + 1}`, value: styles.boxShadow, source: "observed", confidence: "medium" });
    if (styles.backgroundImage?.includes("gradient")) {
      gradients.push({
        name: `gradient-${gradients.length + 1}`,
        value: styles.backgroundImage,
        kind: styles.backgroundImage.includes("radial") ? "radial" : styles.backgroundImage.includes("conic") ? "conic" : "linear",
        stops: [],
        source: "observed",
        confidence: "medium"
      });
    }
    if (styles.filter && styles.filter !== "none") effects.push({ name: `filter-${index + 1}`, value: styles.filter, source: "observed", confidence: "medium" });
  });

  const sectionSamples = samples.sections ?? [];
  const componentSamples = [
    ...(samples.buttons ?? []).map((sample) => ({ type: "control", sample })),
    ...(samples.cards ?? []).map((sample) => ({ type: "card", sample })),
    ...(samples.images ?? []).map((sample) => ({ type: "media", sample }))
  ];

  return {
    source: {
      url: input.requestedUrl,
      analyzedAt: new Date().toISOString(),
      scanType: "single-page"
    },
    confidence: { overall: allSamples.length > 8 ? "high" : "medium" },
    page: {
      title: input.raw.title,
      description: input.raw.description,
      sections: sectionSamples.slice(0, 12).map((sample, index) => ({
        role: sample.selector ?? "section",
        heading: sample.text?.slice(0, 80),
        textSample: sample.text,
        order: index
      }))
    },
    tokens: { colors, typography, spacing, radii, shadows, gradients, effects },
    components: componentSamples.slice(0, 24).map(({ type, sample }, index) => ({
      type,
      name: `${type}-${index + 1}`,
      selector: sample.selector,
      description: sample.text,
      styles: Object.fromEntries(
        Object.entries(sample.styles ?? {}).filter((entry): entry is [string, string] => Boolean(entry[1]))
      ),
      states: [],
      confidence: "medium"
    })),
    evidence: ["Extracted with Browserless real-browser rendering."],
    assumptions: ["Single-page viewport sample; not a full site crawl."],
    gaps: []
  };
}
```

**Step 4: Verify test passes**

```bash
npx vitest run src/lib/browserless/normalize.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/lib/browserless/normalize.ts src/lib/browserless/normalize.test.ts
git commit -m "feat: normalize Browserless extraction results"
```

---

### Task 6: Add `/api/extract` Route

**Files:**
- Create: `src/app/api/extract/route.ts`
- Create: `src/app/api/extract/route.test.ts`

**Step 1: Write failing route tests**

Create `src/app/api/extract/route.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/browserless/config", () => ({
  getBrowserlessConfig: vi.fn(() => ({ enabled: false, error: "BROWSERLESS_NOT_CONFIGURED" }))
}));

import { POST } from "./route";

describe("POST /api/extract", () => {
  it("returns 400 for invalid JSON", async () => {
    const response = await POST(new Request("http://localhost/api/extract", { method: "POST", body: "{" }));
    expect(response.status).toBe(400);
  });

  it("returns 503 when Browserless is not configured", async () => {
    const response = await POST(
      new Request("http://localhost/api/extract", {
        method: "POST",
        body: JSON.stringify({ url: "https://example.com" })
      })
    );
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ code: "BROWSERLESS_NOT_CONFIGURED" });
  });
});
```

**Step 2: Run failing test**

```bash
npx vitest run src/app/api/extract/route.test.ts
```

Expected: FAIL because route does not exist.

**Step 3: Implement route skeleton**

Create `src/app/api/extract/route.ts`:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { analysisResultSchema } from "@/lib/analysis/types";
import { buildBrowserlessEndpoint, mapBrowserlessError } from "@/lib/browserless/client";
import { getBrowserlessConfig } from "@/lib/browserless/config";
import { buildBrowserlessExtractionQuery } from "@/lib/browserless/extraction-script";
import { normalizeBrowserlessResult } from "@/lib/browserless/normalize";
import { validatePublicHttpUrl } from "@/lib/security/url-validation";

export const runtime = "edge";

const requestSchema = z.object({
  url: z.string().min(1),
  mode: z.literal("high-fidelity").default("high-fidelity")
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body.", code: "INVALID_JSON" }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body.", code: "INVALID_REQUEST" }, { status: 400 });
  }

  const urlResult = validatePublicHttpUrl(parsed.data.url);
  if (!urlResult.ok) {
    return NextResponse.json({ error: urlResult.error, code: "INVALID_URL" }, { status: 400 });
  }

  const config = getBrowserlessConfig();
  if (!config.enabled) {
    return NextResponse.json(
      { error: "Browserless is not configured.", code: config.error },
      { status: 503 }
    );
  }

  const endpoint = buildBrowserlessEndpoint(config);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: buildBrowserlessExtractionQuery(urlResult.url, config.timeoutMs) }),
      signal: controller.signal
    });

    const text = await response.text();
    if (!response.ok) {
      const code = mapBrowserlessError(response.status, text);
      return NextResponse.json({ error: "Browserless extraction failed.", code }, { status: 502 });
    }

    const json = JSON.parse(text);
    const raw = json?.data?.evaluate?.value;
    if (!raw) {
      return NextResponse.json({ error: "Browserless returned an empty extraction.", code: "EXTRACTION_EMPTY" }, { status: 502 });
    }

    const rawValue = typeof raw === "string" ? JSON.parse(raw) : raw;
    const analysis = normalizeBrowserlessResult({ requestedUrl: urlResult.url, raw: rawValue });
    const validated = analysisResultSchema.parse(analysis);

    return NextResponse.json({
      analysis: validated,
      meta: {
        provider: "browserless",
        browser: config.browser,
        region: config.region,
        timedOut: false
      }
    });
  } catch (error) {
    const isAbort = error instanceof Error && error.name === "AbortError";
    return NextResponse.json(
      {
        error: isAbort ? "Browserless extraction timed out." : "Browserless extraction failed.",
        code: isAbort ? "BROWSERLESS_TIMEOUT" : "BROWSERLESS_REQUEST_FAILED"
      },
      { status: 502 }
    );
  } finally {
    clearTimeout(timeoutId);
  }
}
```

**Step 4: Verify route tests pass**

```bash
npx vitest run src/app/api/extract/route.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/app/api/extract/route.ts src/app/api/extract/route.test.ts
git commit -m "feat: add Browserless extraction API route"
```

---

### Task 7: Add Frontend High-Fidelity Flow With Fallback

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/app/page.test.tsx`

**Step 1: Add or update frontend tests**

Extend `src/app/page.test.tsx` to mock `fetch` for `/api/extract` and `/api/analyze`. Add an assertion that submitting a URL calls `/api/extract` before `/api/analyze`.

Example test body:

```ts
it("uses high-fidelity extraction before markdown generation", async () => {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === "/api/extract") {
      return Response.json({
        analysis: validAnalysisFixture,
        meta: { provider: "browserless", browser: "chrome", region: "sfo" }
      });
    }
    if (url === "/api/analyze") {
      return Response.json({ markdown: "# DESIGN.md" });
    }
    return Response.json({}, { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);

  render(<Home />);
  await userEvent.type(screen.getByLabelText(/website url/i), "https://example.com");
  await userEvent.click(screen.getByRole("button", { name: /generate/i }));

  await screen.findByText(/DESIGN.md generated successfully/i);
  expect(fetchMock.mock.calls[0][0]).toBe("/api/extract");
  expect(fetchMock.mock.calls[1][0]).toBe("/api/analyze");
});
```

Use the existing analysis test fixture pattern in the repo if present; otherwise create a small valid object matching `analysisResultSchema`.

**Step 2: Run failing test**

```bash
npx vitest run src/app/page.test.tsx
```

Expected: FAIL because current page uses `extractFromUrl()` first.

**Step 3: Modify submit flow**

In `src/app/page.tsx`, replace the block that calls `extractFromUrl(targetUrl)` and constructs `analysis` with:

```ts
setLogs((prev) => [
  ...prev,
  { id: prev.length, tag: "info", message: "Starting high-fidelity Browserless extraction", timestamp: now() }
]);

const extractResponse = await fetch("/api/extract", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ url: targetUrl, mode: "high-fidelity" })
});
const extractedBody = await extractResponse.json();

let analysis = extractedBody.analysis;
if (!extractResponse.ok || !analysis) {
  setLogs((prev) => [
    ...prev,
    { id: prev.length, tag: "warning", message: "High-fidelity extraction failed; using fast fallback", timestamp: now() }
  ]);

  const extracted = await extractFromUrl(targetUrl);
  analysis = {
    source: { url: targetUrl, analyzedAt: new Date().toISOString(), scanType: "single-page" as const },
    confidence: { overall: "medium" as const },
    page: { title: extracted.title, description: extracted.description, sections: extracted.sections },
    tokens: extracted.tokens,
    components: extracted.components,
    evidence: extracted.evidence,
    assumptions: extracted.assumptions,
    gaps: extracted.gaps
  };
}
```

Then keep the existing `/api/analyze` call unchanged.

**Step 4: Verify page test passes**

```bash
npx vitest run src/app/page.test.tsx
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/app/page.tsx src/app/page.test.tsx
git commit -m "feat: use Browserless high-fidelity extraction in UI"
```

---

### Task 8: Full Verification and Cloudflare Build Check

**Files:**
- No code changes unless verification reveals failures.

**Step 1: Run TypeScript**

```bash
npx tsc --noEmit
```

Expected: no output, exit 0.

**Step 2: Run all tests**

```bash
npx vitest run
```

Expected: all test files pass.

**Step 3: Run Next build**

```bash
npx next build
```

Expected: build succeeds.

**Step 4: Run Cloudflare Pages build**

```bash
npx @cloudflare/next-on-pages
```

Expected: build succeeds and includes `/api/extract`, `/api/analyze`, `/api/proxy` as edge routes.

**Step 5: Commit any verification fix**

If any small compatibility fix is needed:

```bash
git add <changed-files>
git commit -m "fix: verify Browserless extractor build compatibility"
```

If no changes are needed, do not create an empty commit.

---

### Task 9: Manual Smoke Test

**Files:**
- No required code changes.

**Step 1: Create `.env.local`**

Add locally, without committing:

```env
BROWSERLESS_API_TOKEN=your-token
BROWSERLESS_REGION=sfo
BROWSERLESS_BROWSER=chrome
BROWSERLESS_TIMEOUT_MS=50000
BROWSERLESS_USE_RESIDENTIAL_PROXY=false
BROWSERLESS_MAX_CONCURRENCY=2
```

**Step 2: Start local app**

```bash
npm run dev
```

**Step 3: Test static site**

Open `http://localhost:3000`, analyze `https://example.com`.

Expected:

- UI logs show Browserless extraction.
- DESIGN.md renders.
- No fallback warning unless Browserless fails.

**Step 4: Test JavaScript-heavy site**

Analyze the user's target site, for example `https://pawbytes.io/id` if still relevant.

Expected:

- Output is visibly richer than the old iframe-only flow.
- Colors, typography, sections, components, gradients/shadows are more specific.

**Step 5: Deploy**

Push all commits, configure Cloudflare Pages env variables, then retry deployment.

```bash
git push origin main
```

Expected:

- Cloudflare build succeeds.
- Production site does not show `nodejs_compat` error.
- High-fidelity extraction works with Browserless token configured.
