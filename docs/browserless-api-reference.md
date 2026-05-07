# Browserless.io API Reference for scrape-design

Source: https://docs.browserless.io/rest-apis/intro
Scraped: 2026-05-07

## Recommended API for scrape-design: `/function`

The `/function` API runs custom Puppeteer code server-side. This is the best fit for
our high-fidelity design extraction because we can run arbitrary DOM inspection code
and return structured JSON.

### Endpoint

- Method: `POST`
- Path: `/function`
- Auth: `token` query parameter
- Content-Type: `application/javascript` or `application/json`
- Response: based on function return `type`

### Request as JSON

```json
{
  "code": "export default async ({ page, context }) => { ... };",
  "context": { "url": "https://example.com" }
}
```

### Request as JavaScript

Content-Type: `application/javascript`
Body: raw JS code string

### Example: Scraping page data

```js
export default async ({ page, context }) => {
  await page.goto(context.url, { waitUntil: "networkidle2" });
  const data = await page.evaluate(() => {
    const visible = (el) => {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return rect.width > 0 && rect.height > 0
        && style.visibility !== "hidden"
        && style.display !== "none";
    };
    const pick = (sel) => Array.from(document.querySelectorAll(sel))
      .filter(visible).slice(0, 12);
    const sample = (el) => {
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return {
        tag: el.tagName.toLowerCase(),
        text: (el.textContent || "").trim().slice(0, 160),
        rect: { w: Math.round(r.width), h: Math.round(r.height) },
        styles: {
          color: s.color,
          backgroundColor: s.backgroundColor,
          backgroundImage: s.backgroundImage,
          fontFamily: s.fontFamily,
          fontSize: s.fontSize,
          fontWeight: s.fontWeight,
          lineHeight: s.lineHeight,
          letterSpacing: s.letterSpacing,
          borderRadius: s.borderRadius,
          boxShadow: s.boxShadow,
          padding: s.padding,
          margin: s.margin,
          display: s.display,
          gap: s.gap,
          transform: s.transform,
          filter: s.filter,
          transition: s.transition,
          animation: s.animation,
        },
      };
    };
    const headings = pick("h1,h2,h3").map(sample);
    const buttons = pick("button,a,[role=button],input,textarea,select").map(sample);
    const sections = pick("header,main,section,article,footer,nav").map(sample);
    const cards = pick("[class*=card],[class*=feature],[class*=pricing],li").map(sample);
    const images = pick("img,picture,svg").map(sample);
    return {
      title: document.title,
      description: document.querySelector('meta[name="description"]')
        ?.getAttribute("content") || "",
      url: location.href,
      viewport: { width: innerWidth, height: innerHeight },
      samples: { headings, buttons, sections, cards, images },
    };
  });
  return { data, type: "application/json" };
};
```

### Response format

```json
{
  "data": { ... extraction result ... },
  "type": "application/json"
}
```

### Region endpoints

- San Francisco: `https://production-sfo.browserless.io/function?token=...`
- London: `https://production-lon.browserless.io/function?token=...`
- Amsterdam: `https://production-ams.browserless.io/function?token=...`

Browser path variants:
- `/chromium/function` - headless Chromium
- `/chrome/function` - real Chrome
- `/stealth/function` - stealth mode with fingerprint randomization

## Alternative: `/scrape` API

Extracts structured data using CSS selectors. Simpler but less flexible.

```json
POST /scrape?token=...
{
  "url": "https://example.com",
  "elements": [
    { "selector": "h1" },
    { "selector": "h2" },
    { "selector": "a" }
  ]
}
```

Response:

```json
{
  "data": [
    {
      "selector": "h1",
      "results": [
        {
          "html": "...",
          "text": "...",
          "attributes": [{ "name": "class", "value": "..." }],
          "width": 736,
          "height": 120,
          "top": 196,
          "left": 32
        }
      ]
    }
  ]
}
```

Supports:
- `waitForSelector` - wait for element before scraping
- `waitForTimeout` - wait N ms before scraping
- `gotoOptions` - navigation options
- `rejectResourceTypes` - block images/fonts/etc
- `bestAttempt` - continue on error

## Free Plan Limits

- 1,000 units/month
- 2 max concurrent browsers
- 1 minute max session time
- 1 day persisted sessions and logs
- Residential proxies: 6 units/MB
- Endpoints: San Francisco, London, Amsterdam
- Browsers: Chrome, WebKit, Firefox

## BrowserQL (NOT recommended for our use case)

BrowserQL uses GraphQL mutations at `/chrome/bql` or `/chromium/bql`.
The `evaluate` mutation requires plain JS expression strings, not async functions.
The `wait` mutation does NOT exist -- use `waitForTimeout` instead.
BrowserQL is more complex and error-prone than the `/function` API for our needs.

## Decision: Switch from BrowserQL to /function API

The /function API is simpler, more reliable, and allows us to run full Puppeteer
code including page.evaluate() with complex DOM inspection. This replaces the
BrowserQL approach that had formatting and mutation compatibility issues.
