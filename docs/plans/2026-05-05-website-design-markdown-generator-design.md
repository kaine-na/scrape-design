# Website Design Markdown Generator - Design

## Status

Approved design for a public, free, no-login web app that turns a single website URL into a comprehensive AI-ready `DESIGN.md`.

## Product Goal

Build a public web-only tool where a user enters one website URL, the system analyzes the rendered page visually and structurally, then generates a complete `DESIGN.md` that an AI coding agent can use to recreate or implement the site's design language.

The MVP focuses on a single-page scan. It should be fast, easy to use, and transparent about what was detected versus inferred.

## Chosen Approach

Use a Visual + DOM Analyzer for a single URL.

This approach balances quality and complexity. It captures rendered-page evidence such as screenshots, DOM structure, computed styles, layout metrics, component patterns, fonts, colors, spacing, shadows, transitions, and responsive hints. It is more accurate than a basic HTML scraper while remaining simpler and cheaper than an agentic multi-page crawler.

## Technology Stack

Recommended MVP stack:

- Next.js for the public web app and backend API routes.
- Playwright for headless browser rendering and DOM/style extraction.
- LLM API for converting structured analysis JSON into AI-ready Markdown.
- Server-side validation and rate limiting for public abuse prevention.
- Optional short-lived cache for repeated URL analysis.

This stack is chosen because Next.js provides a simple full-stack web deployment model, while Playwright gives reliable access to rendered DOM, screenshots, computed styles, hover checks, media queries, and animation data.

## Product Flow & UX

The homepage presents one large URL input and one primary action, such as `Generate DESIGN.md`. Users do not need an account. After submission, the UI shows step-based progress rather than a generic spinner:

1. Fetching page
2. Rendering website
3. Extracting visual system
4. Analyzing components
5. Writing DESIGN.md

When complete, the result screen displays a Markdown preview with actions to copy, download `DESIGN.md`, or run another scan.

No dashboard, login, project history, or saved workspace is included in the MVP. Results are not stored permanently by default.

## Architecture & Data Flow

1. User submits a public URL from the frontend.
2. Backend validates the URL.
3. Backend creates a single-page analysis job.
4. Playwright opens the URL in a browser environment.
5. Analyzer collects rendered-page and style data.
6. Analyzer writes a structured intermediate JSON payload.
7. LLM receives the JSON payload and screenshot/context summary.
8. LLM generates the final `DESIGN.md`.
9. Frontend displays the Markdown preview and export actions.

For MVP, the job can run request-response with streamed or polled progress. If traffic grows, the analysis can move to a queue and worker service without changing the user-facing product model.

## Analyzer Scope

The analyzer scans only the submitted URL. It should not crawl linked pages in the MVP.

### Rendered-Page Extraction

Collect:

- Page screenshots, including initial viewport and full-page screenshot when possible.
- Section structure: header, hero, features, cards, forms, pricing, testimonials, footer, and similar regions.
- Visible heading hierarchy and text roles.
- Repeated visual components: buttons, links, cards, forms, nav items, badges, icons.
- Computed styles: colors, backgrounds, fonts, font sizes, weights, line heights, spacing, borders, radius, shadows.
- Layout metrics: container widths, grid/flex usage, gaps, padding, alignment, section rhythm.

### Asset And Style Extraction

Collect:

- CSS variables and token-like values.
- Font imports from Google Fonts, local files, or CDNs.
- Media queries and breakpoint hints.
- CSS transitions, animations, and keyframes.
- Framework and library signals such as Next.js, Vite, Tailwind, Bootstrap, Webflow, Framer, GSAP, shadcn/ui, Radix, or similar tools.
- Open Graph and metadata for brand positioning.

### Interaction Detection

The MVP does not need to click through the entire page. It should detect interaction states from CSS and, where practical, hover a few high-priority buttons/links to observe visual changes.

Each interaction state should be labeled as one of:

- Detected from CSS
- Observed by interaction
- Inferred from pattern

The generator must not overclaim. If something is uncertain, it should say so clearly.

## Output DESIGN.md Structure

Generated files should use a hybrid format: YAML front matter for machine-readable tokens, followed by Markdown sections for human-readable design guidance.

```markdown
---
version: 1
source:
  url: "https://example.com"
  analyzedAt: "ISO_DATE"
  scanType: "single-page"
confidence:
  overall: "high | medium | low"
tokens:
  colors: {}
  typography: {}
  spacing: {}
  radius: {}
  shadows: {}
  motion: {}
  breakpoints: {}
components: {}
---

# DESIGN.md

## 1. Source Summary
## 2. Visual Theme & Brand Atmosphere
## 3. Design Tokens
## 4. Typography System
## 5. Color System & Semantic Roles
## 6. Layout, Grid & Spacing
## 7. Component Specifications
## 8. Interaction & Feedback States
## 9. Motion & Animation Guidelines
## 10. Responsive Behavior
## 11. Accessibility Requirements
## 12. Content & Page Structure
## 13. Tech Stack Signals & Implementation Guidance
## 14. AI Agent Implementation Prompt
## 15. Do's and Don'ts
## 16. Validation Checklist
## 17. Evidence, Assumptions & Gaps
```

The output must be optimized for AI coding agents. It should include implementation guidance, component rules, interaction states, motion patterns, accessibility expectations, validation criteria, and clear evidence notes.

## Error Handling, Safety & Public Constraints

Because the tool is public and free, URL validation and abuse prevention are required.

Reject:

- Non-HTTP/HTTPS schemes.
- Localhost and loopback hosts.
- Private IP ranges.
- Cloud metadata IPs.
- File URLs.
- Redirects to internal or private destinations.

Recommended MVP limits:

- Single-page scan only.
- Render timeout around 20-30 seconds.
- Maximum HTML/CSS payload size.
- Maximum generated Markdown length.
- Per-IP rate limit.
- No permanent storage by default.
- Optional short-lived cache for repeated URLs.
- No risky page actions or file downloads.

User-facing errors should be plain and actionable:

- Invalid URL: ask for a valid public website URL.
- Unreachable page: ask the user to check if the URL is public.
- Render timeout: suggest retrying or using a simpler page.
- Bot protection: explain that automated analysis is blocked.
- LLM failure: suggest retrying.
- Low confidence: warn that parts of the result are inferred.

## Testing & Validation

### Backend And Analyzer Tests

- URL validation rejects dangerous or unsupported targets.
- Redirect validation blocks redirects to private/internal hosts.
- Renderer handles static, JS-rendered, slow, blocked, and SSL-problem pages.
- Extraction captures colors, typography, buttons, headings, spacing, transitions, media queries, and component patterns from fixtures.
- Markdown generation always produces required sections and valid YAML.
- Failure paths handle timeout, DNS failure, huge pages, bot protection, and LLM errors.

### Frontend Tests

- URL form validation.
- Progress states.
- Markdown result preview.
- Copy behavior.
- Download behavior.
- Error states.
- Mobile layout.

### Generated DESIGN.md Validation Checklist

Each generated file should include:

- Valid YAML front matter.
- Source URL and scan metadata.
- Confidence labels.
- Color, typography, spacing, radius, shadow, motion, and breakpoint tokens.
- Component specs for detected buttons, links, cards, forms, navigation, and badges.
- Interaction and feedback states.
- Responsive behavior.
- Accessibility notes.
- Implementation guidance.
- AI agent prompt guide.
- Evidence, assumptions, and gaps.

The MVP does not need pixel-perfect output, but the result must be AI-useful: clear enough for an AI coding agent to recreate the page's look and feel without repeated clarification.
