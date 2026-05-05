# Real LLM And Live Extractor Fix Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the mock DESIGN.md generation path with an OpenAI-compatible provider and fix extraction so computed styles come from the live rendered page.

**Architecture:** Keep the existing analyzer/generator interfaces. Add a provider selector that uses OpenAI-compatible chat completions when env vars are present, otherwise falls back to the mock provider with explicit logging. Refactor Playwright extraction to evaluate the live `Page` after navigation instead of copying HTML into a new browser context.

**Tech Stack:** Next.js, TypeScript, Playwright, Vitest, OpenAI-compatible `/chat/completions` HTTP API.

---

## Task 1: Add OpenAI-Compatible Provider

**Files:**
- Create: `src/lib/llm/openai-compatible-provider.ts`
- Create: `src/lib/llm/openai-compatible-provider.test.ts`
- Modify: `src/lib/llm/types.ts`
- Modify: `src/app/api/analyze/route.ts`

Steps:
1. Write tests for request URL, auth header, model, response parsing, missing env fallback selector.
2. Implement provider using `fetch` against `${baseUrl}/chat/completions`.
3. Add provider selector from env.
4. Integrate selector in API route.
5. Run tests/typecheck and commit.

## Task 2: Refactor Live Playwright Extraction

**Files:**
- Modify: `src/lib/analyzer/playwright-extractor.ts`
- Modify: `src/lib/analyzer/playwright-extractor.test.ts`

Steps:
1. Keep `extractFromHtml` for fixture tests.
2. Add shared `extractFromPage(page)` that evaluates the current page directly.
3. Make `playwrightExtractor.extract(url)` call `goto`, wait briefly, scroll, then `extractFromPage(page)`.
4. Filter browser-default values and dedupe repeated components.
5. Run tests/typecheck and commit.

## Task 3: Final Verification

Steps:
1. Run `npm test`.
2. Run `npm run typecheck`.
3. Run `npm run build`.
4. Commit fixes if needed.
