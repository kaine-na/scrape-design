/**
 * Build a Puppeteer function for the Browserless /function API.
 * This runs server-side in Browserless and returns structured design data.
 *
 * We send it as JSON: { code: string, context: { url: string } }
 * The function uses page.goto + page.evaluate to extract computed styles.
 */

export function buildBrowserlessExtractionCode(): string {
  return `export default async ({ page, context }) => {
  await page.goto(context.url, { waitUntil: "networkidle2", timeout: 45000 });
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.scrollTo(0, Math.min(document.body.scrollHeight, 900)));
  await page.waitForTimeout(800);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(500);

  const data = await page.evaluate(() => {
    const visible = (el) => {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return rect.width > 0 && rect.height > 0
        && style.visibility !== "hidden"
        && style.display !== "none";
    };
    const pick = (selector) => Array.from(document.querySelectorAll(selector))
      .filter(visible).slice(0, 12);

    const sampleStyles = (el) => {
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return {
        selector: el.tagName.toLowerCase(),
        text: (el.textContent || "").trim().slice(0, 160),
        rect: { width: Math.round(rect.width), height: Math.round(rect.height) },
        styles: {
          color: style.color,
          backgroundColor: style.backgroundColor,
          backgroundImage: style.backgroundImage,
          fontFamily: style.fontFamily,
          fontSize: style.fontSize,
          fontWeight: style.fontWeight,
          lineHeight: style.lineHeight,
          letterSpacing: style.letterSpacing,
          borderRadius: style.borderRadius,
          boxShadow: style.boxShadow,
          textShadow: style.textShadow,
          padding: style.padding,
          margin: style.margin,
          display: style.display,
          gap: style.gap,
          transform: style.transform,
          filter: style.filter,
          backdropFilter: style.backdropFilter,
          transition: style.transition,
          animation: style.animation,
        },
      };
    };

    const headings = pick("h1,h2,h3").map(sampleStyles);
    const buttons = pick("button,a,[role=button],input,textarea,select").map(sampleStyles);
    const sections = pick("header,main,section,article,footer,nav").map(sampleStyles);
    const cards = pick("[class*=card],[class*=feature],[class*=pricing],[class*=testimonial],li").map(sampleStyles);
    const images = pick("img,picture,svg").map(sampleStyles);

    return {
      title: document.title,
      description: document.querySelector('meta[name="description"]')
        ? document.querySelector('meta[name="description"]').getAttribute("content") || ""
        : "",
      url: location.href,
      viewport: { width: innerWidth, height: innerHeight },
      samples: { headings, buttons, sections, cards, images },
    };
  });

  return { data, type: "application/json" };
};`;
}
