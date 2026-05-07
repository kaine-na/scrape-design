# Scrape Design

Turn any public website URL into an AI-ready `DESIGN.md` design system document.

The app renders the target page with Playwright, extracts live DOM and 40+ computed CSS properties, then sends compact analysis data to an OpenAI-compatible LLM provider to generate a comprehensive, pixel-accurate design-system document with CSS code blocks.

## Features

### Analysis
- **40+ CSS properties** extracted: colors, typography, spacing, radius, shadows, gradients, glass effects, animations, transforms, depth/layering
- **Structured shadow parsing** with multi-layer decomposition (inset, offset, blur, spread, color per layer)
- **Gradient classification** (linear, radial, conic) with angle and color stop extraction
- **Glass/effects detection** (backdrop-filter, filter, mix-blend-mode, opacity)
- **Full animation specs** (name, duration, timing-function, delay, iteration-count, direction, fill-mode)
- **Component family detection** with style deduplication and interaction state tracking
- **Layout depth analysis** (z-index layers, flex/grid counts, sticky positioning)
- **Framework detection** (Next.js, Tailwind, Framer, Webflow, GSAP)

### UI
- Clean professional design with **Plus Jakarta Sans** font
- **Terminal-style log panel** with staggered real-time progress entries
- **Rendered markdown preview** with syntax-highlighted CSS code blocks
- **Live web preview iframe** with blocked-site fallback detection
- **View toggle** (Preview / Source) for DESIGN.md output
- **Interactive polygon wireframe background** with 3D mouse-tracking tilt
- **Demo CTA** linking to scraped result clone
- **GitHub footer** with repository link

### LLM
- OpenAI-compatible provider with **streaming SSE** and non-streaming JSON support
- **Compact prompt brain** with few-shot CSS examples (shadows, gradients, glass, animations, colors)
- **Mock provider fallback** when no API key is configured
- Auto-detection of OpenAI, Groq, Gemini, DeepSeek, and OpenRouter

### Performance
- **Resource blocking** in Playwright (images, fonts, media) for 50-80% faster page loads
- **CSS animation disabling** via addInitScript for instant rendering
- **Compressed prompts** (~60% smaller than typical) for faster LLM response
- Optimized for **sub-60-second end-to-end** with Groq or Gemini Flash

### Safety
- URL validation (rejects localhost, private IPs, non-HTTP schemes)
- In-memory rate limiting (10 req/60s per IP)
- No login, no permanent storage

## Requirements

- Node.js 20.19+ or 22.12+
- npm
- A public website URL to analyze
- OpenAI-compatible LLM endpoint (optional -- mock fallback included)

## Quick Start

```bash
npm install
npx playwright install chromium
cp .env.example .env.local
# Edit .env.local with your API key
npm run dev
```

Open http://localhost:3000

## Environment Variables

### Recommended Fast Setup (sub-60s response)

**Groq** (fastest, 300-935 TPS):
```bash
LLM_API_KEY=gsk_...
LLM_BASE_URL=https://api.groq.com/openai/v1
LLM_MODEL=llama-3.3-70b-versatile
LLM_STREAM=true
LLM_TIMEOUT_MS=60000
LLM_MAX_TOKENS=3000
```

**Gemini Flash** (high throughput):
```bash
LLM_API_KEY=...
LLM_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai
LLM_MODEL=gemini-2.0-flash
LLM_STREAM=true
LLM_TIMEOUT_MS=60000
LLM_MAX_TOKENS=3000
```

**OpenAI** (balanced):
```bash
LLM_API_KEY=sk-...
LLM_BASE_URL=https://api.openai.com/v1
LLM_MODEL=gpt-4o-mini
LLM_STREAM=true
LLM_TIMEOUT_MS=60000
LLM_MAX_TOKENS=3000
```

**DeepSeek** (cheapest):
```bash
LLM_API_KEY=sk-...
LLM_BASE_URL=https://api.deepseek.com
LLM_MODEL=deepseek-chat
LLM_STREAM=true
LLM_TIMEOUT_MS=120000
LLM_MAX_TOKENS=3000
```

### Analyzer Limits
```bash
ANALYSIS_TIMEOUT_MS=20000
RATE_LIMIT_MAX_REQUESTS=10
RATE_LIMIT_WINDOW_MS=60000
```

### Browserless.io

When configured, high-fidelity extraction uses Browserless.io. Configure the same variables locally in `.env.local` and in Cloudflare Pages environment variables:

- `BROWSERLESS_API_TOKEN`
- `BROWSERLESS_REGION=sfo`
- `BROWSERLESS_BROWSER=chrome`
- `BROWSERLESS_TIMEOUT_MS=50000`
- `BROWSERLESS_USE_RESIDENTIAL_PROXY=false`
- `BROWSERLESS_MAX_CONCURRENCY=2`

Free-plan limits to respect: 1k units/month, 2 concurrent browsers, 1 minute max session time. Residential proxies are disabled by default.

If `LLM_API_KEY`, `LLM_BASE_URL`, or `LLM_MODEL` is missing, the app falls back to the mock Markdown generator for development.

## Expected Logs

```text
[analyzer] rendering live page https://example.com
[api/analyze] analysis completed in 8234ms
[llm] calling gpt-4o-mini via https://api.openai.com/v1 (stream)
[llm] compacted request payload 28456 chars, timeout 60000ms
[llm] response headers received in 856ms
[llm] response body parsed in 2341ms
[llm] markdown received (12458 chars) in 3891ms
[api/analyze] markdown completed in 12125ms (12458 chars)
```

If you see `[llm] using mock provider`, fill `.env.local` and restart.

## Quality Checks

```bash
npm test          # 23 tests across 11 test files
npm run typecheck # TypeScript strict mode
npm run build     # Production build
```

## Troubleshooting

| Issue | Solution |
|---|---|
| **Output looks generic** | Check logs for mock provider. Fill `.env.local`. |
| **LLM times out** | Increase `LLM_TIMEOUT_MS`, use streaming (`LLM_STREAM=true`), or switch to Groq. |
| **Web preview is blank** | Most sites block iframes. The app shows a fallback with "Open in new tab" link. |
| **Playwright browser missing** | Run `npx playwright install chromium` |
| **Target blocks analysis** | Some sites block headless browsers. Try a different URL. |

## Architecture

```
src/
  app/                     Next.js App Router
    page.tsx               Main UI (hero, form, logs, preview, result)
    layout.tsx             Root layout with Plus Jakarta Sans font
    globals.css            Full design system CSS
    api/analyze/route.ts   POST handler (rate-limit -> validate -> analyze -> LLM)
  lib/
    analyzer/
      playwright-extractor.ts  40+ CSS property extraction, structured shadows/gradients
      analyze-url.ts            Orchestrator: validate -> extract -> Zod parse
    llm/
      openai-compatible-provider.ts  Streaming SSE + JSON LLM client
      prompt-brain.ts                Compact system prompt with few-shot CSS examples
      generate-with-llm.ts           Prompt builder + provider delegator
      mock-provider.ts               Template-based fallback generator
      types.ts                       DesignMarkdownProvider interface
    generator/
      design-md.ts            17-section DESIGN.md with CSS code blocks
    analysis/
      types.ts                Zod schemas: AnalysisResult, GradientToken, ShadowLayer, etc.
    security/
      url-validation.ts       Rejects localhost, private IPs, non-HTTP
      rate-limit.ts           In-memory sliding window limiter
```

## MVP Scope

- Single-page scan only
- No login, no dashboard, no permanent storage
- No multi-page crawling or screenshot comparison

## License

Open source. See [GitHub](https://github.com/kaine-na/scrape-design).
