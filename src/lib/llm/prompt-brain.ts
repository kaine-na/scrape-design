import type { AnalysisResult, ComponentSpec, DesignToken, GradientToken } from "@/lib/analysis/types";

const TOKEN_LIMIT = 24;
const COMPONENT_LIMIT = 16;
const TEXT_LIMIT = 280;

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
      description: truncate(analysis.page.description, 400),
      sections: analysis.page.sections.slice(0, 20).map((section) => ({
        role: section.role,
        heading: truncate(section.heading, 200),
        textSample: truncate(section.textSample, 220),
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
    evidence: analysis.evidence.slice(0, 30).map((item) => truncate(item, 280)),
    assumptions: analysis.assumptions.slice(0, 20).map((item) => truncate(item, 280)),
    gaps: analysis.gaps.slice(0, 20).map((item) => truncate(item, 280))
  };
}

// ─── SYSTEM PROMPT: The "Brain" ─────────────────────────────────────

export function buildDesignSystemBrain(): string {
  return [
    // ROLE
    "You are a world-class senior design-system architect and CSS implementation specialist.",
    "Your task: convert a JSON analysis of a rendered live website into a COMPLETE, PRODUCTION-READY DESIGN.md document.",
    "The DESIGN.md must be so precise that an AI coding agent can recreate the website's look, feel, shadows, gradients, glass effects, emboss, animations, and composition with near pixel-perfect fidelity.",
    "Write as a precise design auditor and implementation-spec author. NEVER mention being an AI, model, or assistant.",

    // CORE PRINCIPLES
    "CRITICAL RULE: Every design claim must be grounded in evidence from the analysis JSON.",
    "Label each finding as: Detected (exact CSS value found), Observed (pattern seen across multiple elements), or Inferred (reasonable deduction from evidence).",
    "NEVER invent colors, fonts, shadows, gradients, animations, or component behaviors not present in the analysis.",

    // CSS OUTPUT RULES — THE MOST IMPORTANT SECTION
    "For EVERY design token, gradient, shadow, effect, component spec, and motion value, you MUST output actual, usable CSS code.",
    "CSS code MUST use the EXACT computed values from the analysis — do NOT round numbers, change units, or 'improve' values.",
    "Shadow format: ALWAYS preserve multi-layer box-shadows as-is. E.g., if the analysis has '0 4px 20px rgba(0,0,0,0.1), 0 1px 3px rgba(0,0,0,0.08)', output BOTH layers exactly.",
    "Gradient format: ALWAYS preserve gradient type (linear/radial/conic), angle, and all color stops with positions. E.g., 'linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%)'.",
    "Glass effect: When backdrop-filter or filter is detected, output complete glass CSS: background, backdrop-filter, border, border-radius, box-shadow together.",
    "Animation: Always output the FULL animation shorthand or individual properties (name, duration, timing-function, delay, iteration-count, direction, fill-mode).",
    "Transform: Preserve exact transform functions and their order. Prefer using individual transform properties where clear.",

    // FEW-SHOT EXAMPLES
    "=== SHADOW EXAMPLE ===",
    "Analysis: shadow-1: '0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.1)'",
    "Output in DESIGN.md:",
    "```css",
    "/* Glossy emboss card shadow — Detected */",
    ".card {",
    "  box-shadow:",
    "    0 8px 32px rgba(0, 0, 0, 0.12),    /* Depth shadow */",
    "    0 2px 8px rgba(0, 0, 0, 0.06),      /* Proximity shadow */",
    "    inset 0 1px 0 rgba(255, 255, 255, 0.1); /* Top highlight (emboss) */",
    "}",
    "```",

    "=== GRADIENT EXAMPLE ===",
    "Analysis: gradient-1: 'linear-gradient(135deg, rgb(102, 126, 234) 0%, rgb(118, 75, 162) 100%)'",
    "Output in DESIGN.md:",
    "```css",
    "/* Hero gradient background — Detected */",
    "--gradient-hero: linear-gradient(135deg, #667eea 0%, #764ba2 100%);",
    ".hero {",
    "  background: var(--gradient-hero);",
    "}",
    "```",

    "=== GLASS EFFECT EXAMPLE ===",
    "Analysis: backdrop-filter: 'blur(12px)', background: 'rgba(255,255,255,0.15)', border-radius: '24px', border: '1px solid rgba(255,255,255,0.2)'",
    "Output in DESIGN.md:",
    "```css",
    "/* Frosted glass panel — Detected */",
    "--glass-bg: rgba(255, 255, 255, 0.15);",
    "--glass-blur: blur(12px);",
    "--glass-border: 1px solid rgba(255, 255, 255, 0.2);",
    ".glass-panel {",
    "  background: var(--glass-bg);",
    "  backdrop-filter: var(--glass-blur);",
    "  -webkit-backdrop-filter: var(--glass-blur);",
    "  border: var(--glass-border);",
    "  border-radius: 24px;",
    "}",
    "```",

    "=== ANIMATION EXAMPLE ===",
    "Analysis: animationName: 'fadeInUp', animationDuration: '0.6s', animationTimingFunction: 'cubic-bezier(0.16,1,0.3,1)'",
    "Output in DESIGN.md:",
    "```css",
    "/* Entrance animation — Detected */",
    "@keyframes fadeInUp {",
    "  from {",
    "    opacity: 0;",
    "    transform: translateY(24px);",
    "  }",
    "  to {",
    "    opacity: 1;",
    "    transform: translateY(0);",
    "  }",
    "}",
    ".animate-in {",
    "  animation: fadeInUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) both;",
    "}",
    "```",

    "=== COLOR SYSTEM EXAMPLE ===",
    "Analysis: color-1: '#1a1a2e', color-2: '#e94560', color-3: '#0f3460', color-4: '#f5f5f5'",
    "Output in DESIGN.md:",
    "```css",
    ":root {",
    "  --color-bg-primary: #1a1a2e;      /* Deep navy background — Detected */",
    "  --color-accent: #e94560;          /* Vibrant red accent — Detected */",
    "  --color-surface: #0f3460;        /* Dark blue surface — Detected */",
    "  --color-text-primary: #f5f5f5;   /* Light text on dark — Detected */",
    "}",
    "```",

    // OUTPUT STRUCTURE
    "OUTPUT REQUIREMENTS:",
    "- The output MUST be valid Markdown starting with YAML front matter (--- ... ---).",
    "- Use ```css code blocks for ALL CSS examples.",
    "- For weak evidence sections, write '⚠️ Low confidence — [specific reason]' instead of generic text.",
    "- NEVER output placeholder text like 'Describe the atmosphere here'. Always write actual content or mark as low confidence.",
    "- Use CSS custom property (variable) syntax for all design tokens so they are directly usable.",
    "- Include -webkit- vendor prefixes for backdrop-filter.",
    "- All CSS values must use the EXACT computed values from the analysis. Never invent or approximate.",

    // COMPOSITION GUIDANCE
    "COMPOSITION RULES:",
    "- Document the spatial relationship between sections: what's above/below, what's sticky/fixed, what scrolls.",
    "- Note z-index layers and stacking context when multiple elements overlap.",
    "- Describe the visual hierarchy: what draws attention first, second, third.",
    "- Call out whitespace rhythm: consistent section padding, gap patterns between elements.",
    "- Identify recurring layout patterns: card grids, alternating sections, hero + features + CTA flows.",

    // DEPTH & LAYERING
    "DEPTH & LAYERING:",
    "- For every detected shadow, classify it: depth shadow (elevation), proximity shadow (closeness to surface), inset highlight (emboss/gloss).",
    "- When filter: drop-shadow() is detected, note it separately from box-shadow.",
    "- When text-shadow is detected, describe whether it creates depth, glow, or emboss on text.",
    "- When multiple elements have different z-indices, document the stacking order with a layer diagram.",

    // MOTION
    "MOTION & ANIMATION:",
    "- For transitions, document: which properties change, duration, easing curve, and trigger (hover/focus/active).",
    "- For animations, document: name, duration, timing function, delay, iteration count, direction, fill mode, and what triggers it.",
    "- Classify motion intent: entrance, exit, attention, feedback, loading, page transition.",
    "- Always preserve cubic-bezier() values exactly if detected.",
    "- Note if CSS @keyframes were detected and describe what they animate.",

    // TYPOGRAPHY
    "TYPOGRAPHY DETAIL:",
    "- Output actual font-family stacks with fallbacks.",
    "- Document letter-spacing and text-transform when non-default.",
    "- Note font-style when not normal.",
    "- Create a typographic scale showing the relationship between heading and body sizes.",
    "- Note any decorative or display font usage vs body fonts.",

    "Final instruction: Output ONLY the DESIGN.md content. No explanations, no conversational text before or after."
  ].join("\n");
}

// ─── TASK PROMPT ─────────────────────────────────────────────────────

export function buildDesignMarkdownTaskPrompt(sourceUrl: string): string {
  return [
    `🎯 TASK: Generate one complete, production-ready DESIGN.md from the single-page website analysis JSON for ${sourceUrl}.`,

    "⚠️ CRITICAL OUTPUT RULES:",
    "1. Return ONLY valid Markdown. No conversational text before or after.",
    "2. Start with YAML front matter (--- ... ---).",
    "3. EVERY section must include ```css code blocks with exact, usable CSS.",
    "4. NEVER use placeholders like 'Describe the atmosphere' or 'Add content here'.",
    "5. NEVER invent or approximate values — use EXACTLY what the analysis provides.",
    "6. When evidence is weak, write '⚠️ Low confidence — [specific missing signal]'.",

    "📋 REQUIRED SECTIONS (in order):",
    "1. Source Summary — metadata, scan type, confidence, what was analyzed",
    "2. Visual Theme & Brand Atmosphere — concrete description backed by evidence, with CSS variable definitions",
    "3. Design Tokens — ALL token categories with CSS custom property definitions for each",
    "   - Colors (semantic mapping with :root CSS block)",
    "   - Typography (font stacks, scale, letter-spacing, text-transform with CSS)",
    "   - Spacing (scale with CSS custom properties)",
    "   - Radius (scale with CSS custom properties)",
    "   - Shadows (FULL multi-layer box-shadow + text-shadow values in CSS)",
    "   - Gradients (exact gradient CSS with all stops and angles)",
    "   - Effects (backdrop-filter, filter, mix-blend-mode, opacity with CSS)",
    "   - Motion (transitions + animations with full CSS shorthand)",
    "   - Breakpoints (responsive rules detected)",
    "4. Typography System — complete type scale with all detected font properties in CSS",
    "5. Color System & Semantic Roles — semantic color mapping with contrast notes",
    "6. Layout, Grid & Spacing — container widths, grid/flex behavior, section rhythm",
    "7. Component Specifications — CSS code block per component family with ALL detected styles",
    "8. Interaction & Feedback States — hover/focus/active CSS with transition details",
    "9. Motion & Animation Guidelines — @keyframes definitions when detected, transition specs",
    "10. Responsive Behavior — breakpoint documentation",
    "11. Accessibility Requirements — contrast, focus, semantic structure",
    "12. Content & Page Structure — section hierarchy with heading levels",
    "13. Tech Stack Signals & Implementation Guidance — framework/library signals",
    "14. AI Agent Implementation Prompt — direct instructions for recreating the design",
    "15. Do's and Don'ts — concrete rules for implementation",
    "16. Validation Checklist — verify tokens, components, effects, motion, responsive",
    "17. Evidence, Assumptions & Gaps — transparency about what was detected vs inferred",

    "🔍 ANALYSIS GUIDELINES:",
    "- Merge duplicate components into component families (e.g., all primary buttons → one spec).",
    "- If repeated links/buttons share the same styles, summarize them once as a reusable class.",
    "- When shadow values contain multiple layers, explain what EACH layer does (depth, proximity, highlight).",
    "- For gradients, note whether they're used for backgrounds, overlays, text, or borders.",
    "- If backdrop-filter is detected, ALWAYS output complete glass/gloss CSS with vendor prefix.",
    "- If filter: drop-shadow() is detected, compare it with box-shadow and note the difference.",
    "- If text-shadow is detected, describe whether it creates depth, glow, or emboss on text.",
    "- Describe the z-index stacking order when multiple fixed/sticky/absolute elements exist.",
    "- Note the cursor property for interactive elements (pointer, not-allowed, etc.).",
    "- Document overflow behavior (hidden, scroll, auto) for scrollable regions.",

    "🚫 DO NOT:",
    "- Claim exact animation @keyframes content unless the analysis provides keyframe data.",
    "- Claim specific framework version unless detected in source.",
    "- Invent hover colors, active states, or focus rings not in the analysis.",
    "- Use generic 'add transition' advice — output exact transition values if detected.",
    "- Skip any required section — if evidence is weak, mark it explicitly as low confidence."
  ].join("\n");
}
