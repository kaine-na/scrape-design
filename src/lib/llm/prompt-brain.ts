import type { AnalysisResult, ComponentSpec, DesignToken } from "@/lib/analysis/types";

const TOKEN_LIMIT = 16;
const COMPONENT_LIMIT = 12;
const TEXT_LIMIT = 220;

function truncate(value: string | undefined, limit = TEXT_LIMIT): string | undefined {
  if (!value) return undefined;
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > limit ? `${normalized.slice(0, limit - 1)}...` : normalized;
}

function compactTokens(tokens: DesignToken[], limit = TOKEN_LIMIT) {
  return tokens.slice(0, limit).map((token) => ({
    name: token.name,
    value: truncate(token.value, 160),
    role: token.role,
    source: token.source,
    confidence: token.confidence
  }));
}

function styleSignature(component: ComponentSpec): string {
  return [
    component.type,
    component.styles.color,
    component.styles.backgroundColor,
    component.styles.borderRadius,
    component.styles.padding,
    component.styles.boxShadow,
    component.styles.transition
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
          .filter(([, value]) => value && value !== "none" && value !== "0px" && value !== "rgba(0, 0, 0, 0)")
          .slice(0, 10)
          .map(([key, value]) => [key, truncate(value, 180)])
      ),
      states: component.states.slice(0, 4),
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
      sections: analysis.page.sections.slice(0, 16).map((section) => ({
        role: section.role,
        heading: truncate(section.heading, 160),
        textSample: truncate(section.textSample, 180),
        order: section.order
      }))
    },
    tokens: {
      colors: compactTokens(analysis.tokens.colors),
      typography: compactTokens(analysis.tokens.typography),
      spacing: compactTokens(analysis.tokens.spacing),
      radius: compactTokens(analysis.tokens.radius),
      shadows: compactTokens(analysis.tokens.shadows),
      motion: compactTokens(analysis.tokens.motion),
      breakpoints: compactTokens(analysis.tokens.breakpoints)
    },
    components: compactComponents(analysis.components),
    evidence: analysis.evidence.slice(0, 24).map((item) => truncate(item, 240)),
    assumptions: analysis.assumptions.slice(0, 16).map((item) => truncate(item, 240)),
    gaps: analysis.gaps.slice(0, 16).map((item) => truncate(item, 240))
  };
}

export function buildDesignSystemBrain(): string {
  return [
    "As a senior design-system documentation architect, convert rendered website analysis into a practical DESIGN.md for engineers and coding agents.",
    "Write as a precise design auditor and implementation spec author. Do not mention being an AI, a model, or an assistant.",
    "Use only evidence from the provided analysis unless a claim is explicitly labeled as inferred.",
    "Never invent brand details, tech stack, animations, colors, fonts, or component behavior that the analysis does not support.",
    "The output must be a complete Markdown document with YAML front matter.",
    "Do not include placeholders, TODOs, generic filler, or instructions like 'describe the atmosphere'. Write the actual content.",
    "When evidence is weak, write a concise low-confidence note and explain what signal is missing.",
    "Every major design claim must be grounded as Detected, Observed, or Inferred.",
    "Optimize for implementation: tokens, layout rules, components, interactions, motion, responsive behavior, accessibility, do/don't rules, and validation checklist."
  ].join("\n");
}

export function buildDesignMarkdownTaskPrompt(sourceUrl: string): string {
  return [
    `Task: Generate one complete DESIGN.md from the supplied single-page website analysis JSON for ${sourceUrl}.`,
    "Return Markdown only.",
    "Start with YAML front matter.",
    "Include these sections: Source Summary; Visual Theme & Brand Atmosphere; Design Tokens; Typography System; Color System & Semantic Roles; Layout, Grid & Spacing; Component Specifications; Interaction & Feedback States; Motion & Animation Guidelines; Responsive Behavior; Accessibility Requirements; Content & Page Structure; Tech Stack Signals & Implementation Guidance; AI Agent Implementation Prompt; Do's and Don'ts; Validation Checklist; Evidence, Assumptions & Gaps.",
    "Replace generic guidance with concrete findings from the analysis.",
    "Merge duplicate components into component families.",
    "If repeated links/buttons share the same styles, summarize them once.",
    "If a section has weak evidence, write 'Low confidence' plus what was missing.",
    "Do not claim exact animation, stack, or responsive rules unless supported by data.",
    "Keep the document comprehensive but avoid unnecessary repetition."
  ].join("\n");
}
