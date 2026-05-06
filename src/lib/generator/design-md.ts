import type { AnalysisResult, DesignToken, GradientToken } from "@/lib/analysis/types";

function esc(value: string): string {
  return JSON.stringify(value);
}

// ─── Token formatting helpers ────────────────────────────────────────

function colorBlock(tokens: DesignToken[]): string {
  if (!tokens.length) return "No colors detected.";
  const lines = tokens.map((t) => `  --${t.name}: ${t.value};`);
  return `\`\`\`css\n:root {\n${lines.join("\n")}\n}\n\`\`\``;
}

function typeBlock(tokens: DesignToken[]): string {
  if (!tokens.length) return "No typography tokens detected.";
  const lines = tokens.map((t) => `- **${t.name}**: \`${t.value}\``);
  return lines.join("\n");
}

function spaceBlock(tokens: DesignToken[]): string {
  if (!tokens.length) return "No spacing tokens detected.";
  return tokens
    .map((t) => `- **${t.name}**: \`${t.value}\` (source: ${t.source})`)
    .join("\n");
}

function radiusBlock(tokens: DesignToken[]): string {
  if (!tokens.length) return "No radius tokens detected.";
  return tokens
    .map((t) => `- **${t.name}**: \`${t.value}\` (source: ${t.source})`)
    .join("\n");
}

function shadowBlock(tokens: DesignToken[]): string {
  if (!tokens.length) return "No shadow tokens detected.";
  return tokens
    .map((t) => {
      const hasInset = t.value.includes("inset");
      const layers = t.value.split(/,(?![^(]*\))/).length;
      const label = hasInset ? " (includes inset/emboss)" : "";
      const multi = layers > 1 ? ` (${layers} layers)` : "";
      return `- **${t.name}**: \`${t.value}\` — ${t.source}${label}${multi}`;
    })
    .join("\n");
}

function gradientBlock(gradients: GradientToken[]): string {
  if (!gradients.length) return "No gradients detected.";
  return gradients
    .map((g) => {
      const stops = g.stops
        .map((s) => `  - ${s.color}${s.position ? ` at ${s.position}` : ""}`)
        .join("\n");
      return [
        `### ${g.name}`,
        "",
        `- **Type**: ${g.kind}${g.angle ? ` (${g.angle})` : ""}`,
        `- **CSS**: \`${g.value}\``,
        `- **Stops**:`,
        stops,
        `- **Source**: ${g.source}, ${g.confidence}`
      ].join("\n");
    })
    .join("\n\n");
}

function effectBlock(tokens: DesignToken[]): string {
  if (!tokens.length) return "No effects (filter, backdrop-filter, mix-blend-mode, opacity) detected.";
  return tokens
    .map((t) => {
      const isBackdrop = t.value.includes("blur") || t.value.includes("backdrop");
      const isFilter = t.value.includes("drop-shadow") || t.value.includes("brightness") || t.value.includes("contrast");
      const isBlend = t.value.includes("blend-mode") || t.value.includes("mix-blend");
      const isOpacity = t.value.startsWith("opacity:");
      const tag = isBackdrop ? "[GLASS]" : isFilter ? "[FILTER]" : isBlend ? "[BLEND]" : isOpacity ? "[OPACITY]" : "";
      return `- **${t.name}** ${tag}: \`${t.value}\` (${t.source})`;
    })
    .join("\n");
}

function motionBlock(tokens: DesignToken[]): string {
  if (!tokens.length) return "No motion tokens detected.";
  return tokens
    .map((t) => `- **${t.name}**: \`${t.value}\` (${t.source})`)
    .join("\n");
}

function breakpointBlock(tokens: DesignToken[]): string {
  if (!tokens.length) return "No breakpoint tokens detected.";
  return tokens.map((t) => `- **${t.name}**: ${t.value}`).join("\n");
}

// ─── Component formatting ────────────────────────────────────────────

