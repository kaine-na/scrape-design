# Scrape Design

Scrape Design is a public web app that turns one public website URL into an AI-ready `DESIGN.md`.

The app renders the target page with Playwright, extracts live DOM and computed-style signals, then sends compact analysis data to an OpenAI-compatible LLM provider to generate a comprehensive design-system document.

## Features

- Single-page website analysis.
- No login or permanent result storage.
- Live rendered DOM extraction with Playwright.
- Computed style extraction for colors, typography, spacing, radius, shadows, motion, and components.
- OpenAI-compatible LLM provider support.
- Streaming LLM responses via SSE.
- Copy and download generated `DESIGN.md`.
- URL validation and basic rate limiting for public use.

## Requirements

- Node.js 20.19+ or 22.12+.
- npm.
- A public website URL to analyze.
- An OpenAI-compatible chat completions endpoint for high-quality generation.

## Setup

Install dependencies:

```bash
npm install
```

Install the Playwright browser:

```bash
npx playwright install chromium
```

Create local environment config:

```bash
copy .env.example .env.local
```

On macOS/Linux, use:

```bash
cp .env.example .env.local
```

Edit `.env.local` with your provider settings.

## Environment Variables

Minimum required variables for real LLM generation:

```bash
LLM_API_KEY=your-api-key
LLM_BASE_URL=https://api.openai.com/v1
LLM_MODEL=gpt-4.1-mini
LLM_STREAM=true
LLM_TIMEOUT_MS=180000
```

OpenAI example:

```bash
LLM_API_KEY=sk-...
LLM_BASE_URL=https://api.openai.com/v1
LLM_MODEL=gpt-4.1-mini
LLM_TEMPERATURE=0.2
LLM_MAX_TOKENS=4000
LLM_TIMEOUT_MS=180000
LLM_STREAM=true
```

OpenRouter example:

```bash
LLM_API_KEY=sk-or-...
LLM_BASE_URL=https://openrouter.ai/api/v1
LLM_MODEL=openai/gpt-4.1-mini
LLM_TEMPERATURE=0.2
LLM_MAX_TOKENS=4000
LLM_TIMEOUT_MS=180000
LLM_STREAM=true
```

Local OpenAI-compatible server example:

```bash
LLM_API_KEY=local-key-or-placeholder
LLM_BASE_URL=http://localhost:20128/v1
LLM_MODEL=cx/gpt-5.5-low
LLM_TEMPERATURE=0.2
LLM_MAX_TOKENS=4000
LLM_TIMEOUT_MS=180000
LLM_STREAM=true
```

Other variables:

```bash
ANALYSIS_TIMEOUT_MS=30000
RATE_LIMIT_MAX_REQUESTS=10
RATE_LIMIT_WINDOW_MS=60000
```

If `LLM_API_KEY`, `LLM_BASE_URL`, or `LLM_MODEL` is missing, the app falls back to the mock local Markdown generator. The mock is useful for development, but the result will be more generic than real LLM output.

## Run Locally

Start the development server:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

Paste a public URL, for example:

```text
https://pawbytes.io/id
```

Click `Generate DESIGN.md`.

When generation succeeds, the page shows a Markdown preview plus `Copy` and `Download` actions.

## Expected Logs

With real LLM settings, terminal logs should include:

```text
[analyzer] rendering live page https://example.com
[api/analyze] analysis completed in ...ms
[llm] calling <model> via <baseUrl> (stream)
[llm] compacted request payload ... chars, timeout ...ms
[llm] response headers received in ...ms
[llm] response body parsed in ...ms
[llm] markdown received (... chars) in ...ms
[api/analyze] markdown completed in ...ms
```

If the app logs this, the real LLM provider is being used:

```text
[llm] calling ...
```

If the app logs this, the mock provider is being used instead:

```text
[llm] using mock provider because LLM_API_KEY, LLM_BASE_URL, or LLM_MODEL is missing
```

## Troubleshooting

### Output looks generic

Check terminal logs. If the mock provider is active, fill `.env.local` and restart `npm run dev`.

### LLM request times out

Increase timeout in `.env.local`:

```bash
LLM_TIMEOUT_MS=180000
```

Keep streaming enabled:

```bash
LLM_STREAM=true
```

If your provider does not support streaming, set:

```bash
LLM_STREAM=false
```

### Local LLM server says complete but app waits

Use streaming mode. The app supports OpenAI-compatible SSE responses and parses `choices[0].delta.content` chunks.

### Playwright browser missing

Run:

```bash
npx playwright install chromium
```

### Target website blocks analysis

Some websites block headless browsers, automation, or non-human traffic. Try another public URL or adjust deployment/browser settings later.

## Quality Checks

Run tests:

```bash
npm test
```

Run typecheck:

```bash
npm run typecheck
```

Run production build:

```bash
npm run build
```

## Current MVP Scope

- Single-page scan only.
- No login.
- No project dashboard.
- No permanent result storage.
- No multi-page crawling yet.
- No screenshot comparison yet.

## Safety

The analyzer rejects localhost, private IP ranges, unsupported URL schemes, and obvious metadata endpoints. Keep these protections before deploying publicly.

The public API also includes basic in-memory rate limiting. For production, replace it with a durable shared rate limiter such as Redis or a platform-native limiter.
