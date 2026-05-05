import { chromium } from "@playwright/test";
import type { PageExtractor } from "./analyze-url";

const interestingSelector = [
  "body",
  "header",
  "nav",
  "main",
  "section",
  "article",
  "h1",
  "h2",
  "h3",
  "button",
  "a",
  "input",
  "textarea",
  "select",
  ".card",
  "[class*='card']",
  "[class*='btn']",
  "[class*='button']"
].join(",");

function uniqueValues(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).slice(0, 30);
}

export async function extractFromHtml(html: string) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

  try {
    await page.setContent(html, { waitUntil: "domcontentloaded" });
    return await page.evaluate((selector) => {
      const uniqueValuesInPage = (values: string[]): string[] =>
        Array.from(new Set(values.filter(Boolean))).slice(0, 30);
      const elements = Array.from(document.querySelectorAll(selector)).slice(0, 200);
      const styles = elements.map((element) => {
        const style = getComputedStyle(element);
        return {
          tag: element.tagName.toLowerCase(),
          text: element.textContent?.trim().slice(0, 120) || "",
          selector: element.tagName.toLowerCase(),
          color: style.color,
          backgroundColor: style.backgroundColor,
          fontFamily: style.fontFamily,
          fontSize: style.fontSize,
          fontWeight: style.fontWeight,
          lineHeight: style.lineHeight,
          padding: style.padding,
          gap: style.gap,
          borderRadius: style.borderRadius,
          boxShadow: style.boxShadow,
          transition: style.transition,
          transitionDuration: style.transitionDuration,
          transitionDurationMs: Array.from(style.transitionDuration.matchAll(/[\d.]+s|[\d.]+ms/g))
            .map((match) =>
              match[0].endsWith("ms")
                ? match[0]
                : `${Number.parseFloat(match[0]) * 1000}ms`
            )
            .join(", ")
        };
      });

      const token = (name: string, value: string) => ({
        name,
        value,
        source: "detected" as const,
        confidence: "medium" as const
      });

      const title = document.title || undefined;
      const description =
        document.querySelector('meta[name="description"]')?.getAttribute("content") ||
        undefined;
      const headings = Array.from(document.querySelectorAll("h1,h2,h3"));

      return {
        title,
        description,
        sections: headings.slice(0, 12).map((heading, index) => ({
          role: index === 0 ? "hero" : "section",
          heading: heading.textContent?.trim() || undefined,
          order: index
        })),
        tokens: {
          colors: uniqueValuesInPage(
            styles.flatMap((style) => [style.color, style.backgroundColor])
          )
            .filter((value) => value !== "rgba(0, 0, 0, 0)")
            .map((value, index) => token(`color-${index + 1}`, value)),
          typography: uniqueValuesInPage(
            styles.map(
              (style) =>
                `${style.fontFamily} / ${style.fontSize} / ${style.fontWeight} / ${style.lineHeight}`
            )
          ).map((value, index) => token(`type-${index + 1}`, value)),
          spacing: uniqueValuesInPage(styles.flatMap((style) => [style.padding, style.gap]))
            .filter((value) => value !== "0px" && value !== "normal")
            .map((value, index) => token(`space-${index + 1}`, value)),
          radius: uniqueValuesInPage(styles.map((style) => style.borderRadius))
            .filter((value) => value !== "0px")
            .map((value, index) => token(`radius-${index + 1}`, value)),
          shadows: uniqueValuesInPage(styles.map((style) => style.boxShadow))
            .filter((value) => value !== "none")
            .map((value, index) => token(`shadow-${index + 1}`, value)),
          motion: uniqueValuesInPage(
            styles.flatMap((style) => [
              style.transition,
              style.transitionDuration,
              style.transitionDurationMs
            ])
          )
            .filter((value) => value !== "all" && value !== "none" && value !== "" && value !== "0s")
            .map((value, index) => token(`motion-${index + 1}`, value)),
          breakpoints: Array.from(document.styleSheets).length
            ? [token("responsive-css", "media queries may be present in stylesheets")]
            : []
        },
        components: styles
          .filter((style) =>
            ["button", "a", "input", "textarea", "select", "article"].includes(style.tag)
          )
          .slice(0, 40)
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
              boxShadow: style.boxShadow,
              transition: style.transition
            },
            states: [],
            confidence: "medium" as const
          })),
        evidence: ["Extracted computed styles from rendered DOM."],
        assumptions: [],
        gaps: []
      };
    }, interestingSelector);
  } finally {
    await browser.close();
  }
}

export const playwrightExtractor: PageExtractor = {
  async extract(url: string) {
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

    try {
      await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
      const html = await page.content();
      return await extractFromHtml(html);
    } finally {
      await browser.close();
    }
  }
};
