"use client";

/* Client-side page extraction using blob URL iframe.
   Since blob URLs inherit origin, we can access iframe.contentDocument
   after loading proxied HTML. Same extraction logic as Playwright version. */

interface ExtractedData {
  title?: string;
  description?: string;
  sections: { role: string; heading?: string; order: number }[];
  tokens: {
    colors: { name: string; value: string; source: string }[];
    typography: { name: string; value: string; source: string }[];
    spacing: { name: string; value: string; source: string }[];
    radius: { name: string; value: string; source: string }[];
    shadows: { name: string; value: string; source: string }[];
    gradients: { name: string; value: string; kind: string; angle?: string; stops: { color: string; position?: string }[]; source: string }[];
    effects: { name: string; value: string; source: string }[];
    motion: { name: string; value: string; source: string }[];
    breakpoints: { name: string; value: string; source: string }[];
  };
  components: Record<string, unknown>[];
  evidence: string[];
  assumptions: string[];
  gaps: string[];
}

const INTERESTING_SELECTOR = [
  "body", "header", "nav", "main", "section", "article", "aside", "footer",
  "h1", "h2", "h3", "h4", "h5", "h6", "p", "span", "button", "a",
  "input", "textarea", "select", "label", "img", "svg", "div",
  "li", "ul", "ol", "form", "figure", "blockquote",
  "[role='button']", ".card", "[class*='card']", "[class*='btn']",
  "[class*='button']", "[class*='hero']", "[class*='header']",
  "[class*='footer']", "[class*='nav']", "[class*='glass']", "[class*='gradient']"
].join(",");

const DEFAULT_SET = new Set([
  "rgba(0, 0, 0, 0)", "rgb(0, 0, 238)", "rgb(240, 240, 240)",
  "rgb(255, 255, 255)", "Times New Roman", '"Times New Roman"',
  "Arial / 13.3333px / 400 / normal", '"Times New Roman" / 16px / 400 / normal',
  "all", "0s", "0ms", "none", "normal", "0px", "auto",
  "rgba(0, 0, 0, 0) 0px 0px 0px 0px", "0px 0px 0px 0px",
  "50% 50%", "0% 0%", "running", "visible", "static", "0", "1", "1px", "0deg",
  "matrix(1, 0, 0, 1, 0, 0)", "none 0s ease 0s 1 normal none running"
]);

function uniqueValues(values: string[], limit = 30): string[] {
  return [...new Set(values.filter(Boolean))].slice(0, limit);
}

function token(name: string, value: string) {
  return { name, value, source: "detected" };
}

async function extractFromIframe(iframe: HTMLIFrameElement, targetUrl: string): Promise<ExtractedData> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("iframe extraction timed out")), 25_000);

    iframe.onload = () => {
      clearTimeout(timeout);

      try {
        const doc = iframe.contentDocument;
        if (!doc) {
          reject(new Error("Could not access iframe document"));
          return;
        }

        /* Wait a short moment for styles to apply */
        setTimeout(() => {
          try {
            const data = extractFromDocument(doc, targetUrl);
            resolve(data);
          } catch (err) {
            reject(err);
          }
        }, 500);
      } catch (err) {
        clearTimeout(timeout);
        reject(err);
      }
    };

    iframe.onerror = () => {
      clearTimeout(timeout);
      reject(new Error("iframe failed to load"));
    };
  });
}

