import type { AnalysisResult, ComponentSpec, DesignToken, GradientToken } from "@/lib/analysis/types";

const TOKEN_LIMIT = 12;
const COMPONENT_LIMIT = 8;
const TEXT_LIMIT = 160;

function truncate(value: string | undefined, limit = TEXT_LIMIT): string | undefined {
  if (!value) return undefined;
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > limit ? `${normalized.slice(0, limit - 1)}...` : normalized;
}

function compactTokens(tokens: DesignToken[], limit = TOKEN_LIMIT) {
  return tokens.slice(0, limit).map((token) => ({
    name: token.name,
    value: truncate(token.value, 200),
    role: token.role,
    source: token.source,
    confidence: token.confidence
  }));
}

function compactGradients(gradients: GradientToken[], limit = TOKEN_LIMIT) {
  return gradients.slice(0, limit).map((g) => ({
    name: g.name,
    value: truncate(g.value, 300),
    kind: g.kind,
    angle: g.angle,
    stops: g.stops.slice(0, 8),
    source: g.source,
    confidence: g.confidence
  }));
}

function styleSignature(component: ComponentSpec): string {
  return [
    component.type,
    component.styles.color,
    component.styles.backgroundColor,
    component.styles.backgroundImage,
    component.styles.borderRadius,
    component.styles.padding,
    component.styles.boxShadow,
    component.styles.filter,
    component.styles.backdropFilter,
    component.styles.transform
  ].join("|");
}

function compactComponents(components: ComponentSpec[]) {
  const seen = new Set<string>();
  return components
    .filter((component) => {
      const signature = styleSignature(component);
      if (seen.has(signature)) return false;
      seen.add(signature);
      return true;
    })
    .slice(0, COMPONENT_LIMIT)
    .map((component) => ({
      type: component.type,
      name: component.name,
      selector: component.selector,
      description: truncate(component.description),
      styles: Object.fromEntries(
        Object.entries(component.styles)
          .filter(
            ([, value]) =>
              value &&
              value !== "none" &&
              value !== "0px" &&
              value !== "rgba(0, 0, 0, 0)" &&
              value !== "auto" &&
              value !== "normal" &&
              value !== "0s" &&
              value !== "0ms"
          )
          .slice(0, 16)
          .map(([key, value]) => [key, truncate(value, 220)])
      ),
      states: component.states.slice(0, 6),
      confidence: component.confidence
    }));
}

export function compactAnalysisForPrompt(analysis: AnalysisResult) {
  return {
    source: analysis.source,
    confidence: analysis.confidence,
    page: {
      title: analysis.page.title,
      sections: analysis.page.sections.slice(0, 20).map((section) => ({
        role: section.role,
        heading: truncate(section.heading, 80),
        order: section.order
      }))
    },
    tokens: {
      colors: compactTokens(analysis.tokens.colors),
      typography: compactTokens(analysis.tokens.typography),
      spacing: compactTokens(analysis.tokens.spacing),
      radius: compactTokens(analysis.tokens.radius),
      shadows: compactTokens(analysis.tokens.shadows),
      gradients: compactGradients(analysis.tokens.gradients),
      effects: compactTokens(analysis.tokens.effects),
      motion: compactTokens(analysis.tokens.motion),
      breakpoints: compactTokens(analysis.tokens.breakpoints)
    },
    components: compactComponents(analysis.components),
    evidence: analysis.evidence.slice(0, TOKEN_LIMIT + 6).map((item) => truncate(item, TEXT_LIMIT)),
    assumptions: analysis.assumptions.slice(0, TOKEN_LIMIT).map((item) => truncate(item, TEXT_LIMIT)),
    gaps: analysis.gaps.slice(0, TOKEN_LIMIT).map((item) => truncate(item, TEXT_LIMIT))
  };
}

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

// ─── TASK PROMPT ─────────────────────────────────────────────────────

