import { chromium, type Page } from "@playwright/test";
import type { PageExtractor } from "./analyze-url";
import type { GradientToken, ShadowLayer } from "@/lib/analysis/types";

const interestingSelector = [
  "body",
  "header",
  "nav",
  "main",
  "section",
  "article",
  "aside",
  "footer",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "p",
  "span",
  "button",
  "a",
  "input",
  "textarea",
  "select",
  "label",
  "img",
  "svg",
  "video",
  "div",
  "li",
  "ul",
  "ol",
  "form",
  "figure",
  "blockquote",
  "[role='button']",
  ".card",
  "[class*='card']",
  "[class*='btn']",
  "[class*='button']",
  "[class*='hero']",
  "[class*='header']",
  "[class*='footer']",
  "[class*='nav']",
  "[class*='glass']",
  "[class*='gradient']"
].join(",");

const defaultColorValues = new Set([
  "rgba(0, 0, 0, 0)",
  "rgb(0, 0, 238)",
  "rgb(240, 240, 240)",
  "rgb(255, 255, 255)",
  "rgba(0, 0, 0, 0)"
]);

const defaultFontValues = new Set([
  "Times New Roman",
  '"Times New Roman"',
  "Arial / 13.3333px / 400 / normal",
  '"Times New Roman" / 16px / 400 / normal'
]);

const defaultValues = new Set([
  ...defaultColorValues,
  ...defaultFontValues,
  "all",
  "0s",
  "0ms",
  "none",
  "normal",
  "0px",
  "auto",
  "rgba(0, 0, 0, 0) 0px 0px 0px 0px",
  "0px 0px 0px 0px",
  "50% 50%",
  "0% 0%",
  "running",
  "visible",
  "static",
  "0",
  "1",
  "1px",
  "0deg",
  "matrix(1, 0, 0, 1, 0, 0)",
  "none 0s ease 0s 1 normal none running"
]);

function splitTopLevelCommaList(input: string): string[] {
  const out: string[] = [];
  let depth = 0,
    start = 0;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if (ch === "," && depth === 0) {
      out.push(input.slice(start, i).trim());
      start = i + 1;
    }
  }
  const tail = input.slice(start).trim();
  if (tail) out.push(tail);
  return out;
}

function parseShadowLayers(value: string): ShadowLayer[] {
  if (!value || value === "none") return [];
  return splitTopLevelCommaList(value).map((part) => {
    const inset = /\binset\b/.test(part);
    const cleaned = part.replace(/\binset\b/g, "").trim();
    const colorMatch = cleaned.match(
      /(rgba?\([^)]+\)|hsla?\([^)]+\)|#[0-9a-fA-F]{3,8}|[a-zA-Z]+)$/
    );
    const color = colorMatch?.[1] ?? "rgba(0,0,0,0.25)";
    const nums = cleaned.replace(colorMatch?.[0] ?? "", "").trim().split(/\s+/).filter(Boolean);
    return {
      inset: inset || undefined,
      x: nums[0] ?? "0px",
      y: nums[1] ?? "0px",
      blur: nums[2] ?? "0px",
      spread: nums[3],
      color
    };
  });
}

function classifyGradient(value: string): {
  kind: GradientToken["kind"];
  angle?: string;
  stops: { color: string; position?: string }[];
} | null {
  const v = value.trim();
  if (!v || v === "none") return null;

  const repeating = v.startsWith("repeating-");
  const isLinear = v.includes("linear-gradient(");
  const isRadial = v.includes("radial-gradient(");
  const isConic = v.includes("conic-gradient(");
  if (!isLinear && !isRadial && !isConic) return null;

  const gradientStr = v.match(
    /(?:repeating-)?(?:linear|radial|conic)-gradient\(([^)]*(?:\([^)]*\)[^)]*)*)\)/
  )?.[0];
  if (!gradientStr) return null;

  const innerStart = gradientStr.indexOf("(") + 1;
  const inner = gradientStr.slice(innerStart, -1).trim();

  let kind: GradientToken["kind"] = "linear";
  let angle: string | undefined;
  let stopsRaw = inner;

  if (isLinear) {
    kind = "linear";
    const angleMatch = inner.match(
      /^(to\s+(?:top|bottom|left|right)(?:\s+(?:top|bottom|left|right))?|[\d.]+(?:deg|turn|rad|grad))/
    );
    if (angleMatch) {
      angle = angleMatch[0];
      stopsRaw = inner.slice(angleMatch[0].length).replace(/^,\s*/, "");
    }
  } else if (isRadial) {
    kind = "radial";
    // Skip shape/size/position prefix for simplicity
    const firstColorStop = inner.search(
      /(?:#[0-9a-fA-F]{3,8}|rgba?\(|hsla?\()/
    );
    if (firstColorStop > 0) stopsRaw = inner.slice(firstColorStop);
  } else if (isConic) {
    kind = "conic";
    const fromMatch = inner.match(/from\s+([\d.]+(?:deg|turn|rad|grad))/);
    if (fromMatch) angle = fromMatch[1];
  }

  const stops = splitTopLevelCommaList(stopsRaw)
    .map((stop) => {
      const parts = stop.trim().split(/\s+(?=[\d.]+%|[\d.]+px|[^,]+$)/);
      const colorPart = parts[0]?.trim() ?? "";
      const posPart = parts[1]?.trim();
      return {
        color: colorPart,
        position: posPart || undefined
      };
    })
    .filter((s) => s.color);

  return { kind, angle, stops };
}

