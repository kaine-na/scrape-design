# Website Design Markdown Generator Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a public, no-login web app that accepts one website URL and generates an AI-ready `DESIGN.md` from a Visual + DOM Analyzer.

**Architecture:** Use a Next.js full-stack app with API routes for URL validation, Playwright-powered page analysis, and LLM-based Markdown generation. Keep the MVP single-page only, request/response driven, and safe for public use with strict URL validation, timeouts, and rate limiting hooks.

**Tech Stack:** Next.js, TypeScript, React, Playwright, Zod, Vitest, Testing Library, Markdown/YAML validation, LLM provider adapter.

---

## Implementation Notes

- Follow the approved design in `docs/plans/2026-05-05-website-design-markdown-generator-design.md`.
- Use TDD for utility, analyzer, and API behavior before building UI polish.
- Commit after each task.
- Do not add login, dashboard, history, multi-page crawl, billing, or permanent storage in MVP.
- Treat all generated design claims as either `detected`, `observed`, or `inferred`.
- Keep the LLM provider behind an adapter so implementation can run tests without real network calls.

---

### Task 1: Scaffold Next.js Project

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `next.config.ts`
- Create: `vitest.config.ts`
- Create: `src/app/layout.tsx`
- Create: `src/app/page.tsx`
- Create: `src/app/globals.css`
- Create: `src/test/setup.ts`
- Create: `.gitignore`
- Create: `.env.example`

**Step 1: Create project configuration**

Create `package.json`:

```json
{
  "name": "scrape-design",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "next lint",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@playwright/test": "latest",
    "gray-matter": "latest",
    "next": "latest",
    "react": "latest",
    "react-dom": "latest",
    "zod": "latest"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "latest",
    "@testing-library/react": "latest",
    "@types/node": "latest",
    "@types/react": "latest",
    "@types/react-dom": "latest",
    "jsdom": "latest",
    "typescript": "latest",
    "vitest": "latest"
  }
}
```

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "es2022"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

Create `next.config.ts`:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {};

export default nextConfig;
```

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    globals: true
  },
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname
    }
  }
});
```

Create `src/test/setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
```

Create `.gitignore`:

```gitignore
node_modules
.next
.env
.env.local
.env.*.local
coverage
playwright-report
test-results
```

Create `.env.example`:

```bash
LLM_API_KEY=
LLM_MODEL=
ANALYSIS_TIMEOUT_MS=30000
```

**Step 2: Create minimal app shell**

Create `src/app/layout.tsx`:

```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Scrape Design",
  description: "Generate AI-ready DESIGN.md files from public website URLs."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

Create `src/app/page.tsx`:

```tsx
export default function HomePage() {
  return (
    <main>
      <h1>Generate DESIGN.md from any public website</h1>
      <p>Paste one URL. Get an AI-ready design specification.</p>
    </main>
  );
}
```

Create `src/app/globals.css`:

```css
:root {
  color: #14110f;
  background: #faf5ef;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: Georgia, "Times New Roman", serif;
}

main {
  min-height: 100vh;
  padding: 4rem 1.5rem;
}
```

**Step 3: Install dependencies**

Run: `npm install`

Expected: dependencies install and `package-lock.json` is created.

**Step 4: Run baseline checks**

Run: `npm run typecheck`

Expected: PASS.

Run: `npm test`

Expected: PASS with no tests or empty suite notice depending on Vitest version.

**Step 5: Commit**

```bash
git add .
git commit -m "chore: scaffold next app"
```

---

### Task 2: Add Shared Analysis Types

**Files:**
- Create: `src/lib/analysis/types.ts`
- Create: `src/lib/analysis/types.test.ts`

**Step 1: Write the failing test**

Create `src/lib/analysis/types.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { analysisResultSchema } from "./types";

