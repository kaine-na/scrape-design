import type { AnalysisResult, DesignToken } from "@/lib/analysis/types";

function yamlString(value: string): string {
  return JSON.stringify(value);
}

function tokenList(tokens: DesignToken[]): string {
  if (!tokens.length) return "- No reliable tokens detected. Treat this section as low confidence.";
  return tokens
    .map((token) => `- **${token.name}**: \`${token.value}\` (${token.source}, ${token.confidence})${token.role ? ` - ${token.role}` : ""}`)
    .join("\n");
}

function sectionList(analysis: AnalysisResult): string {
  if (!analysis.page.sections.length) return "- No clear page sections detected.";
  return analysis.page.sections
    .map((section) => `- ${section.order + 1}. **${section.role}**${section.heading ? ` - ${section.heading}` : ""}`)
    .join("\n");
}

function componentList(analysis: AnalysisResult): string {
  if (!analysis.components.length) return "- No reusable components detected with enough confidence.";
  return analysis.components
    .map((component) => {
      const styles = Object.entries(component.styles)
        .filter(([, value]) => value && value !== "none" && value !== "0px")
        .map(([key, value]) => `  - ${key}: \`${value}\``)
        .join("\n");
      return `### ${component.name}\n\n- Type: ${component.type}\n- Confidence: ${component.confidence}\n${styles || "- No distinctive styles detected."}`;
    })
    .join("\n\n");
}

export function generateDesignMarkdown(analysis: AnalysisResult): string {
  return `---
version: 1
source:
  url: ${yamlString(analysis.source.url)}
  analyzedAt: ${yamlString(analysis.source.analyzedAt)}
  scanType: ${yamlString(analysis.source.scanType)}
confidence:
  overall: ${yamlString(analysis.confidence.overall)}
tokens:
  colors: ${analysis.tokens.colors.length}
  typography: ${analysis.tokens.typography.length}
  spacing: ${analysis.tokens.spacing.length}
  radius: ${analysis.tokens.radius.length}
  shadows: ${analysis.tokens.shadows.length}
  motion: ${analysis.tokens.motion.length}
  breakpoints: ${analysis.tokens.breakpoints.length}
components:
  count: ${analysis.components.length}
---

# DESIGN.md

## 1. Source Summary

- Source URL: ${analysis.source.url}
- Scan type: ${analysis.source.scanType}
- Overall confidence: ${analysis.confidence.overall}
- Page title: ${analysis.page.title || "Not detected"}
- Description: ${analysis.page.description || "Not detected"}

## 2. Visual Theme & Brand Atmosphere

Describe the visual atmosphere from detected colors, typography, spacing, and component treatments. Prefer evidence-backed language and mark uncertain claims as inferred.

## 3. Design Tokens

### Colors
${tokenList(analysis.tokens.colors)}

### Typography
${tokenList(analysis.tokens.typography)}

### Spacing
${tokenList(analysis.tokens.spacing)}

### Radius
${tokenList(analysis.tokens.radius)}

### Shadows
${tokenList(analysis.tokens.shadows)}

### Motion
${tokenList(analysis.tokens.motion)}

### Breakpoints
${tokenList(analysis.tokens.breakpoints)}

## 4. Typography System

Use detected typography tokens as the source of truth. Preserve font families, scale relationships, weights, line heights, and responsive changes when implementing.

## 5. Color System & Semantic Roles

Map detected colors into semantic roles: background, foreground, primary action, secondary text, border, surface, success, warning, and error. Do not invent extra colors unless needed for accessibility.

## 6. Layout, Grid & Spacing

Use detected spacing and layout evidence to recreate section rhythm, container width, grid/flex behavior, and whitespace. Prefer tokenized spacing over one-off values.

## 7. Component Specifications

${componentList(analysis)}

## 8. Interaction & Feedback States

Document hover, focus, active, disabled, loading, success, error, and empty states. Label each as detected, observed, or inferred.

## 9. Motion & Animation Guidelines

Use detected transition and animation tokens where available. Keep motion purposeful, short, and tied to interaction or section reveal behavior.

## 10. Responsive Behavior

Use detected breakpoint evidence where available. At minimum, support desktop, tablet, and mobile layouts without horizontal overflow.

## 11. Accessibility Requirements

Validate color contrast, keyboard focus states, semantic headings, form labels, and minimum 44px touch targets for interactive elements.

## 12. Content & Page Structure

${sectionList(analysis)}

## 13. Tech Stack Signals & Implementation Guidance

Implementation should use tokenized CSS and reusable components. Treat any framework/library identification as a signal unless directly detected from source assets.

## 14. AI Agent Implementation Prompt

Build a web page that follows this design system. Use the tokens and component specs above as source of truth. Do not replace distinctive typography, spacing, radius, shadows, or motion with generic defaults. Preserve responsive behavior and accessibility requirements.

## 15. Do's and Don'ts

- Do use detected tokens consistently.
- Do preserve component hierarchy and section rhythm.
- Do label uncertain design details as inferred.
- Don't hardcode unrelated colors or fonts.
- Don't claim unsupported stack details as facts.

## 16. Validation Checklist

- YAML front matter is valid.
- Tokens are applied consistently.
- Components include interaction and feedback states.
- Layout works on desktop, tablet, and mobile.
- Accessibility checks pass WCAG AA where possible.
- Implementation matches detected design evidence.

## 17. Evidence, Assumptions & Gaps

### Evidence
${analysis.evidence.map((item) => `- ${item}`).join("\n") || "- No evidence recorded."}

### Assumptions
${analysis.assumptions.map((item) => `- ${item}`).join("\n") || "- No assumptions recorded."}

### Gaps
${analysis.gaps.map((item) => `- ${item}`).join("\n") || "- No gaps recorded."}
`;
}