function parseAnimationDetails(value: string): {
  name: string;
  duration: string;
  timingFunction: string;
  delay: string;
  iterationCount: string;
  direction: string;
  fillMode: string;
}[] {
  if (!value || value === "none") return [];
  return splitTopLevelCommaList(value).map((item) => {
    const parts = item.trim().split(/\s+/);
    const hasCubicBezier = item.includes("cubic-bezier(");
    const hasSteps = item.includes("steps(");

    let timingFn = "ease";
    if (hasCubicBezier) {
      const m = item.match(/cubic-bezier\([^)]+\)/);
      if (m) timingFn = m[0];
    } else if (hasSteps) {
      const m = item.match(/steps\([^)]+\)/);
      if (m) timingFn = m[0];
    } else {
      const timingKw = item.match(
        /\b(linear|ease(?:-in|-out|-in-out)?|step-(?:start|end))\b/
      );
      if (timingKw) timingFn = timingKw[0];
    }

    return {
      name: parts[parts.length - 1],
      duration: parts.find((p) => /^\d+(\.\d+)?(ms|s)$/.test(p)) ?? "0s",
      timingFunction: timingFn,
      delay: "0s",
      iterationCount: item.match(/\binfinite\b|\b\d+(\.\d+)?\b/)?.[0] ?? "1",
      direction:
        item.match(
          /\bnormal\b|\breverse\b|\balternate(?:-reverse)?\b/
        )?.[0] ?? "normal",
      fillMode:
        item.match(
          /\bnone\b|\bforwards\b|\backwards\b|\bboth\b/
        )?.[0] ?? "none"
    };
  });
}