function componentCssBlock(analysis: AnalysisResult): string {
  if (!analysis.components.length)
    return "No reusable components detected with enough confidence.";

  return analysis.components
    .map((c) => {
      const styleEntries = Object.entries(c.styles).filter(
        ([, value]) => value && value !== "none" && value !== "0px" && value !== "rgba(0, 0, 0, 0)"
      );
      const cssDecls = styleEntries
        .map(([key, value]) => {
          const prop = key.replace(/([A-Z])/g, "-$1").toLowerCase();
          return `  ${prop}: ${value};`;
        })
        .join("\n");

      const stateInfo = c.states.length
        ? c.states
            .map((s) => {
              const stateCss = Object.entries(s.styles)
                .map(([key, value]) => {
                  const prop = key.replace(/([A-Z])/g, "-$1").toLowerCase();
                  return `    ${prop}: ${value};`;
                })
                .join("\n");
              return `- **${s.name}** (${s.source}):\n\`\`\`css\n${stateCss}\n\`\`\``;
            })
            .join("\n")
        : "- No interaction states detected.";

      return [
        `### ${c.name}`,
        "",
        `- **Type**: ${c.type}`,
        `- **Selector**: \`${c.selector ?? "unknown"}\``,
        `- **Confidence**: ${c.confidence}`,
        c.description ? `- **Content**: "${c.description}"` : "",
        "",
        "**Styles:**",
        "```css",
        cssDecls || "  /* No distinctive styles detected */",
        "```",
        "",
        "**Interaction States:**",
        stateInfo
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n---\n\n");
}

function sectionList(analysis: AnalysisResult): string {
  if (!analysis.page.sections.length) return "- No clear page sections detected.";
  return analysis.page.sections
    .map(
      (s) =>
        `- ${s.order + 1}. **${s.role}**${s.heading ? ` — "${s.heading}"` : ""}${s.textSample ? ` (sample: "${s.textSample.slice(0, 80)}")` : ""}`
    )
    .join("\n");
}

// ─── Main generator ──────────────────────────────────────────────────

export function generateDesignMarkdown(analysis: AnalysisResult): string {
  return `---
version: 1
source:
  url: ${esc(analysis.source.url)}
  analyzedAt: ${esc(analysis.source.analyzedAt)}
  scanType: ${esc(analysis.source.scanType)}
confidence:
  overall: ${esc(analysis.confidence.overall)}
tokens:
  colors: ${analysis.tokens.colors.length}
  typography: ${analysis.tokens.typography.length}
  spacing: ${analysis.tokens.spacing.length}
  radius: ${analysis.tokens.radius.length}
  shadows: ${analysis.tokens.shadows.length}
  gradients: ${analysis.tokens.gradients.length}
  effects: ${analysis.tokens.effects.length}
  motion: ${analysis.tokens.motion.length}
  breakpoints: ${analysis.tokens.breakpoints.length}
components:
  count: ${analysis.components.length}
---

# DESIGN.md

## 1. Source Summary

- **Source URL**: ${analysis.source.url}
- **Scan type**: ${analysis.source.scanType}
- **Overall confidence**: ${analysis.confidence.overall}
- **Page title**: ${analysis.page.title || "Not detected"}
- **Description**: ${analysis.page.description || "Not detected"}
- **Analyzed at**: ${analysis.source.analyzedAt}

---

## 2. Visual Theme & Brand Atmosphere



${analysis.tokens.colors.length ? `**Detected palette**: ${analysis.tokens.colors.slice(0, 8).map((c) => c.value).join(", ")}` : "No colors detected."}

${analysis.tokens.gradients.length ? `**Gradients detected**: ${analysis.tokens.gradients.length} gradient(s) — see Section 3 for full CSS.` : ""}

${analysis.tokens.effects.length ? `**Effects detected**: ${analysis.tokens.effects.length} effect(s) — including ${analysis.tokens.effects.filter((e) => e.value.includes("blur")).length} blur/glass, ${analysis.tokens.effects.filter((e) => e.value.includes("drop-shadow")).length} filter shadows.` : ""}

---

## 3. Design Tokens

### 3.1 Colors

${colorBlock(analysis.tokens.colors)}

### 3.2 Typography

${typeBlock(analysis.tokens.typography)}

### 3.3 Spacing

${spaceBlock(analysis.tokens.spacing)}

### 3.4 Border Radius

${radiusBlock(analysis.tokens.radius)}

### 3.5 Shadows

${shadowBlock(analysis.tokens.shadows)}

### 3.6 Gradients

${gradientBlock(analysis.tokens.gradients)}

### 3.7 Effects (Glass, Filter, Blend, Opacity)

${effectBlock(analysis.tokens.effects)}

### 3.8 Motion

${motionBlock(analysis.tokens.motion)}

### 3.9 Breakpoints

${breakpointBlock(analysis.tokens.breakpoints)}

---

## 4. Typography System



**Detected font families and scales** (see Section 3.2 for full token list).

---

## 5. Color System & Semantic Roles



${analysis.tokens.colors.length ? "See Section 3.1 for detected color tokens. Apply semantic mapping below:" : "No colors to map."}

---

## 6. Layout, Grid & Spacing



**Spacing tokens**: See Section 3.3.

---

## 7. Component Specifications

${componentCssBlock(analysis)}

---

## 8. Interaction & Feedback States



See component specs in Section 7 for per-component state CSS.

---

## 9. Motion & Animation Guidelines



**Detected motion tokens**: See Section 3.8.

---

## 10. Responsive Behavior



**Detected breakpoint signals**: See Section 3.9.

---

## 11. Accessibility Requirements



---

## 12. Content & Page Structure

${sectionList(analysis)}

---

## 13. Tech Stack Signals & Implementation Guidance



${analysis.evidence.filter((e) => e.includes("detected") || e.includes("signal")).map((e) => `- ${e}`).join("\n") || "- No framework signals detected."}

---

## 14. AI Agent Implementation Prompt



Build a web page that follows this design system exactly:

1. Use the CSS custom properties from Section 3 as your design token foundation.
2. Implement each component from Section 7 using the exact CSS provided.
3. Preserve all shadow layers (Section 3.5) — do not simplify multi-layer shadows.
4. Apply gradients (Section 3.6) with exact angles and color stops.
5. Implement glass/effects (Section 3.7) including backdrop-filter with -webkit- prefix.
6. Use motion values (Section 3.8) for all transitions and animations.
7. Match the typography scale (Section 4) including letter-spacing and text-transform.
8. Follow the layout patterns (Section 6) for container widths and spacing rhythm.
9. Read Section 17 for evidence confidence — do not overclaim uncertain details.
10. Validate against the checklist in Section 16 before considering the implementation complete.

**DO NOT** replace distinctive typography, spacing, radius, shadows, gradients, or motion with generic defaults.

---

## 15. Do's and Don'ts

- ✅ **DO** use detected tokens consistently via CSS custom properties.
- ✅ **DO** preserve multi-layer shadows exactly as detected.
- ✅ **DO** include -webkit-backdrop-filter for Safari compatibility.
- ✅ **DO** preserve component hierarchy and section rhythm.
- ✅ **DO** label uncertain design details as Inferred with reasoning.
- ✅ **DO** use exact cubic-bezier() values for easing curves.
- ❌ **DON'T** hardcode colors — use token references.
- ❌ **DON'T** simplify box-shadow to a single layer.
- ❌ **DON'T** claim unsupported stack details as facts.
- ❌ **DON'T** invent hover colors, active states, or focus rings.
- ❌ **DON'T** change gradient angles or color stops.

---

## 16. Validation Checklist

- [ ] YAML front matter is valid and complete.
- [ ] All CSS custom properties are defined and referenced consistently.
- [ ] Shadow tokens preserve ALL layers (box-shadow + text-shadow + filter: drop-shadow).
- [ ] Gradient tokens preserve exact angles and all color stops.
- [ ] Glass/filter effects include -webkit- vendor prefixes.
- [ ] Animation values include full shorthand (name duration timing-function delay iteration-count direction fill-mode).
- [ ] Components include interaction and feedback state CSS.
- [ ] Typography includes letter-spacing and text-transform where non-default.
- [ ] Layout works on desktop, tablet, and mobile.
- [ ] Accessibility checks pass WCAG AA where possible.
- [ ] Implementation matches detected design evidence from Section 17.

---

## 17. Evidence, Assumptions & Gaps

### Evidence
${analysis.evidence.map((item) => `- ✅ ${item}`).join("\n") || "- No evidence recorded."}

### Assumptions
${analysis.assumptions.map((item) => `- 🤔 ${item}`).join("\n") || "- No assumptions recorded."}

### Gaps
${analysis.gaps.map((item) => `- ⚠️ ${item}`).join("\n") || "- No gaps recorded."}
`;
}
