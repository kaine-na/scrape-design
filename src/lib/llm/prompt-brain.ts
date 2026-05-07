import type { AnalysisResult } from "@/lib/analysis/types";

// ─── SYSTEM PROMPT: The "Brain" ─────────────────────────────────────

export function buildDesignSystemBrain(): string {
  return [
    "You are a senior frontend designer, web design auditor, and design-system reviewer.",
    "Convert visual/style analysis JSON into DESIGN.md for AI coding agents. Focus ONLY on web design: tokens, layout, components, motion, effects, responsive behavior, and UX/a11y review.",
    "Do NOT summarize page content, marketing copy, product features, or article text. Use page text only as visual evidence when needed.",
    "Every design claim references analysis evidence (Detected/Observed/Inferred). NEVER invent values.",
    "Output usable ```css blocks for ALL tokens, shadows, gradients, effects, and components. Output ONLY the DESIGN.md."
  ].join("\n");
}

// ─── COMPACT PROMPT FOR STREAMING GENERATION ─────────────────────────

const MAX_PRIMARY_COLORS = 8;
const MAX_TYPOGRAPHY_TOKENS = 5;
const MAX_SPACING_VALUES = 10;
const MAX_RADIUS_VALUES = 5;
const MAX_COMPONENTS = 6;

const NEUTRAL_COLOR_PALETTE = ["#000000", "#FFFFFF", "#F5F5F5", "#E5E5E5", "#999999"];
const DEFAULT_FONT_FAMILY = "system-ui, sans-serif";
const TRANSPARENT_RGBA = "rgba(0, 0, 0, 0)";
const ZERO_PX = "0px";

/**
 * Builds a compact prompt (~2-3K chars) optimized for streaming.
 * Uses structured format inspired by designmd.me: hex values, direct CSS values.
 */
export function buildCompactGenerationPrompt(analysis: AnalysisResult): string {
  const url = analysis.source.url;
  const title = analysis.page.title ?? "Unknown";

  const primaryColors = analysis.tokens.colors
    .slice(0, MAX_PRIMARY_COLORS)
    .map((c) => c.value)
    .filter((v) => v && !v.startsWith(TRANSPARENT_RGBA));

  const typoTokens = analysis.tokens.typography;
  const fontFamily =
    typoTokens.find((t) => t.role?.includes("font-family") || t.name?.includes("font-family"))?.value ??
    DEFAULT_FONT_FAMILY;

  const spacingValues = [
    ...new Set(
      analysis.tokens.spacing
        .map((t) => t.value)
        .filter((v) => v && v !== ZERO_PX)
        .slice(0, MAX_SPACING_VALUES)
    )
  ];

  const radiusValues = [
    ...new Set(
      analysis.tokens.radius
        .map((t) => t.value)
        .filter((v) => v && v !== ZERO_PX)
        .slice(0, MAX_RADIUS_VALUES)
    )
  ];

  const seenTypes = new Set<string>();
  const keyComponents = analysis.components
    .filter((c) => {
      if (seenTypes.has(c.type)) return false;
      seenTypes.add(c.type);
      return true;
    })
    .slice(0, MAX_COMPONENTS)
    .map((c) => {
      const s = c.styles;
      return {
        type: c.type,
        bg: s.backgroundColor ?? "transparent",
        color: s.color ?? "inherit",
        radius: s.borderRadius ?? "0",
        padding: s.padding ?? "0",
        fontSize: s.fontSize ?? "inherit"
      };
    });

  const compact = {
    url,
    title,
    colors: { primary: primaryColors, neutral: NEUTRAL_COLOR_PALETTE },
    font: fontFamily,
    typography: typoTokens.slice(0, MAX_TYPOGRAPHY_TOKENS).map((t) => ({
      name: t.name,
      value: t.value,
      role: t.role
    })),
    spacing: spacingValues,
    radius: radiusValues,
    components: keyComponents
  };

  return [
    `Generate a complete DESIGN.md for ${url} (${title}).`,
    "",
    "RULES:",
    "1. Valid Markdown with YAML front matter (--- ... ---).",
    "2. Every section includes ```css blocks with exact CSS values.",
    "3. NEVER invent values - use EXACT data below.",
    "4. Do NOT summarize page content/copy; document visual design only.",
    "",
    "REQUIRED SECTIONS (17):",
    "1. Source Summary 2. Visual Theme & Brand Atmosphere 3. Design Tokens",
    "4. Typography System 5. Color System & Semantic Roles 6. Layout, Grid & Spacing",
    "7. Component Specifications 8. Interaction & Feedback States 9. Motion & Animation",
    "10. Responsive Behavior 11. Accessibility 12. Design Composition & Visual Hierarchy",
    "13. Implementation Guidance 14. AI Agent Design Implementation Prompt 15. Do's and Don'ts",
    "16. Validation Checklist 17. Evidence, Assumptions & Gaps",
    "",
    "EXTRACTED DESIGN DATA:",
    JSON.stringify(compact, null, 2)
  ].join("\n");
}