async function preparePageForExtraction(page: Page) {
  await page
    .waitForLoadState("domcontentloaded")
    .catch(() => undefined);
  await page
    .waitForLoadState("networkidle", { timeout: 10_000 })
    .catch(() => undefined);
  await page.waitForTimeout(1500);
  await page.evaluate(async () => {
    const height = document.documentElement.scrollHeight;
    const viewport = window.innerHeight || 800;
    for (let y = 0; y < height; y += viewport) {
      window.scrollTo(0, y);
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
    window.scrollTo(0, 0);
  });
}

export async function extractFromPage(page: Page) {
  return page.evaluate(
    (opts) => {
      const {
        selector,
        defaultValues,
        defaultColorValues,
        defaultFontValues
      } = opts;
      const defaultValuesSet = new Set(defaultValues);
      const defaultColorValuesSet = new Set(defaultColorValues);
      const defaultFontValuesSet = new Set(defaultFontValues);

      const uniqueValuesInPage = (values: string[], limit = 30): string[] =>
        Array.from(new Set(values.filter(Boolean))).slice(0, limit);

      const visible = (el: Element) => {
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          style.visibility !== "hidden" &&
          style.display !== "none"
        );
      };

      // Source stylesheet CSS variables
      const cssVariableTokens = Array.from(document.styleSheets)
        .flatMap((sheet) => {
          try {
            return Array.from(sheet.cssRules || []);
          } catch {
            return [];
          }
        })
        .flatMap(
          (rule) =>
            (rule as CSSStyleRule).cssText?.match(
              /--[\w-]+\s*:\s*[^;]+/g
            ) || []
        )
        .slice(0, 80);

      // Root-level CSS custom properties
      const rootStyles = getComputedStyle(document.documentElement);
      const rootTokens: string[] = [];
      for (let i = 0; i < rootStyles.length; i++) {
        const name = rootStyles[i];
        if (name.startsWith("--")) {
          rootTokens.push(
            `${name}: ${rootStyles.getPropertyValue(name).trim()}`
          );
        }
      }

      // Query elements
      const elements = Array.from(document.querySelectorAll(selector))
        .filter(visible)
        .slice(0, 400);

      const styles = elements.map((el) => {
        const st = getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        const cls = typeof el.className === "string" ? el.className : "";

        // Parse transition durations
        const transMs = Array.from(
          st.transitionDuration.matchAll(/[\d.]+s|[\d.]+ms/g)
        )
          .map((m) =>
            m[0].endsWith("ms") ? m[0] : `${Number.parseFloat(m[0]) * 1000}ms`
          )
          .filter((v) => v !== "0ms")
          .join(", ");

        // Parse animation names
        const animNames = st.animationName
          .split(",")
          .map((n) => n.trim())
          .filter((n) => n && n !== "none");

        return {
          tag: el.tagName.toLowerCase(),
          text:
            el.textContent
              ?.replace(/\s+/g, " ")
              .trim()
              .slice(0, 200) || "",
          selector: el.id
            ? `#${el.id}`
            : cls
              ? `.${cls.trim().split(/\s+/).slice(0, 2).join(".")}`
              : el.tagName.toLowerCase(),
          className: cls,
          // Colors
          color: st.color,
          backgroundColor: st.backgroundColor,
          backgroundImage: st.backgroundImage,
          backgroundSize: st.backgroundSize,
          backgroundPosition: st.backgroundPosition,
          backgroundBlendMode: st.backgroundBlendMode,
          // Typography
          fontFamily: st.fontFamily,
          fontSize: st.fontSize,
          fontWeight: st.fontWeight,
          fontStyle: st.fontStyle,
          lineHeight: st.lineHeight,
          letterSpacing: st.letterSpacing,
          textTransform: st.textTransform,
          textDecoration: st.textDecorationLine,
          // Spacing & Layout
          margin: st.margin,
          padding: st.padding,
          gap: st.gap,
          display: st.display,
          gridTemplateColumns: st.gridTemplateColumns,
          gridTemplateRows: st.gridTemplateRows,
          flexDirection: st.flexDirection,
          flexWrap: st.flexWrap,
          alignItems: st.alignItems,
          justifyContent: st.justifyContent,
          // Depth
          position: st.position,
          zIndex: st.zIndex,
          // Borders
          border: st.border,
          borderWidth: st.borderWidth,
          borderStyle: st.borderStyle,
          borderColor: st.borderColor,
          borderRadius: st.borderRadius,
          outline: st.outline,
          // Shadows
          boxShadow: st.boxShadow,
          textShadow: st.textShadow,
          // Effects
          filter: st.filter,
          backdropFilter: st.backdropFilter,
          mixBlendMode: st.mixBlendMode,
          opacity: st.opacity,
          // Transform
          transform: st.transform,
          // Transitions & Animation
          transition: st.transition,
          transitionDuration: st.transitionDuration,
          transitionProperty: st.transitionProperty,
          transitionTimingFunction: st.transitionTimingFunction,
          transitionDelay: st.transitionDelay,
          transMs,
          animationName: st.animationName,
          animationDuration: st.animationDuration,
          animationTimingFunction: st.animationTimingFunction,
          animationDelay: st.animationDelay,
          animationIterationCount: st.animationIterationCount,
          animationDirection: st.animationDirection,
          animationFillMode: st.animationFillMode,
          animationNames: animNames,
          // Cursor
          cursor: st.cursor,
          // Overflow
          overflow: st.overflow,
          overflowX: st.overflowX,
          overflowY: st.overflowY,
          // Sizing
          width: `${Math.round(rect.width)}px`,
          height: `${Math.round(rect.height)}px`,
          // Clip
          clipPath: st.clipPath
        };
      });

      // Helper: create a token
      const tk = (name: string, value: string, role?: string) => ({
        name,
        value,
        role,
        source: "detected" as const,
        confidence: "medium" as const
      });

      const keep = (v: string): boolean => Boolean(v) && !defaultValuesSet.has(v);

      const title = document.title || undefined;
      const descEl = document.querySelector('meta[name="description"]');
      const description =
        descEl?.getAttribute("content") || undefined;
      const headings = Array.from(
        document.querySelectorAll("h1,h2,h3,h4,h5,h6")
      )
        .filter(visible)
        .slice(0, 20);

      // ---- Color tokens ----
      const colorValues = uniqueValuesInPage(
        styles.flatMap((s) => [s.color, s.backgroundColor, s.borderColor])
      )
        .filter((v) => !defaultColorValuesSet.has(v))
        .map((v, i) => tk(`color-${i + 1}`, v));

      // ---- Typography tokens ----
      const typeValues = uniqueValuesInPage(
        styles.map(
          (s) =>
            `${s.fontFamily} / ${s.fontSize} / ${s.fontWeight}${s.fontStyle !== "normal" ? ` / ${s.fontStyle}` : ""} / ${s.lineHeight}${s.letterSpacing !== "normal" ? ` / letter:${s.letterSpacing}` : ""}${s.textTransform !== "none" ? ` / ${s.textTransform}` : ""}`
        )
      )
        .filter((v) => !defaultFontValuesSet.has(v))
        .map((v, i) => tk(`type-${i + 1}`, v));

      // ---- Spacing tokens ----
      const spaceValues = uniqueValuesInPage(
        styles.flatMap((s) => [s.padding, s.margin, s.gap])
      )
        .filter(keep)
        .map((v, i) => tk(`space-${i + 1}`, v));

      // ---- Radius tokens ----
      const radiusValues = uniqueValuesInPage(
        styles.map((s) => s.borderRadius)
      )
        .filter(keep)
        .map((v, i) => tk(`radius-${i + 1}`, v));

      // ---- Shadow tokens ----
      const shadowValues = uniqueValuesInPage(
        styles.flatMap((s) => [s.boxShadow, s.textShadow])
      )
        .filter(keep)
        .map((v, i) => tk(`shadow-${i + 1}`, v));

      // ---- Gradient tokens (frontend-side classification) ----
      const gradientValuesRaw = uniqueValuesInPage(
        styles.map((s) => s.backgroundImage)
      )
        .filter(
          (v) =>
            v &&
            v !== "none" &&
            (v.includes("gradient(") || v.includes("url("))
        );

      // ---- Effect tokens ----
      const effectValues = uniqueValuesInPage(
        styles.flatMap((s) => [
          s.filter,
          s.backdropFilter,
          s.mixBlendMode,
          s.backgroundBlendMode,
          s.opacity !== "1" ? `opacity:${s.opacity}` : ""
        ])
      )
        .filter(keep)
        .map((v, i) => tk(`effect-${i + 1}`, v));

      // ---- Motion tokens ----
      const motionValues = uniqueValuesInPage(
        styles.flatMap((s) => [
          s.transition,
          s.transitionDuration,
          s.transitionTimingFunction,
          s.transitionDelay,
          s.transMs,
          s.animationName,
          s.animationDuration,
          s.animationTimingFunction,
          s.animationDelay,
          s.animationIterationCount,
          s.animationDirection,
          s.animationFillMode
        ])
      )
        .filter(keep)
        .map((v, i) => tk(`motion-${i + 1}`, v));

      // ---- Breakpoints ----
      const breakpointTokens =
        cssVariableTokens.length ||
        Array.from(document.styleSheets).length
          ? [
              tk(
                "responsive-css",
                "Stylesheets and possible media queries detected"
              )
            ]
          : [];

      // ---- Components ----
      const candidateTags = new Set([
        "button",
        "a",
        "input",
        "textarea",
        "select",
        "article",
        "nav",
        "form"
      ]);

      const componentCandidates = styles
        .filter(
          (s) =>
            candidateTags.has(s.tag) ||
            s.className.toLowerCase().includes("card") ||
            s.className.toLowerCase().includes("button") ||
            s.className.toLowerCase().includes("btn") ||
            s.className.toLowerCase().includes("hero") ||
            s.className.toLowerCase().includes("badge") ||
            s.className.toLowerCase().includes("pill") ||
            s.className.toLowerCase().includes("chip") ||
            s.className.toLowerCase().includes("modal") ||
            s.className.toLowerCase().includes("dialog") ||
            s.className.toLowerCase().includes("toast") ||
            s.className.toLowerCase().includes("glass") ||
            s.className.toLowerCase().includes("avatar")
        )
        .filter((s) => s.text || s.tag !== "a");

      const seenC = new Set<string>();
      const components = componentCandidates
        .filter((s) => {
          const sig = [
            s.tag,
            s.color,
            s.backgroundColor,
            s.backgroundImage,
            s.borderRadius,
            s.padding,
            s.boxShadow,
            s.filter,
            s.backdropFilter,
            s.transform,
            s.text.slice(0, 30)
          ].join("|");
          if (seenC.has(sig)) return false;
          seenC.add(sig);
          return true;
        })
        .slice(0, 30)
        .map((s, idx) => {
          const componentStyles: Record<string, string> = {};
          const add = (key: string, val: string) => {
            if (val && !defaultValuesSet.has(val) && val !== "none") {
              componentStyles[key] = val;
            }
          };
          add("color", s.color);
          add("backgroundColor", s.backgroundColor);
          add("backgroundImage", s.backgroundImage);
          add("backgroundSize", s.backgroundSize);
          add("borderRadius", s.borderRadius);
          add("padding", s.padding);
          add("margin", s.margin);
          add("border", s.border);
          add("borderWidth", s.borderWidth);
          add("boxShadow", s.boxShadow);
          add("textShadow", s.textShadow);
          add("filter", s.filter);
          add("backdropFilter", s.backdropFilter);
          add("opacity", s.opacity !== "1" ? s.opacity : "");
          add("transform", s.transform);
          add("transition", s.transition);
          add("mixBlendMode", s.mixBlendMode);
          add("position", s.position !== "static" ? s.position : "");
          add("zIndex", s.zIndex !== "auto" ? s.zIndex : "");
          add("width", s.width);
          add("height", s.height);
          add("display", s.display);
          add("gap", s.gap);

          const states: Array<{
            name: string;
            source: "detected" | "observed" | "inferred";
            styles: Record<string, string>;
          }> = [];

          if (s.transMs) {
            const stateStyles: Record<string, string> = {};
            if (s.transitionProperty && s.transitionProperty !== "all") {
              stateStyles.transitionProperty = s.transitionProperty;
            }
            stateStyles.transitionDuration = s.transMs;
            if (
              s.transitionTimingFunction &&
              s.transitionTimingFunction !== "ease"
            ) {
              stateStyles.transitionTimingFunction =
                s.transitionTimingFunction;
            }
            states.push({
              name: "hover/focus transition",
              source: "detected",
              styles: stateStyles
            });
          }

          if (s.animationNames.length > 0) {
            states.push({
              name: `animation: ${s.animationNames.join(", ")}`,
              source: "detected",
              styles: {
                animationName: s.animationName,
                animationDuration: s.animationDuration,
                animationTimingFunction: s.animationTimingFunction,
                animationDelay: s.animationDelay,
                animationIterationCount: s.animationIterationCount,
                animationDirection: s.animationDirection,
                animationFillMode: s.animationFillMode
              }
            });
          }

          return {
            type: s.tag === "a" ? "link" : s.tag,
            name: `${s.tag}-${idx + 1}`,
            selector: s.selector,
            description: s.text,
            styles: componentStyles,
            states,
            confidence: "medium" as const
          };
        });

      // ---- Layout depth analysis ----
      const layoutEvidence: string[] = [];
      const flexCount = styles.filter(
        (s) => s.display === "flex" || s.display === "inline-flex"
      ).length;
      const gridCount = styles.filter(
        (s) => s.display === "grid" || s.display === "inline-grid"
      ).length;
      const stickyCount = styles.filter(
        (s) => s.position === "sticky" || s.position === "fixed"
      ).length;
      const zLayers = styles
        .map((s) => s.zIndex)
        .filter((z) => z !== "auto" && z !== "0")
        .sort((a, b) => Number(a) - Number(b));

      if (flexCount > 0)
        layoutEvidence.push(`${flexCount} elements use flex layout`);
      if (gridCount > 0)
        layoutEvidence.push(`${gridCount} elements use grid layout`);
      if (stickyCount > 0)
        layoutEvidence.push(
          `${stickyCount} elements use sticky/fixed positioning`
        );
      if (zLayers.length > 0)
        layoutEvidence.push(
          `Z-index layers detected: ${zLayers.slice(0, 8).join(", ")}`
        );

      // ---- Framework signals ----
      const frameworkSignals = [
        document.querySelector("#__next")
          ? "Next.js root detected"
          : "",
        document.querySelector("[data-framer-name]")
          ? "Framer attributes detected"
          : "",
        Array.from(document.scripts).some((s) =>
          s.src.includes("webflow")
        )
          ? "Webflow script detected"
          : "",
        Array.from(document.scripts).some((s) =>
          s.src.includes("gsap")
        )
          ? "GSAP animation library detected"
          : "",
        Array.from(document.scripts).some((s) =>
          s.src.includes("motion") || s.src.includes("framer-motion")
        )
          ? "Framer Motion library detected"
          : "",
        Array.from(document.querySelectorAll("[class]")).some((n) =>
          /\b(flex|grid|container|mx-auto|text-|bg-|rounded-|shadow-)\b/.test(
            String(n.getAttribute("class"))
          )
        )
          ? "Utility CSS class signals detected (likely Tailwind)"
          : ""
      ].filter(Boolean);

      return {
        title,
        description,
        sections: headings.map((h, i) => ({
          role: i === 0 ? "hero" : "section",
          heading:
            h.textContent?.replace(/\s+/g, " ").trim() || undefined,
          order: i
        })),
        tokens: {
          colors: colorValues,
          typography: typeValues,
          spacing: spaceValues,
          radius: radiusValues,
          shadows: shadowValues,
          gradients: gradientValuesRaw.map((v, i) => {
            const isLin = v.includes("linear-gradient");
            const isRad = v.includes("radial-gradient");
            const isCon = v.includes("conic-gradient");
            const kind = isCon
              ? "conic"
              : isRad
                ? "radial"
                : "linear";
            const angleMatch = v.match(
              /(?:^|[,\s])(to\s+(?:top|bottom|left|right)(?:\s+(?:top|bottom|left|right))?|[\d.]+(?:deg|turn|rad|grad))/
            );
            const stops: { color: string; position?: string }[] = [];
            const inner = v.slice(v.indexOf("(") + 1, v.lastIndexOf(")"));
            const parts = inner.split(/,(?![^(]*\))/);
            for (const part of parts) {
              const trimmed = part.trim();
              if (
                trimmed.match(
                  /^(to\s+|[\d.]+(?:deg|turn|rad|grad))/
                )
              )
                continue;
              const m = trimmed.match(
                /^(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)|hsla?\([^)]+\)|[a-zA-Z]+)\s*([\d.]+%|[\d.]+px)?$/
              );
              if (m) stops.push({ color: m[1], position: m[2] });
            }
            return {
              name: `gradient-${i + 1}`,
              value: v,
              kind: kind as GradientToken["kind"],
              angle: angleMatch?.[1],
              stops: stops.length ? stops : [{ color: v }],
              source: "detected" as const,
              confidence: "medium" as const
            };
          }),
          effects: effectValues,
          motion: motionValues,
          breakpoints: breakpointTokens
        },
        components,
        evidence: [
          "Extracted computed styles from the live rendered DOM.",
          `Analyzed ${styles.length} visible elements across ${elements.length} matched nodes.`,
          ...layoutEvidence,
          ...frameworkSignals,
          ...cssVariableTokens
            .slice(0, 12)
            .map((v) => `CSS variable detected: ${v}`),
          rootTokens.length > 0
            ? `${rootTokens.length} root-level CSS custom properties found`
            : ""
        ].filter(Boolean),
        assumptions: [],
        gaps: components.length
          ? []
          : ["No reusable components were detected with high confidence."]
      };
    },
    { selector: interestingSelector, defaultValues: Array.from(defaultValues), defaultColorValues: Array.from(defaultColorValues), defaultFontValues: Array.from(defaultFontValues) }
  );
}

export async function extractFromHtml(html: string) {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 }
  });

  try {
    await page.setContent(html, { waitUntil: "domcontentloaded" });
    await preparePageForExtraction(page);
    return await extractFromPage(page);
  } finally {
    await browser.close();
  }
}

export const playwrightExtractor: PageExtractor = {
  async extract(url: string) {
    console.info(`[analyzer] rendering live page ${url}`);
    const browser = await chromium.launch();
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 }
    });

    try {
      await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: 30_000
      });
      await preparePageForExtraction(page);
      return await extractFromPage(page);
    } finally {
      await browser.close();
    }
  }
};