describe("analysisResultSchema", () => {
  it("accepts a minimal single-page analysis result", () => {
    const result = analysisResultSchema.parse({
      source: {
        url: "https://example.com",
        analyzedAt: "2026-05-05T00:00:00.000Z",
        scanType: "single-page"
      },
      confidence: { overall: "medium" },
      page: {
        title: "Example",
        description: "Example page",
        sections: []
      },
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
    });

    expect(result.source.scanType).toBe("single-page");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/analysis/types.test.ts`

Expected: FAIL because `src/lib/analysis/types.ts` does not exist.

**Step 3: Write minimal implementation**

Create `src/lib/analysis/types.ts`:

```ts
import { z } from "zod";

export const confidenceSchema = z.enum(["high", "medium", "low"]);
export type Confidence = z.infer<typeof confidenceSchema>;

export const evidenceSourceSchema = z.enum([
  "detected",
  "observed",
  "inferred"
]);
export type EvidenceSource = z.infer<typeof evidenceSourceSchema>;

export const designTokenSchema = z.object({
  name: z.string(),
  value: z.string(),
  role: z.string().optional(),
  source: evidenceSourceSchema.default("detected"),
  confidence: confidenceSchema.default("medium")
});

export const componentSpecSchema = z.object({
  type: z.string(),
  name: z.string(),
  selector: z.string().optional(),
  description: z.string().optional(),
  styles: z.record(z.string(), z.string()).default({}),
  states: z
    .array(
      z.object({
        name: z.string(),
        source: evidenceSourceSchema,
        styles: z.record(z.string(), z.string()).default({})
      })
    )
    .default([]),
  confidence: confidenceSchema.default("medium")
});

export const pageSectionSchema = z.object({
  role: z.string(),
  heading: z.string().optional(),
  textSample: z.string().optional(),
  order: z.number().int().nonnegative()
});

export const analysisResultSchema = z.object({
  source: z.object({
    url: z.string().url(),
    analyzedAt: z.string(),
    scanType: z.literal("single-page")
  }),
  confidence: z.object({ overall: confidenceSchema }),
  page: z.object({
    title: z.string().optional(),
    description: z.string().optional(),
    sections: z.array(pageSectionSchema)
  }),
  tokens: z.object({
    colors: z.array(designTokenSchema),
    typography: z.array(designTokenSchema),
    spacing: z.array(designTokenSchema),
    radius: z.array(designTokenSchema),
    shadows: z.array(designTokenSchema),
    motion: z.array(designTokenSchema),
    breakpoints: z.array(designTokenSchema)
  }),
  components: z.array(componentSpecSchema),
  evidence: z.array(z.string()),
  assumptions: z.array(z.string()),
  gaps: z.array(z.string())
});

export type DesignToken = z.infer<typeof designTokenSchema>;
export type ComponentSpec = z.infer<typeof componentSpecSchema>;
export type AnalysisResult = z.infer<typeof analysisResultSchema>;
```

**Step 4: Run tests and typecheck**

Run: `npm test -- src/lib/analysis/types.test.ts`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/lib/analysis/types.ts src/lib/analysis/types.test.ts
git commit -m "feat: add analysis result types"
```

---

### Task 3: Implement Safe URL Validation

**Files:**
- Create: `src/lib/security/url-validation.ts`
- Create: `src/lib/security/url-validation.test.ts`

**Step 1: Write the failing test**

Create `src/lib/security/url-validation.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { validatePublicHttpUrl } from "./url-validation";

describe("validatePublicHttpUrl", () => {
  it("accepts public http and https URLs", () => {
    expect(validatePublicHttpUrl("https://example.com/path").ok).toBe(true);
    expect(validatePublicHttpUrl("http://example.com").ok).toBe(true);
  });

  it("rejects unsupported schemes", () => {
    expect(validatePublicHttpUrl("file:///etc/passwd").ok).toBe(false);
    expect(validatePublicHttpUrl("ftp://example.com").ok).toBe(false);
  });

  it("rejects localhost and private hosts", () => {
    expect(validatePublicHttpUrl("http://localhost:3000").ok).toBe(false);
    expect(validatePublicHttpUrl("http://127.0.0.1:3000").ok).toBe(false);
    expect(validatePublicHttpUrl("http://10.0.0.1").ok).toBe(false);
    expect(validatePublicHttpUrl("http://192.168.1.1").ok).toBe(false);
    expect(validatePublicHttpUrl("http://169.254.169.254").ok).toBe(false);
  });

  it("normalizes missing protocol to https", () => {
    const result = validatePublicHttpUrl("example.com");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.url).toBe("https://example.com/");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/security/url-validation.test.ts`

Expected: FAIL because implementation does not exist.

**Step 3: Write minimal implementation**

Create `src/lib/security/url-validation.ts`:

```ts
type ValidationResult =
  | { ok: true; url: string; hostname: string }
  | { ok: false; error: string };

const blockedHostnames = new Set(["localhost", "0.0.0.0"]);

function parseIpv4(hostname: string): number[] | null {
  const parts = hostname.split(".");
  if (parts.length !== 4) return null;

  const nums = parts.map((part) => Number(part));
  if (nums.some((num) => !Number.isInteger(num) || num < 0 || num > 255)) {
    return null;
  }

  return nums;
}

function isPrivateIpv4(hostname: string): boolean {
  const ip = parseIpv4(hostname);
  if (!ip) return false;
  const [a, b] = ip;

  return (
    a === 10 ||
    a === 127 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254) ||
    a === 0
  );
}

export function validatePublicHttpUrl(input: string): ValidationResult {
  const trimmed = input.trim();
  if (!trimmed) return { ok: false, error: "Please enter a URL." };

  const candidate = /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return { ok: false, error: "Please enter a valid public website URL." };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, error: "Only public HTTP and HTTPS URLs are supported." };
  }

  const hostname = url.hostname.toLowerCase();
  if (blockedHostnames.has(hostname) || hostname.endsWith(".localhost")) {
    return { ok: false, error: "Local URLs cannot be analyzed." };
  }

  if (isPrivateIpv4(hostname)) {
    return { ok: false, error: "Private network URLs cannot be analyzed." };
  }

  return { ok: true, url: url.toString(), hostname };
}
```

**Step 4: Run tests and typecheck**

Run: `npm test -- src/lib/security/url-validation.test.ts`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/lib/security/url-validation.ts src/lib/security/url-validation.test.ts
git commit -m "feat: validate public website urls"
```

---

### Task 4: Add Playwright Analyzer Contract And Stub

**Files:**
- Create: `src/lib/analyzer/analyze-url.ts`
- Create: `src/lib/analyzer/analyze-url.test.ts`

**Step 1: Write the failing test**

Create `src/lib/analyzer/analyze-url.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { analyzeUrl } from "./analyze-url";

describe("analyzeUrl", () => {
  it("returns a valid analysis result for a provided extractor result", async () => {
    const result = await analyzeUrl("https://example.com", {
      extract: async () => ({
        title: "Example Domain",
        description: "A fixture page",
        sections: [{ role: "hero", heading: "Example Domain", order: 0 }],
        tokens: {
          colors: [{ name: "text", value: "#111111", source: "detected" }],
          typography: [],
          spacing: [],
          radius: [],
          shadows: [],
          motion: [],
          breakpoints: []
        },
        components: [],
        evidence: ["Extracted title and hero heading."],
        assumptions: [],
        gaps: []
      })
    });

    expect(result.source.url).toBe("https://example.com/");
    expect(result.page.title).toBe("Example Domain");
    expect(result.confidence.overall).toBe("medium");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/analyzer/analyze-url.test.ts`

Expected: FAIL because implementation does not exist.

**Step 3: Write minimal implementation**

Create `src/lib/analyzer/analyze-url.ts`:

```ts
import { analysisResultSchema, type AnalysisResult } from "@/lib/analysis/types";
import { validatePublicHttpUrl } from "@/lib/security/url-validation";

type ExtractedPage = Omit<AnalysisResult, "source" | "confidence" | "page"> & {
  title?: string;
  description?: string;
  sections: AnalysisResult["page"]["sections"];
};

export interface PageExtractor {
  extract(url: string): Promise<ExtractedPage>;
}

export async function analyzeUrl(
  inputUrl: string,
  extractor: PageExtractor
): Promise<AnalysisResult> {
  const validation = validatePublicHttpUrl(inputUrl);
  if (!validation.ok) throw new Error(validation.error);

  const extracted = await extractor.extract(validation.url);

  return analysisResultSchema.parse({
    source: {
      url: validation.url,
      analyzedAt: new Date().toISOString(),
      scanType: "single-page"
    },
    confidence: { overall: "medium" },
    page: {
      title: extracted.title,
      description: extracted.description,
      sections: extracted.sections
    },
    tokens: extracted.tokens,
    components: extracted.components,
    evidence: extracted.evidence,
    assumptions: extracted.assumptions,
    gaps: extracted.gaps
  });
}
```

**Step 4: Run tests and typecheck**

Run: `npm test -- src/lib/analyzer/analyze-url.test.ts`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/lib/analyzer/analyze-url.ts src/lib/analyzer/analyze-url.test.ts
git commit -m "feat: add analyzer contract"
```

---

### Task 5: Implement DOM Style Extractor

**Files:**
- Create: `src/lib/analyzer/playwright-extractor.ts`
- Create: `src/lib/analyzer/playwright-extractor.test.ts`

**Step 1: Write the failing test**

Create `src/lib/analyzer/playwright-extractor.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { extractFromHtml } from "./playwright-extractor";

describe("extractFromHtml", () => {
  it("extracts core visual tokens and components from rendered HTML", async () => {
    const html = `
      <html>
        <head>
          <title>Fixture</title>
          <style>
            body { font-family: Urbanist, sans-serif; color: #111827; background: #f8fafc; }
            h1 { font-size: 64px; line-height: 72px; }
            .cta { background: #fd3a25; color: white; border-radius: 999px; padding: 14px 24px; transition: transform 180ms ease; }
            .card { box-shadow: 0 12px 30px rgba(0,0,0,.12); padding: 32px; border-radius: 32px; }
            @media (max-width: 768px) { h1 { font-size: 40px; } }
          </style>
        </head>
        <body>
          <header><nav><a href="/">Home</a></nav></header>
          <main><section><h1>Hero Title</h1><button class="cta">Start</button><article class="card">Card</article></section></main>
        </body>
      </html>
    `;

    const result = await extractFromHtml(html);

    expect(result.title).toBe("Fixture");
    expect(result.sections[0]?.heading).toBe("Hero Title");
    expect(result.tokens.colors.some((token) => token.value === "rgb(253, 58, 37)")).toBe(true);
    expect(result.tokens.radius.some((token) => token.value === "999px")).toBe(true);
    expect(result.tokens.motion.some((token) => token.value.includes("180ms"))).toBe(true);
    expect(result.components.some((component) => component.type === "button")).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/analyzer/playwright-extractor.test.ts`

Expected: FAIL because implementation does not exist.

**Step 3: Write minimal implementation**

Create `src/lib/analyzer/playwright-extractor.ts`:

```ts
import { chromium } from "@playwright/test";
import type { PageExtractor } from "./analyze-url";

const interestingSelector = [
  "body",
  "header",
  "nav",
  "main",
  "section",
  "article",
  "h1",
  "h2",
  "h3",
  "button",
  "a",
  "input",
  "textarea",
  "select",
  ".card",
  "[class*='card']",
  "[class*='btn']",
  "[class*='button']"
].join(",");

function uniqueValues(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).slice(0, 30);
}

export async function extractFromHtml(html: string) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

  try {
    await page.setContent(html, { waitUntil: "domcontentloaded" });
    return await page.evaluate((selector) => {
      const elements = Array.from(document.querySelectorAll(selector)).slice(0, 200);
      const styles = elements.map((element) => {
        const style = getComputedStyle(element);
        return {
          tag: element.tagName.toLowerCase(),
          text: element.textContent?.trim().slice(0, 120) || "",
          selector: element.tagName.toLowerCase(),
          color: style.color,
          backgroundColor: style.backgroundColor,
          fontFamily: style.fontFamily,
          fontSize: style.fontSize,
          fontWeight: style.fontWeight,
          lineHeight: style.lineHeight,
          padding: style.padding,
          gap: style.gap,
          borderRadius: style.borderRadius,
          boxShadow: style.boxShadow,
          transition: style.transition
        };
      });

      const token = (name: string, value: string) => ({
        name,
        value,
        source: "detected" as const,
        confidence: "medium" as const
      });

      const title = document.title || undefined;
      const description = document
        .querySelector('meta[name="description"]')
        ?.getAttribute("content") || undefined;
      const headings = Array.from(document.querySelectorAll("h1,h2,h3"));

      return {
        title,
        description,
        sections: headings.slice(0, 12).map((heading, index) => ({
          role: index === 0 ? "hero" : "section",
          heading: heading.textContent?.trim() || undefined,
          order: index
        })),
        tokens: {
          colors: uniqueValues(styles.flatMap((style) => [style.color, style.backgroundColor]))
            .filter((value) => value !== "rgba(0, 0, 0, 0)")
            .map((value, index) => token(`color-${index + 1}`, value)),
          typography: uniqueValues(styles.map((style) => `${style.fontFamily} / ${style.fontSize} / ${style.fontWeight} / ${style.lineHeight}`))
            .map((value, index) => token(`type-${index + 1}`, value)),
          spacing: uniqueValues(styles.flatMap((style) => [style.padding, style.gap]))
            .filter((value) => value !== "0px" && value !== "normal")
            .map((value, index) => token(`space-${index + 1}`, value)),
          radius: uniqueValues(styles.map((style) => style.borderRadius))
            .filter((value) => value !== "0px")
            .map((value, index) => token(`radius-${index + 1}`, value)),
          shadows: uniqueValues(styles.map((style) => style.boxShadow))
            .filter((value) => value !== "none")
            .map((value, index) => token(`shadow-${index + 1}`, value)),
          motion: uniqueValues(styles.map((style) => style.transition))
            .filter((value) => value !== "all" && value !== "none" && value !== "")
            .map((value, index) => token(`motion-${index + 1}`, value)),
          breakpoints: Array.from(document.styleSheets).length
            ? [token("responsive-css", "media queries may be present in stylesheets")]
            : []
        },
        components: styles
          .filter((style) => ["button", "a", "input", "textarea", "select", "article"].includes(style.tag))
          .slice(0, 40)
          .map((style, index) => ({
            type: style.tag === "a" ? "link" : style.tag,
            name: `${style.tag}-${index + 1}`,
            selector: style.selector,
            description: style.text,
            styles: {
              color: style.color,
              backgroundColor: style.backgroundColor,
              borderRadius: style.borderRadius,
              padding: style.padding,
              boxShadow: style.boxShadow,
              transition: style.transition
            },
            states: [],
            confidence: "medium" as const
          })),
        evidence: ["Extracted computed styles from rendered DOM."],
        assumptions: [],
        gaps: []
      };
    }, interestingSelector);
  } finally {
    await browser.close();
  }
}

export const playwrightExtractor: PageExtractor = {
  async extract(url: string) {
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

    try {
      await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
      const html = await page.content();
      return await extractFromHtml(html);
    } finally {
      await browser.close();
    }
  }
};
```

**Step 4: Install Playwright browser**

Run: `npx playwright install chromium`

Expected: Chromium browser installed.

**Step 5: Run tests and typecheck**

Run: `npm test -- src/lib/analyzer/playwright-extractor.test.ts`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS.

**Step 6: Commit**

```bash
git add src/lib/analyzer/playwright-extractor.ts src/lib/analyzer/playwright-extractor.test.ts package-lock.json
git commit -m "feat: extract visual tokens from rendered pages"
```

---

### Task 6: Generate DESIGN.md From Analysis Data

**Files:**
- Create: `src/lib/generator/design-md.ts`
- Create: `src/lib/generator/design-md.test.ts`

**Step 1: Write the failing test**

Create `src/lib/generator/design-md.test.ts`:

```ts
import matter from "gray-matter";
import { describe, expect, it } from "vitest";
import { generateDesignMarkdown } from "./design-md";
import type { AnalysisResult } from "@/lib/analysis/types";

const analysis: AnalysisResult = {
  source: {
    url: "https://example.com/",
    analyzedAt: "2026-05-05T00:00:00.000Z",
    scanType: "single-page"
  },
  confidence: { overall: "medium" },
  page: {
    title: "Example",
    description: "Example page",
    sections: [{ role: "hero", heading: "Hero", order: 0 }]
  },
  tokens: {
    colors: [{ name: "primary", value: "#111111", source: "detected", confidence: "high" }],
    typography: [],
    spacing: [],
    radius: [],
    shadows: [],
    motion: [],
    breakpoints: []
  },
  components: [],
  evidence: ["Detected primary color."],
  assumptions: ["Button hierarchy inferred from placement."],
  gaps: ["No mobile screenshot captured."]
};

describe("generateDesignMarkdown", () => {
  it("creates valid front matter and required sections", () => {
    const markdown = generateDesignMarkdown(analysis);
    const parsed = matter(markdown);

    expect(parsed.data.source.url).toBe("https://example.com/");
    expect(markdown).toContain("## 8. Interaction & Feedback States");
    expect(markdown).toContain("## 9. Motion & Animation Guidelines");
    expect(markdown).toContain("## 17. Evidence, Assumptions & Gaps");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/generator/design-md.test.ts`

Expected: FAIL because implementation does not exist.

**Step 3: Write minimal implementation**

Create `src/lib/generator/design-md.ts`:

```ts
import type { AnalysisResult, DesignToken } from "@/lib/analysis/types";

function yamlString(value: string): string {
  return JSON.stringify(value);
}

function tokenList(tokens: DesignToken[]): string {
  if (!tokens.length) return "- No reliable tokens detected. Treat this section as low confidence.";
  return tokens
    .map((token) => `- **${token.name}**: \`${token.value}\` (${token.source}, ${token.confidence})${token.role ? ` — ${token.role}` : ""}`)
    .join("\n");
}

function sectionList(analysis: AnalysisResult): string {
  if (!analysis.page.sections.length) return "- No clear page sections detected.";
  return analysis.page.sections
    .map((section) => `- ${section.order + 1}. **${section.role}**${section.heading ? ` — ${section.heading}` : ""}`)
    .join("\n");
}

function componentList(analysis: AnalysisResult): string {
  if (!analysis.components.length) return "- No reusable components detected with enough confidence.";
  return analysis.components
    .map((component) => {
      const styles = Object.entries(component.styles)
        .filter(([, value]) => value && value !== "none" && value !== "0px")
        .map(([key, value]) => `  - ${key}: \`${value}\``)
        .join("\n");
      return `### ${component.name}\n\n- Type: ${component.type}\n- Confidence: ${component.confidence}\n${styles || "- No distinctive styles detected."}`;
    })
    .join("\n\n");
}

export function generateDesignMarkdown(analysis: AnalysisResult): string {
  return `---
version: 1
source:
  url: ${yamlString(analysis.source.url)}
  analyzedAt: ${yamlString(analysis.source.analyzedAt)}
  scanType: ${yamlString(analysis.source.scanType)}
confidence:
  overall: ${yamlString(analysis.confidence.overall)}
tokens:
  colors: ${analysis.tokens.colors.length}
  typography: ${analysis.tokens.typography.length}
  spacing: ${analysis.tokens.spacing.length}
  radius: ${analysis.tokens.radius.length}
  shadows: ${analysis.tokens.shadows.length}
  motion: ${analysis.tokens.motion.length}
  breakpoints: ${analysis.tokens.breakpoints.length}
components:
  count: ${analysis.components.length}
---

# DESIGN.md

## 1. Source Summary

- Source URL: ${analysis.source.url}
- Scan type: ${analysis.source.scanType}
- Overall confidence: ${analysis.confidence.overall}
- Page title: ${analysis.page.title || "Not detected"}
- Description: ${analysis.page.description || "Not detected"}

## 2. Visual Theme & Brand Atmosphere

Describe the visual atmosphere from detected colors, typography, spacing, and component treatments. Prefer evidence-backed language and mark uncertain claims as inferred.

## 3. Design Tokens

### Colors
${tokenList(analysis.tokens.colors)}

### Typography
${tokenList(analysis.tokens.typography)}

### Spacing
${tokenList(analysis.tokens.spacing)}

### Radius
${tokenList(analysis.tokens.radius)}

### Shadows
${tokenList(analysis.tokens.shadows)}

### Motion
${tokenList(analysis.tokens.motion)}

### Breakpoints
${tokenList(analysis.tokens.breakpoints)}

## 4. Typography System

Use detected typography tokens as the source of truth. Preserve font families, scale relationships, weights, line heights, and responsive changes when implementing.

## 5. Color System & Semantic Roles

Map detected colors into semantic roles: background, foreground, primary action, secondary text, border, surface, success, warning, and error. Do not invent extra colors unless needed for accessibility.

## 6. Layout, Grid & Spacing

Use detected spacing and layout evidence to recreate section rhythm, container width, grid/flex behavior, and whitespace. Prefer tokenized spacing over one-off values.

## 7. Component Specifications

${componentList(analysis)}

## 8. Interaction & Feedback States

Document hover, focus, active, disabled, loading, success, error, and empty states. Label each as detected, observed, or inferred.

## 9. Motion & Animation Guidelines

Use detected transition and animation tokens where available. Keep motion purposeful, short, and tied to interaction or section reveal behavior.

## 10. Responsive Behavior

Use detected breakpoint evidence where available. At minimum, support desktop, tablet, and mobile layouts without horizontal overflow.

## 11. Accessibility Requirements

Validate color contrast, keyboard focus states, semantic headings, form labels, and minimum 44px touch targets for interactive elements.

## 12. Content & Page Structure

${sectionList(analysis)}

## 13. Tech Stack Signals & Implementation Guidance

Implementation should use tokenized CSS and reusable components. Treat any framework/library identification as a signal unless directly detected from source assets.

## 14. AI Agent Implementation Prompt

Build a web page that follows this design system. Use the tokens and component specs above as source of truth. Do not replace distinctive typography, spacing, radius, shadows, or motion with generic defaults. Preserve responsive behavior and accessibility requirements.

## 15. Do's and Don'ts

- Do use detected tokens consistently.
- Do preserve component hierarchy and section rhythm.
- Do label uncertain design details as inferred.
- Don't hardcode unrelated colors or fonts.
- Don't claim unsupported stack details as facts.

## 16. Validation Checklist

- YAML front matter is valid.
- Tokens are applied consistently.
- Components include interaction and feedback states.
- Layout works on desktop, tablet, and mobile.
- Accessibility checks pass WCAG AA where possible.
- Implementation matches detected design evidence.

## 17. Evidence, Assumptions & Gaps

### Evidence
${analysis.evidence.map((item) => `- ${item}`).join("\n") || "- No evidence recorded."}

### Assumptions
${analysis.assumptions.map((item) => `- ${item}`).join("\n") || "- No assumptions recorded."}

### Gaps
${analysis.gaps.map((item) => `- ${item}`).join("\n") || "- No gaps recorded."}
`;
}
```

**Step 4: Run tests and typecheck**

Run: `npm test -- src/lib/generator/design-md.test.ts`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/lib/generator/design-md.ts src/lib/generator/design-md.test.ts
git commit -m "feat: generate design markdown"
```

---

### Task 7: Add API Route For Analyze Requests

**Files:**
- Create: `src/app/api/analyze/route.ts`
- Create: `src/app/api/analyze/route.test.ts`

**Step 1: Write the failing test**

Create `src/app/api/analyze/route.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/analyzer/playwright-extractor", () => ({
  playwrightExtractor: {
    extract: async () => ({
      title: "Example",
      description: "Example page",
      sections: [{ role: "hero", heading: "Example", order: 0 }],
      tokens: {
        colors: [], typography: [], spacing: [], radius: [], shadows: [], motion: [], breakpoints: []
      },
      components: [],
      evidence: ["Mock extraction."],
      assumptions: [],
      gaps: []
    })
  }
}));

import { POST } from "./route";

describe("POST /api/analyze", () => {
  it("returns generated markdown for a valid URL", async () => {
    const request = new Request("http://localhost/api/analyze", {
      method: "POST",
      body: JSON.stringify({ url: "https://example.com" })
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.markdown).toContain("# DESIGN.md");
  });

  it("rejects invalid URLs", async () => {
    const request = new Request("http://localhost/api/analyze", {
      method: "POST",
      body: JSON.stringify({ url: "http://localhost:3000" })
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/app/api/analyze/route.test.ts`

Expected: FAIL because route does not exist.

**Step 3: Write minimal implementation**

Create `src/app/api/analyze/route.ts`:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { analyzeUrl } from "@/lib/analyzer/analyze-url";
import { playwrightExtractor } from "@/lib/analyzer/playwright-extractor";
import { generateDesignMarkdown } from "@/lib/generator/design-md";

const requestSchema = z.object({ url: z.string().min(1) });

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Please enter a valid public website URL." }, { status: 400 });
  }

  try {
    const analysis = await analyzeUrl(parsed.data.url, playwrightExtractor);
    const markdown = generateDesignMarkdown(analysis);
    return NextResponse.json({ analysis, markdown });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The design analysis failed. Please retry.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
```

**Step 4: Run tests and typecheck**

Run: `npm test -- src/app/api/analyze/route.test.ts`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/app/api/analyze/route.ts src/app/api/analyze/route.test.ts
git commit -m "feat: add analyze api route"
```

---

### Task 8: Build Homepage Form And Result Preview

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/app/globals.css`
- Create: `src/app/page.test.tsx`

**Step 1: Write the failing test**

Create `src/app/page.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import HomePage from "./page";

describe("HomePage", () => {
  it("renders URL input and generate action", () => {
    render(<HomePage />);

    expect(screen.getByLabelText(/website url/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /generate design\.md/i })).toBeInTheDocument();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/app/page.test.tsx`

Expected: FAIL because the input and button do not exist.

**Step 3: Write minimal UI implementation**

Modify `src/app/page.tsx`:

```tsx
"use client";

import { useState } from "react";

const progressSteps = [
  "Fetching page",
  "Rendering website",
  "Extracting visual system",
  "Analyzing components",
  "Writing DESIGN.md"
];

export default function HomePage() {
  const [url, setUrl] = useState("");
  const [markdown, setMarkdown] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMarkdown("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "The design analysis failed.");
      setMarkdown(body.markdown);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The design analysis failed.");
    } finally {
      setIsLoading(false);
    }
  }

  function downloadMarkdown() {
    const blob = new Blob([markdown], { type: "text/markdown" });
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = "DESIGN.md";
    link.click();
    URL.revokeObjectURL(href);
  }

  return (
    <main className="shell">
      <section className="hero" aria-labelledby="hero-title">
        <p className="eyebrow">Single-page Visual + DOM Analyzer</p>
        <h1 id="hero-title">Generate an AI-ready DESIGN.md from any public website.</h1>
        <p className="intro">Paste one URL. Get tokens, components, interactions, motion, responsive notes, and implementation guidance.</p>
        <form className="url-form" onSubmit={handleSubmit}>
          <label htmlFor="website-url">Website URL</label>
          <div className="input-row">
            <input
              id="website-url"
              name="url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://example.com"
              required
            />
            <button type="submit" disabled={isLoading}>{isLoading ? "Analyzing..." : "Generate DESIGN.md"}</button>
          </div>
        </form>
      </section>

      {isLoading ? (
        <section className="panel" aria-live="polite">
          <h2>Analyzing website</h2>
          <ol className="steps">{progressSteps.map((step) => <li key={step}>{step}</li>)}</ol>
        </section>
      ) : null}

      {error ? <section className="error" role="alert">{error}</section> : null}

      {markdown ? (
        <section className="result">
          <div className="result-actions">
            <h2>Generated DESIGN.md</h2>
            <button type="button" onClick={() => navigator.clipboard.writeText(markdown)}>Copy</button>
            <button type="button" onClick={downloadMarkdown}>Download</button>
          </div>
          <pre>{markdown}</pre>
        </section>
      ) : null}
    </main>
  );
}
```

Modify `src/app/globals.css` with a polished responsive style. Keep the implementation simple, but avoid generic default UI:

```css
:root {
  --ink: #17120d;
  --muted: #6f6256;
  --paper: #fff9ef;
  --clay: #c96f43;
  --moss: #43513a;
  --cream: #f3dfbd;
  --line: rgba(23, 18, 13, 0.16);
}

* { box-sizing: border-box; }

body {
  margin: 0;
  color: var(--ink);
  background:
    radial-gradient(circle at 12% 10%, rgba(201, 111, 67, 0.24), transparent 28rem),
    radial-gradient(circle at 85% 0%, rgba(67, 81, 58, 0.2), transparent 24rem),
    var(--paper);
  font-family: Georgia, "Times New Roman", serif;
}

button,
input {
  font: inherit;
}

.shell {
  width: min(1120px, calc(100% - 32px));
  margin: 0 auto;
  padding: 64px 0;
}

.hero {
  padding: clamp(32px, 8vw, 88px);
  border: 1px solid var(--line);
  border-radius: 36px;
  background: rgba(255, 249, 239, 0.76);
  box-shadow: 0 24px 80px rgba(23, 18, 13, 0.12);
}

.eyebrow {
  margin: 0 0 16px;
  color: var(--clay);
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

h1 {
  max-width: 920px;
  margin: 0;
  font-size: clamp(44px, 8vw, 96px);
  line-height: 0.95;
  letter-spacing: -0.06em;
}

.intro {
  max-width: 720px;
  margin: 24px 0 0;
  color: var(--muted);
  font-size: clamp(18px, 2vw, 24px);
  line-height: 1.45;
}

.url-form {
  margin-top: 40px;
}

.url-form label {
  display: block;
  margin-bottom: 10px;
  font-weight: 700;
}

.input-row {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 12px;
}

input {
  min-height: 58px;
  width: 100%;
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 0 22px;
  background: white;
  color: var(--ink);
}

button {
  min-height: 58px;
  border: 0;
  border-radius: 999px;
  padding: 0 24px;
  color: #fffaf3;
  background: var(--ink);
  cursor: pointer;
  box-shadow: inset 0 -3px 0 rgba(255, 255, 255, 0.16), 0 16px 36px rgba(23, 18, 13, 0.22);
}

button:disabled {
  cursor: wait;
  opacity: 0.64;
}

.panel,
.result,
.error {
  margin-top: 24px;
  border-radius: 28px;
  padding: 24px;
  background: rgba(255, 249, 239, 0.82);
  border: 1px solid var(--line);
}

.error {
  color: #9f2d22;
  background: #ffe8df;
}

.steps {
  display: grid;
  gap: 10px;
  padding-left: 24px;
}

.result-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.result-actions h2 {
  margin-right: auto;
}

pre {
  max-height: 720px;
  overflow: auto;
  padding: 20px;
  border-radius: 18px;
  background: #17120d;
  color: #fff9ef;
  white-space: pre-wrap;
}

@media (max-width: 720px) {
  .input-row {
    grid-template-columns: 1fr;
  }

  button {
    width: 100%;
  }
}
```

**Step 4: Run tests and typecheck**

Run: `npm test -- src/app/page.test.tsx`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/app/page.tsx src/app/globals.css src/app/page.test.tsx
git commit -m "feat: build url analysis interface"
```

---

### Task 9: Add LLM Adapter Interface

**Files:**
- Create: `src/lib/llm/types.ts`
- Create: `src/lib/llm/mock-provider.ts`
- Create: `src/lib/llm/generate-with-llm.ts`
- Create: `src/lib/llm/generate-with-llm.test.ts`
- Modify: `src/app/api/analyze/route.ts`

**Step 1: Write the failing test**

Create `src/lib/llm/generate-with-llm.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { generateWithLlm } from "./generate-with-llm";
import type { AnalysisResult } from "@/lib/analysis/types";

const analysis: AnalysisResult = {
  source: { url: "https://example.com/", analyzedAt: "2026-05-05T00:00:00.000Z", scanType: "single-page" },
  confidence: { overall: "medium" },
  page: { title: "Example", sections: [] },
  tokens: { colors: [], typography: [], spacing: [], radius: [], shadows: [], motion: [], breakpoints: [] },
  components: [],
  evidence: [],
  assumptions: [],
  gaps: []
};

describe("generateWithLlm", () => {
  it("delegates to provider with structured analysis", async () => {
    const markdown = await generateWithLlm(analysis, {
      complete: async ({ analysis }) => `# DESIGN.md\n${analysis.source.url}`
    });

    expect(markdown).toContain("https://example.com/");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/llm/generate-with-llm.test.ts`

Expected: FAIL because implementation does not exist.

**Step 3: Write implementation**

Create `src/lib/llm/types.ts`:

```ts
import type { AnalysisResult } from "@/lib/analysis/types";

export interface DesignMarkdownProvider {
  complete(input: { analysis: AnalysisResult; prompt: string }): Promise<string>;
}
```

Create `src/lib/llm/generate-with-llm.ts`:

```ts
import type { AnalysisResult } from "@/lib/analysis/types";
import type { DesignMarkdownProvider } from "./types";

export function buildDesignPrompt(analysis: AnalysisResult): string {
  return `Generate a comprehensive AI-ready DESIGN.md for ${analysis.source.url}. Include YAML front matter, tokens, components, interactions, motion, responsive behavior, accessibility, implementation guidance, validation criteria, and evidence/assumptions/gaps. Do not overclaim uncertain findings.`;
}

export async function generateWithLlm(
  analysis: AnalysisResult,
  provider: DesignMarkdownProvider
): Promise<string> {
  return provider.complete({ analysis, prompt: buildDesignPrompt(analysis) });
}
```

Create `src/lib/llm/mock-provider.ts`:

```ts
import { generateDesignMarkdown } from "@/lib/generator/design-md";
import type { DesignMarkdownProvider } from "./types";

export const mockDesignMarkdownProvider: DesignMarkdownProvider = {
  async complete({ analysis }) {
    return generateDesignMarkdown(analysis);
  }
};
```

Modify `src/app/api/analyze/route.ts` to call the LLM adapter:

```ts
import { generateWithLlm } from "@/lib/llm/generate-with-llm";
import { mockDesignMarkdownProvider } from "@/lib/llm/mock-provider";
```

Replace:

```ts
const markdown = generateDesignMarkdown(analysis);
```

With:

```ts
const markdown = await generateWithLlm(analysis, mockDesignMarkdownProvider);
```

Remove the unused `generateDesignMarkdown` import.

**Step 4: Run tests and typecheck**

Run: `npm test -- src/lib/llm/generate-with-llm.test.ts src/app/api/analyze/route.test.ts`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/lib/llm src/app/api/analyze/route.ts
git commit -m "feat: add design markdown llm adapter"
```

---

### Task 10: Add Basic In-Memory Rate Limiting

**Files:**
- Create: `src/lib/security/rate-limit.ts`
- Create: `src/lib/security/rate-limit.test.ts`
- Modify: `src/app/api/analyze/route.ts`

**Step 1: Write the failing test**

Create `src/lib/security/rate-limit.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createRateLimiter } from "./rate-limit";

describe("createRateLimiter", () => {
  it("blocks requests after the configured limit", () => {
    const limiter = createRateLimiter({ maxRequests: 2, windowMs: 60_000 });

    expect(limiter.check("client").allowed).toBe(true);
    expect(limiter.check("client").allowed).toBe(true);
    expect(limiter.check("client").allowed).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/security/rate-limit.test.ts`

Expected: FAIL because implementation does not exist.

**Step 3: Write implementation**

Create `src/lib/security/rate-limit.ts`:

```ts
interface RateLimitOptions {
  maxRequests: number;
  windowMs: number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

export function createRateLimiter(options: RateLimitOptions) {
  const buckets = new Map<string, Bucket>();

  return {
    check(key: string, now = Date.now()) {
      const bucket = buckets.get(key);
      if (!bucket || bucket.resetAt <= now) {
        buckets.set(key, { count: 1, resetAt: now + options.windowMs });
        return { allowed: true, remaining: options.maxRequests - 1 };
      }

      if (bucket.count >= options.maxRequests) {
        return { allowed: false, remaining: 0, resetAt: bucket.resetAt };
      }

      bucket.count += 1;
      return { allowed: true, remaining: options.maxRequests - bucket.count };
    }
  };
}
```

Modify `src/app/api/analyze/route.ts`:

```ts
import { createRateLimiter } from "@/lib/security/rate-limit";

const rateLimiter = createRateLimiter({ maxRequests: 10, windowMs: 60_000 });
```

At the start of `POST`, add:

```ts
const clientKey = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anonymous";
const rateLimit = rateLimiter.check(clientKey);
if (!rateLimit.allowed) {
  return NextResponse.json({ error: "Too many requests. Please wait and try again." }, { status: 429 });
}
```

**Step 4: Run tests and typecheck**

Run: `npm test -- src/lib/security/rate-limit.test.ts src/app/api/analyze/route.test.ts`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/lib/security/rate-limit.ts src/lib/security/rate-limit.test.ts src/app/api/analyze/route.ts
git commit -m "feat: rate limit analyze requests"
```

---

### Task 11: Add Documentation And Environment Guide

**Files:**
- Create: `README.md`
- Modify: `.env.example`

**Step 1: Write README**

Create `README.md`:

```md
# Scrape Design

Scrape Design is a public web app that turns one public website URL into an AI-ready `DESIGN.md`.

## MVP Scope

- Single-page scan only.
- No login.
- No permanent result storage.
- Visual + DOM analysis through Playwright.
- Markdown generation through an LLM adapter.

## Local Development

```bash
npm install
npx playwright install chromium
npm run dev
```

Open `http://localhost:3000`.

## Quality Checks

```bash
npm test
npm run typecheck
npm run build
```

## Environment

Copy `.env.example` to `.env.local` and fill provider settings when using a real LLM provider.

## Safety

The analyzer rejects localhost, private IP ranges, unsupported URL schemes, and obvious metadata endpoints. Keep these protections before deploying publicly.
```

Update `.env.example`:

```bash
LLM_API_KEY=
LLM_MODEL=
ANALYSIS_TIMEOUT_MS=30000
RATE_LIMIT_MAX_REQUESTS=10
RATE_LIMIT_WINDOW_MS=60000
```

**Step 2: Run checks**

Run: `npm run typecheck`

Expected: PASS.

Run: `npm test`

Expected: PASS.

**Step 3: Commit**

```bash
git add README.md .env.example
git commit -m "docs: add project setup guide"
```

---

### Task 12: Final Build Validation

**Files:**
- No source file changes expected unless checks reveal issues.

**Step 1: Run full test suite**

Run: `npm test`

Expected: PASS.

**Step 2: Run typecheck**

Run: `npm run typecheck`

Expected: PASS.

**Step 3: Run production build**

Run: `npm run build`

Expected: PASS.

**Step 4: Smoke test locally**

Run: `npm run dev`

Open `http://localhost:3000` and verify:

- Homepage loads.
- URL input is visible.
- Invalid URL displays a human-friendly error.
- `https://example.com` generates a Markdown preview.
- Copy button copies Markdown.
- Download button downloads `DESIGN.md`.
- Mobile viewport does not overflow horizontally.

**Step 5: Commit any fixes**

If fixes were needed:

```bash
git add .
git commit -m "fix: resolve final validation issues"
```

If no fixes were needed, do not create an empty commit.

**Step 6: Push branch**

```bash
git push origin main
```
