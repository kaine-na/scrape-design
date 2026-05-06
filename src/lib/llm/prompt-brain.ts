import type { AnalysisResult, ComponentSpec, DesignToken, GradientToken } from "@/lib/analysis/types";

const TOKEN_LIMIT = 14;
const COMPONENT_LIMIT = 10;
const TEXT_LIMIT = 200;

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
      description: truncate(analysis.page.description, 320),
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
    evidence: analysis.evidence.slice(0, TOKEN_LIMIT + 6).map((item) => truncate(item, TEXT_LIMIT)),
    assumptions: analysis.assumptions.slice(0, TOKEN_LIMIT).map((item) => truncate(item, TEXT_LIMIT)),
    gaps: analysis.gaps.slice(0, TOKEN_LIMIT).map((item) => truncate(item, TEXT_LIMIT))
  };
}

// ─── SYSTEM PROMPT: The "Brain" ─────────────────────────────────────

export function buildDesignSystemBrain(): string {
  return [
    "You are a design-system architect. Convert website analysis JSON into a COMPLETE DESIGN.md for AI coding agents.",
    "CRITICAL: Every design claim must reference evidence from analysis. Label claims Detected/Observed/Inferred. NEVER invent.",
    "Output usable CSS for EVERY token, shadow, gradient, effect, component, and animation using EXACT computed values.",

    "FEW-SHOT EXAMPLES:",

    "SHADOW: '0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.1)'",
    "=> ```css\n.card{box-shadow:0 8px 32px rgba(0,0,0,0.12),0 2px 8px rgba(0,0,0,0.06),inset 0 1px 0 rgba(255,255,255,0.1)}```",

    "GRADIENT: 'linear-gradient(135deg,#667eea 0%,#764ba2 100%)'",
    "=> ```css\n--gradient-hero:linear-gradient(135deg,#667eea 0%,#764ba2 100%);\n.hero{background:var(--gradient-hero)}```",

    "GLASS: backdrop-filter:'blur(12px)',background:'rgba(255,255,255,0.15)'",
    "=> ```css\n.glass{background:rgba(255,255,255,0.15);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,0.2);border-radius:24px}```",

    "ANIMATION: name:'fadeInUp',duration:'0.6s',timing:'cubic-bezier(0.16,1,0.3,1)'",
    "=> ```css\n@keyframes fadeInUp{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:translateY(0)}}\n.anim{animation:fadeInUp 0.6s cubic-bezier(0.16,1,0.3,1) both}```",

    "COLORS: #1a1a2e,#e94560,#0f3460,#f5f5f5",
    "=> ```css\n:root{--bg:#1a1a2e;--accent:#e94560;--surface:#0f3460;--text:#f5f5f5}```",

    "OUTPUT RULES:",
    "- Valid Markdown + YAML front matter. Use ```css blocks for all CSS.",
    "- Shadow layers: preserve ALL layers. Explain each layer (depth/proximity/highlight).",
    "- Gradients: exact angle + all color stops with positions.",
    "- Glass/effects: always include -webkit-backdrop-filter.",
    "- Animation: full shorthand (name duration timing delay count direction fill).",
    "- Weak evidence: write 'Low confidence - [reason]'.",
    "- NEVER placeholder text. Write actual content or mark low confidence.",
    "- Composition: document z-index layers, spatial relationships, visual hierarchy, whitespace rhythm.",
    "- Typography: font stacks + letter-spacing + text-transform + type scale.",
    "- Output ONLY the DESIGN.md. No conversational text."
  ].join("\n");
}

// ─── TASK PROMPT ─────────────────────────────────────────────────────

export function buildDesignMarkdownTaskPrompt(sourceUrl: string): string {
  return [
    `Generate one complete DESIGN.md from the single-page website analysis JSON for ${sourceUrl}.`,
    "",
    "CRITICAL OUTPUT RULES:",
    "1. Return ONLY valid Markdown. Start with YAML front matter (--- ... ---).",
    "2. EVERY section MUST include ```css blocks with exact CSS.",
    "3. NEVER placeholder text. Write actual content or 'Low confidence - [reason]'.",
    "4. NEVER invent/approximate values - use EXACT analysis data.",
    "",
    "REQUIRED SECTIONS (17):",
    "1. Source Summary 2. Visual Theme & Brand Atmosphere 3. Design Tokens (colors,typography,spacing,radius,shadows,gradients,effects,motion,breakpoints) 4. Typography System 5. Color System & Semantic Roles 6. Layout, Grid & Spacing 7. Component Specifications 8. Interaction & Feedback States 9. Motion & Animation Guidelines 10. Responsive Behavior 11. Accessibility Requirements 12. Content & Page Structure 13. Tech Stack Signals & Implementation Guidance 14. AI Agent Implementation Prompt 15. Do's and Don'ts 16. Validation Checklist 17. Evidence, Assumptions & Gaps",
    "",
    "ANALYSIS GUIDELINES:",
    "- Merge duplicate components into families.",
    "- Explain each shadow layer (depth/proximity/highlight/emboss).",
    "- Glass/backdrop-filter: output complete CSS with -webkit- prefix.",
    "- Document z-index stacking order when multiple layers exist.",
    "- Preserve exact cubic-bezier() and gradient values.",
    "- DO NOT: invent hover colors, active states, framework versions, or @keyframes content.",
    "- Output ONLY the DESIGN.md content."
  ].join("\n");
}