function extractFromDocument(doc: Document, targetUrl: string): ExtractedData {
  const visible = (el: Element) => {
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
  };

  const elements = Array.from(doc.querySelectorAll(INTERESTING_SELECTOR))
    .filter(visible)
    .slice(0, 250);

  const styles = elements.map((el) => {
    const st = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    const cls = typeof el.className === "string" ? el.className : "";

    const animNames = st.animationName.split(",").map((n) => n.trim()).filter((n) => n && n !== "none");

    return {
      tag: el.tagName.toLowerCase(),
      text: el.textContent?.replace(/\s+/g, " ").trim().slice(0, 200) || "",
      selector: el.id ? `#${el.id}` : cls ? `.${cls.trim().split(/\s+/).slice(0, 2).join(".")}` : el.tagName.toLowerCase(),
      className: cls,
      color: st.color,
      backgroundColor: st.backgroundColor,
      backgroundImage: st.backgroundImage,
      fontFamily: st.fontFamily,
      fontSize: st.fontSize,
      fontWeight: st.fontWeight,
      fontStyle: st.fontStyle,
      lineHeight: st.lineHeight,
      letterSpacing: st.letterSpacing,
      textTransform: st.textTransform,
      margin: st.margin,
      padding: st.padding,
      gap: st.gap,
      display: st.display,
      position: st.position,
      zIndex: st.zIndex,
      border: st.border,
      borderRadius: st.borderRadius,
      boxShadow: st.boxShadow,
      textShadow: st.textShadow,
      filter: st.filter,
      backdropFilter: st.backdropFilter,
      mixBlendMode: st.mixBlendMode,
      opacity: st.opacity,
      transform: st.transform,
      transition: st.transition,
      transitionDuration: st.transitionDuration,
      transitionTimingFunction: st.transitionTimingFunction,
      animationName: st.animationName,
      animationDuration: st.animationDuration,
      animationTimingFunction: st.animationTimingFunction,
      animationDelay: st.animationDelay,
      animationIterationCount: st.animationIterationCount,
      animationDirection: st.animationDirection,
      animationFillMode: st.animationFillMode,
      cursor: st.cursor,
      overflow: st.overflow,
      width: `${Math.round(rect.width)}px`,
      height: `${Math.round(rect.height)}px`
    };
  });

  const keep = (v: string): boolean => Boolean(v) && !DEFAULT_SET.has(v);

  const title = doc.title || undefined;
  const descEl = doc.querySelector('meta[name="description"]');
  const description = descEl?.getAttribute("content") || undefined;
  const headings = Array.from(doc.querySelectorAll("h1,h2,h3,h4,h5,h6"))
    .filter(visible)
    .slice(0, 20);

  const colorValues = uniqueValues(
    styles.flatMap((s) => [s.color, s.backgroundColor])
  ).filter(keep).map((v, i) => token(`color-${i + 1}`, v));

  const typeValues = uniqueValues(
    styles.map((s) =>
      `${s.fontFamily} / ${s.fontSize} / ${s.fontWeight}${s.fontStyle !== "normal" ? ` / ${s.fontStyle}` : ""} / ${s.lineHeight}`
    )
  ).filter(keep).map((v, i) => token(`type-${i + 1}`, v));

  const spaceValues = uniqueValues(
    styles.flatMap((s) => [s.padding, s.margin, s.gap])
  ).filter(keep).map((v, i) => token(`space-${i + 1}`, v));

  const radiusValues = uniqueValues(
    styles.map((s) => s.borderRadius)
  ).filter(keep).map((v, i) => token(`radius-${i + 1}`, v));

  const shadowValues = uniqueValues(
    styles.flatMap((s) => [s.boxShadow, s.textShadow])
  ).filter(keep).map((v, i) => token(`shadow-${i + 1}`, v));

  const gradientValues = uniqueValues(
    styles.map((s) => s.backgroundImage)
  ).filter((v) => v && v !== "none" && (v.includes("gradient(") || v.includes("url(")))
    .map((v, i) => {
      const isLin = v.includes("linear-gradient");
      const isRad = v.includes("radial-gradient");
      const isCon = v.includes("conic-gradient");
      const kind = isCon ? "conic" as const : isRad ? "radial" as const : "linear" as const;
      const stops: { color: string; position?: string }[] = [];
      const inner = v.slice(v.indexOf("(") + 1, v.lastIndexOf(")"));
      const parts = inner.split(/,(?![^(]*\))/);
      for (const part of parts) {
        const trimmed = part.trim();
        if (trimmed.match(/^(to\s+|[\d.]+(?:deg|turn|rad|grad))/)) continue;
        const m = trimmed.match(/^(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)|hsla?\([^)]+\)|[a-zA-Z]+)\s*([\d.]+%|[\d.]+px)?$/);
        if (m) stops.push({ color: m[1], position: m[2] });
      }
      return { name: `gradient-${i + 1}`, value: v, kind, stops, source: "detected" };
    });

  const effectValues = uniqueValues(
    styles.flatMap((s) => [s.filter, s.backdropFilter, s.mixBlendMode, s.opacity !== "1" ? `opacity:${s.opacity}` : ""])
  ).filter(keep).map((v, i) => token(`effect-${i + 1}`, v));

  const motionValues = uniqueValues(
    styles.flatMap((s) => [
      s.transition, s.transitionDuration, s.transitionTimingFunction,
      s.animationName, s.animationDuration, s.animationTimingFunction,
      s.animationDelay, s.animationIterationCount, s.animationDirection, s.animationFillMode
    ])
  ).filter(keep).map((v, i) => token(`motion-${i + 1}`, v));

  const candidateTags = new Set(["button", "a", "input", "textarea", "select", "article", "nav", "form"]);
  const componentCandidates = styles
    .filter((s) =>
      candidateTags.has(s.tag) ||
      s.className.toLowerCase().includes("card") ||
      s.className.toLowerCase().includes("button") ||
      s.className.toLowerCase().includes("btn") ||
      s.className.toLowerCase().includes("hero")
    )
    .filter((s) => s.text || s.tag !== "a");

  const seen = new Set<string>();
  const components = componentCandidates
    .filter((s) => {
      const sig = [s.tag, s.color, s.backgroundColor, s.backgroundImage, s.borderRadius, s.padding, s.boxShadow, s.filter, s.backdropFilter, s.text.slice(0, 30)].join("|");
      if (seen.has(sig)) return false;
      seen.add(sig);
      return true;
    })
    .slice(0, 24)
    .map((s, idx) => {
      const cs: Record<string, string> = {};
      const add = (key: string, val: string) => { if (val && !DEFAULT_SET.has(val) && val !== "none") cs[key] = val; };
      add("color", s.color);
      add("backgroundColor", s.backgroundColor);
      add("backgroundImage", s.backgroundImage);
      add("borderRadius", s.borderRadius);
      add("padding", s.padding);
      add("margin", s.margin);
      add("border", s.border);
      add("boxShadow", s.boxShadow);
      add("textShadow", s.textShadow);
      add("filter", s.filter);
      add("backdropFilter", s.backdropFilter);
      add("opacity", s.opacity !== "1" ? s.opacity : "");
      add("transform", s.transform);
      add("transition", s.transition);
      add("width", s.width);
      add("height", s.height);
      add("display", s.display);
      return { type: s.tag === "a" ? "link" : s.tag, name: `${s.tag}-${idx + 1}`, selector: s.selector, description: s.text, styles: cs, states: [], confidence: "medium" };
    });

  const frameworkSignals: string[] = [];
  if (doc.querySelector("#__next")) frameworkSignals.push("Next.js root detected");
  if (doc.querySelector("[data-framer-name]")) frameworkSignals.push("Framer attributes detected");
  if (Array.from(doc.scripts).some((s) => s.src.includes("webflow"))) frameworkSignals.push("Webflow script detected");
  if (Array.from(doc.querySelectorAll("[class]")).some((n) => /\b(flex|grid|container|mx-auto|text-|bg-|rounded-)\b/.test(String(n.getAttribute("class"))))) {
    frameworkSignals.push("Utility CSS class signals detected (likely Tailwind)");
  }

  return {
    title,
    description,
    sections: headings.map((h, i) => ({
      role: i === 0 ? "hero" : "section",
      heading: h.textContent?.replace(/\s+/g, " ").trim() || undefined,
      order: i
    })),
    tokens: {
      colors: colorValues,
      typography: typeValues,
      spacing: spaceValues,
      radius: radiusValues,
      shadows: shadowValues,
      gradients: gradientValues,
      effects: effectValues,
      motion: motionValues,
      breakpoints: [{ name: "responsive", value: "Stylesheets detected", source: "detected" }]
    },
    components,
    evidence: [
      "Extracted computed styles from live rendered DOM via client-side iframe.",
      `Analyzed ${styles.length} visible elements.`,
      ...frameworkSignals
    ],
    assumptions: [],
    gaps: components.length ? [] : ["No reusable components detected with high confidence."]
  };
}

export async function extractFromUrl(targetUrl: string): Promise<ExtractedData> {
  /* Step 1: Fetch HTML via proxy */
  const proxyUrl = `/api/proxy?url=${encodeURIComponent(targetUrl)}`;
  const response = await fetch(proxyUrl);

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: "Proxy fetch failed" }));
    throw new Error((err as { error?: string }).error || `Proxy returned ${response.status}`);
  }

  const html = await response.text();

  /* Step 2: Create blob URL for same-origin iframe access */
  const blob = new Blob([html], { type: "text/html" });
  const blobUrl = URL.createObjectURL(blob);

  /* Step 3: Create hidden iframe */
  const iframe = document.createElement("iframe");
  iframe.style.display = "none";
  iframe.src = blobUrl;
  document.body.appendChild(iframe);

  try {
    const data = await extractFromIframe(iframe, targetUrl);
    return data;
  } finally {
    URL.revokeObjectURL(blobUrl);
    iframe.remove();
  }
}
