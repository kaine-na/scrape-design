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
