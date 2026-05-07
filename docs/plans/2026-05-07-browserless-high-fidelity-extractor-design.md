# Browserless High-Fidelity Extractor Design

## Context

The current Cloudflare-compatible extraction flow fetches raw HTML through `/api/proxy`, renders it in a client-side blob iframe, extracts DOM/computed styles in the browser, then sends the result to `/api/analyze` for LLM generation. This deploys well on Cloudflare Pages, but it produces low-quality `DESIGN.md` outputs for modern JavaScript-heavy sites because the iframe reconstruction often misses hydrated DOM, resolved assets, real viewport state, and visual layout fidelity.

The user approved replacing the default high-fidelity path with Browserless.io while keeping local and Cloudflare environments supported.

## Goals

- Produce higher-fidelity `DESIGN.md` outputs using a real remote browser.
- Keep Cloudflare Pages as the frontend and lightweight API host.
- Support both local development via `.env.local` and Cloudflare production via Pages environment variables.
- Respect Browserless free plan constraints.
- Preserve the existing client extractor as a fallback or fast mode.

## Browserless Free Plan Constraints

- BrowserQL language and editor available.
- 1,000 units/month.
- 2 max concurrent browsers.
- 1 minute max session time and session reconnects.
- 1 day persisted sessions and logs storage.
- Residential proxies cost 6 units/MB.
- Automatic captcha solving available.
- Chrome Extensions available.
- Endpoints: San Francisco, London, Amsterdam.
- Browsers: Chrome, WebKit, Firefox.

Design implications:

- Use short extraction sessions with a hard timeout under 60 seconds, preferably 50 seconds.
- Limit concurrency to at most 2 active extractions.
- Do not enable residential proxies by default.
- Avoid large screenshots unless explicitly needed.
- Keep extraction scoped to one URL, one viewport, limited scrolling, and compact data output.

## Approved Architecture

Recommended flow:

```text
User enters URL
  ↓
Frontend calls /api/extract
  ↓
/api/extract validates URL
  ↓
/api/extract calls Browserless with a short real-browser session
  ↓
Browserless opens the target website in Chrome
  ↓
Browserless executes an extraction script in the page
  ↓
/api/extract returns AnalysisResult JSON
  ↓
Frontend calls /api/analyze with { url, analysis }
  ↓
/api/analyze calls the configured LLM
  ↓
Frontend renders DESIGN.md
```

The existing `/api/analyze` route remains responsible only for markdown generation. A new `/api/extract` route becomes the high-fidelity extraction endpoint.

## Why Browserless API/BrowserQL Instead of Playwright in Cloudflare

Cloudflare Edge Runtime is not a good place for full Playwright/CDP client dependencies. Browserless already owns the browser runtime, so the Cloudflare route should act as a small, edge-compatible gateway that calls Browserless using standard `fetch` APIs. This keeps the production deployment compatible with Cloudflare Pages while still using a real browser for page rendering.

Local development uses the same env variables and API route behavior, so the code path stays consistent between local and production.

## Environment Variables

Local `.env.local` and Cloudflare Pages environment variables should both support:

```env
BROWSERLESS_API_TOKEN=...
BROWSERLESS_REGION=sfo
BROWSERLESS_BROWSER=chrome
BROWSERLESS_TIMEOUT_MS=50000
BROWSERLESS_USE_RESIDENTIAL_PROXY=false
BROWSERLESS_MAX_CONCURRENCY=2
```

Recommended defaults:

- `BROWSERLESS_REGION=sfo`
- `BROWSERLESS_BROWSER=chrome`
- `BROWSERLESS_TIMEOUT_MS=50000`
- `BROWSERLESS_USE_RESIDENTIAL_PROXY=false`
- `BROWSERLESS_MAX_CONCURRENCY=2`

## API Design

### `POST /api/extract`

Request:

```json
{
  "url": "https://example.com",
  "mode": "high-fidelity"
}
```

Response success:

```json
{
  "analysis": {},
  "meta": {
    "provider": "browserless",
    "browser": "chrome",
    "region": "sfo",
    "durationMs": 12345,
    "timedOut": false
  }
}
```

Response failure:

```json
{
  "error": "Browserless extraction timed out before the page became ready.",
  "code": "BROWSERLESS_TIMEOUT"
}
```

Error codes should include:

- `INVALID_URL`
- `BROWSERLESS_NOT_CONFIGURED`
- `BROWSERLESS_TIMEOUT`
- `BROWSERLESS_QUOTA_OR_CONCURRENCY`
- `BROWSERLESS_REQUEST_FAILED`
- `EXTRACTION_EMPTY`

## Extraction Strategy

The browser script should collect compact high-signal data:

- page metadata: title, description, canonical URL, viewport size
- theme colors and background colors
- typography samples with computed font family, weight, size, line-height, letter-spacing
- color tokens from visible elements
- gradients and shadows
- border radius and spacing patterns
- key layout sections: header, hero, cards, forms, nav, footer
- button/input/link visual states where available
- visible image dimensions and source hints
- animation/effect hints: transform, opacity, filters, transitions
- limited scroll sampling for below-the-fold sections

Avoid returning full HTML or huge screenshots by default. Screenshot support can be added later as an optional diagnostic mode.

## Frontend Behavior

The UI should default to high-fidelity extraction when Browserless is configured. It can keep the current client-side extractor as a fast fallback:

- High Fidelity: `/api/extract` via Browserless.
- Fast/Fallback: existing `extractFromUrl()` client extractor.

The log panel should show clear progress:

1. Validating URL.
2. Starting Browserless session.
3. Rendering target page.
4. Extracting visual system.
5. Generating DESIGN.md.
6. Done.

If Browserless fails, the UI should offer a fallback action instead of silently generating poor output.

## Testing and Verification

Minimum verification:

- Unit tests for Browserless env parsing and endpoint URL construction.
- Unit tests for `/api/extract` request validation and error mapping.
- Mocked Browserless response test that returns a valid `AnalysisResult`.
- Existing `/api/analyze` tests remain passing.
- Manual test on at least one static site and one JavaScript-heavy site.

## Deployment Notes

Cloudflare Pages settings remain:

- Framework preset: Next.js
- Build command: `npx @cloudflare/next-on-pages`
- Build output directory: `.vercel/output/static`
- Compatibility flag: `nodejs_compat` for production and preview

Browserless token is configured in Cloudflare Pages environment variables, not committed to the repo.

## Future Improvements

- Add BrowserQL-specific implementation if it produces better cost/fidelity than the REST scripting flow.
- Add optional screenshot-based visual analysis.
- Add usage estimation and monthly quota warnings.
- Add per-user/job queueing if concurrency limits become a problem.
- Migrate from deprecated `@cloudflare/next-on-pages` to OpenNext Cloudflare adapter later.
