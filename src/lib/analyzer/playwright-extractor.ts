import { chromium, type Page } from "@playwright/test";
import type { PageExtractor } from "./analyze-url";

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
  "p",
  "button",
  "a",
  "input",
  "textarea",
  "select",
  "[role='button']",
  ".card",
  "[class*='card']",
  "[class*='btn']",
  "[class*='button']"
].join(",");

const defaultValues = new Set([
  "rgba(0, 0, 0, 0)",
  "rgb(0, 0, 238)",
  "rgb(240, 240, 240)",
  "Times New Roman",
  '"Times New Roman"',
  "Arial / 13.3333px / 400 / normal",
  '"Times New Roman" / 16px / 400 / normal',
  "all",
  "0s",
  "0ms",
  "none",
  "normal",
  "0px"
]);

function uniqueValues(values: string[], limit = 30): string[] {
  return Array.from(new Set(values.filter(Boolean))).slice(0, limit);
}

async function preparePageForExtraction(page: Page) {
  await page.waitForLoadState("domcontentloaded").catch(() => undefined);
  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);
  await page.waitForTimeout(1_000);
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
  return page.evaluate((selector) => {
    const defaultValues = new Set([
      "rgba(0, 0, 0, 0)",
      "rgb(0, 0, 238)",
      "rgb(240, 240, 240)",
      "Times New Roman",
      '"Times New Roman"',
      "Arial / 13.3333px / 400 / normal",
      '"Times New Roman" / 16px / 400 / normal',
      "all",
      "0s",
      "0ms",
      "none",
      "normal",
      "0px"
    ]);

    const uniqueValuesInPage = (values: string[], limit = 30): string[] =>
      Array.from(new Set(values.filter(Boolean))).slice(0, limit);

    const isVisible = (element: Element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
    };

    const cssVariableTokens = Array.from(document.styleSheets)
      .flatMap((sheet) => {
        try {
          return Array.from(sheet.cssRules || []);
        } catch {
          return [];
        }
      })
      .flatMap((rule) => rule.cssText.match(/--[\w-]+\s*:\s*[^;]+/g) || [])
      .slice(0, 80);

    const elements = Array.from(document.querySelectorAll(selector))
      .filter(isVisible)
      .slice(0, 350);

    const styles = elements.map((element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      const className = typeof element.className === "string" ? element.className : "";
      const transitionDurationMs = Array.from(style.transitionDuration.matchAll(/[\d.]+s|[\d.]+ms/g))
        .map((match) =>
          match[0].endsWith("ms") ? match[0] : `${Number.parseFloat(match[0]) * 1000}ms`
        )
        .filter((value) => value !== "0ms")
        .join(", ");

      return {
        tag: element.tagName.toLowerCase(),
        text: element.textContent?.replace(/\s+/g, " ").trim().slice(0, 180) || "",
        selector: element.id ? `#${element.id}` : className ? `.${className.trim().split(/\s+/).slice(0, 2).join(".")}` : element.tagName.toLowerCase(),
        className,
        color: style.color,
        backgroundColor: style.backgroundColor,
        fontFamily: style.fontFamily,
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
        lineHeight: style.lineHeight,
        margin: style.margin,
        padding: style.padding,
        gap: style.gap,
        display: style.display,
        gridTemplateColumns: style.gridTemplateColumns,
        alignItems: style.alignItems,
        justifyContent: style.justifyContent,
        border: style.border,
        borderRadius: style.borderRadius,
        boxShadow: style.boxShadow,
        transition: style.transition,
        transitionDuration: style.transitionDuration,
        transitionDurationMs,
        animationName: style.animationName,
        animationDuration: style.animationDuration,
        width: `${Math.round(rect.width)}px`,
        height: `${Math.round(rect.height)}px`
      };
    });

    const token = (name: string, value: string, role?: string) => ({
      name,
      value,
      role,
      source: "detected" as const,
      confidence: "medium" as const
    });

    const keepToken = (value: string) => value && !defaultValues.has(value);
    const title = document.title || undefined;
    const description =
      document.querySelector('meta[name="description"]')?.getAttribute("content") || undefined;
    const headings = Array.from(document.querySelectorAll("h1,h2,h3,h4")).filter(isVisible);

    const componentCandidates = styles
      .filter((style) =>
        ["button", "a", "input", "textarea", "select", "article"].includes(style.tag) ||
        style.className.toLowerCase().includes("card") ||
        style.className.toLowerCase().includes("button") ||
        style.className.toLowerCase().includes("btn")
      )
      .filter((style) => style.text || style.tag !== "a");

    const seenComponents = new Set<string>();
    const components = componentCandidates
      .filter((style) => {
        const signature = [style.tag, style.color, style.backgroundColor, style.borderRadius, style.padding, style.boxShadow, style.text.slice(0, 30)].join("|");
        if (seenComponents.has(signature)) return false;
        seenComponents.add(signature);
        return true;
      })
      .slice(0, 24)
      .map((style, index) => ({
        type: style.tag === "a" ? "link" : style.tag,
        name: `${style.tag}-${index + 1}`,
        selector: style.selector,
        description: style.text,
        styles: {
          color: style.color,
          backgroundColor: style.backgroundColor,
          borderRadius: style.borderRadius,
          padding: style.padding,
          border: style.border,
          boxShadow: style.boxShadow,
          transition: style.transition,
          width: style.width,
          height: style.height
        },
        states: style.transitionDurationMs
          ? [
              {
                name: "hover/focus transition",
                source: "detected" as const,
                styles: { transitionDuration: style.transitionDurationMs }
              }
            ]
          : [],
        confidence: "medium" as const
      }));

    const frameworkSignals = [
      document.querySelector("#__next") ? "Next.js root detected" : "",
      document.querySelector("[data-framer-name]") ? "Framer attributes detected" : "",
      Array.from(document.scripts).some((script) => script.src.includes("webflow")) ? "Webflow script detected" : "",
      Array.from(document.querySelectorAll("[class]")).some((node) => /\b(flex|grid|container|mx-auto|text-|bg-|rounded-)\b/.test(String(node.getAttribute("class")))) ? "Utility CSS class signals detected" : ""
    ].filter(Boolean);

    return {
      title,
      description,
      sections: headings.slice(0, 16).map((heading, index) => ({
        role: index === 0 ? "hero" : "section",
        heading: heading.textContent?.replace(/\s+/g, " ").trim() || undefined,
        order: index
      })),
      tokens: {
        colors: uniqueValuesInPage(styles.flatMap((style) => [style.color, style.backgroundColor]))
          .filter(keepToken)
          .map((value, index) => token(`color-${index + 1}`, value)),
        typography: uniqueValuesInPage(
          styles.map((style) => `${style.fontFamily} / ${style.fontSize} / ${style.fontWeight} / ${style.lineHeight}`)
        )
          .filter(keepToken)
          .map((value, index) => token(`type-${index + 1}`, value)),
        spacing: uniqueValuesInPage(styles.flatMap((style) => [style.padding, style.margin, style.gap]))
          .filter(keepToken)
          .map((value, index) => token(`space-${index + 1}`, value)),
        radius: uniqueValuesInPage(styles.map((style) => style.borderRadius))
          .filter(keepToken)
          .map((value, index) => token(`radius-${index + 1}`, value)),
        shadows: uniqueValuesInPage(styles.map((style) => style.boxShadow))
          .filter(keepToken)
          .map((value, index) => token(`shadow-${index + 1}`, value)),
        motion: uniqueValuesInPage(
          styles.flatMap((style) => [style.transition, style.transitionDuration, style.transitionDurationMs, style.animationName, style.animationDuration])
        )
          .filter(keepToken)
          .map((value, index) => token(`motion-${index + 1}`, value)),
        breakpoints: cssVariableTokens.length || Array.from(document.styleSheets).length
          ? [token("responsive-css", "Stylesheets and possible media queries detected")]
          : []
      },
      components,
      evidence: [
        "Extracted computed styles from the live rendered DOM.",
        ...frameworkSignals,
        ...cssVariableTokens.slice(0, 12).map((value) => `CSS variable detected: ${value}`)
      ],
      assumptions: [],
      gaps: components.length ? [] : ["No reusable components were detected with high confidence."]
    };
  }, interestingSelector);
}

export async function extractFromHtml(html: string) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

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
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
      await preparePageForExtraction(page);
      return await extractFromPage(page);
    } finally {
      await browser.close();
    }
  }
};