export function buildDesignMarkdownTaskPrompt(sourceUrl: string): string {
  return [
    `Generate one complete DESIGN.md visual design audit from the website analysis JSON for ${sourceUrl}.`,
    "",
    "RULES:",
    "1. Valid Markdown with YAML front matter (--- ... ---).",
    "2. Every section includes ```css blocks with exact CSS values.",
    "3. NEVER invent values - use EXACT data from analysis.",
    "4. Merge duplicate components. Explain each shadow layer.",
    "5. Do NOT summarize page content/copy; document visual design only.",
    "",
    "REQUIRED SECTIONS (17):",
    "1. Source Summary 2. Visual Theme & Brand Atmosphere 3. Design Tokens",
    "4. Typography System 5. Color System & Semantic Roles 6. Layout, Grid & Spacing",
    "7. Component Specifications 8. Interaction & Feedback States 9. Motion & Animation",
    "10. Responsive Behavior 11. Accessibility 12. Design Composition & Visual Hierarchy",
    "13. Implementation Guidance 14. AI Agent Design Implementation Prompt 15. Do's and Don'ts",
    "16. Validation Checklist 17. Evidence, Assumptions & Gaps"
  ].join("\n");
}

// ─── PARALLEL SECTION GROUPS ─────────────────────────────────────────

export interface SectionGroup {
  id: string;
  name: string;
  sections: string[];
  instructions: string;
}

export const SECTION_GROUPS: SectionGroup[] = [
  {
    id: "foundations",
    name: "Foundations",
    sections: ["Source Summary", "Visual Theme & Brand Atmosphere", "Design Tokens"],
    instructions: "Write YAML front matter with source metadata. Describe the overall visual theme, mood, and brand atmosphere. Output ALL design tokens with ```css custom properties (colors, typography, spacing, radius, shadows, gradients, effects, motion, breakpoints)."
  },
  {
    id: "typography-color",
    name: "Typography & Color",
    sections: ["Typography System", "Color System & Semantic Roles"],
    instructions: "Define the complete type scale with font stacks, sizes, weights, letter-spacing, line-heights. Map colors to semantic roles (primary, secondary, accent, surface, text, border, error, success, warning). Include ```css blocks."
  },
  {
    id: "layout-components",
    name: "Layout & Components",
    sections: ["Layout, Grid & Spacing", "Component Specifications", "Interaction & Feedback States"],
    instructions: "Document grid system, max-widths, padding, gaps, z-index stacking. Detail each component family (buttons, cards, forms, nav, modals) with full CSS. Include hover, focus, active, disabled states with ```css blocks."
  },
  {
    id: "motion-responsive-a11y",
    name: "Motion, Responsive & A11y",
    sections: ["Motion & Animation Guidelines", "Responsive Behavior", "Accessibility Requirements"],
    instructions: "Document all @keyframes, transitions, easing curves, durations. Define breakpoints and responsive patterns. List ARIA requirements, focus management, color contrast, keyboard navigation."
  },
  {
    id: "implementation",
    name: "Implementation Guide",
    sections: ["Design Composition & Visual Hierarchy", "Implementation Guidance", "AI Agent Design Implementation Prompt", "Do's and Don'ts", "Validation Checklist", "Evidence, Assumptions & Gaps"],
    instructions: "Describe visual composition only: hierarchy, rhythm, density, whitespace, alignment, layering, and focal points. Do NOT summarize page copy or product content. Write actionable frontend implementation guidance for recreating the style. List design do's and don'ts. Create a visual QA checklist. Document evidence sources, assumptions, and gaps."
  }
];

export function buildSectionPrompt(
  group: SectionGroup,
  baseContext: string
): string {
  return [
    baseContext,
    "",
    `Generate ONLY these sections: ${group.sections.join(", ")}`,
    "",
    `TASK: ${group.instructions}`,
    "",
    "Output valid Markdown with ```css blocks. Use EXACT values from the analysis JSON above. Do not summarize page content or copy."
  ].join("\n");
}
