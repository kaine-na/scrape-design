export function buildBrowserlessExtractionQuery(url: string, timeoutMs: number) {
  const safeUrl = JSON.stringify(url);
  const timeout = Math.max(5_000, Math.min(timeoutMs, 55_000));

  return `
mutation ExtractDesignSystem {
  goto(url: ${safeUrl}, waitUntil: networkIdle, timeout: ${timeout}) {
    status
  }
  evaluate(content: """
    async () => {
      const pick = (selector) => Array.from(document.querySelectorAll(selector)).slice(0, 12);
      const visible = (el) => {
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      };
      const sampleStyles = (el) => {
        const style = getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return {
          selector: el.tagName.toLowerCase(),
          text: (el.textContent || '').trim().slice(0, 160),
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
            animation: style.animation
          }
        };
      };

      await new Promise((resolve) => setTimeout(resolve, 1200));
      window.scrollTo(0, Math.min(document.body.scrollHeight, 900));
      await new Promise((resolve) => setTimeout(resolve, 500));
      window.scrollTo(0, 0);

      const headings = pick('h1,h2,h3').filter(visible).map(sampleStyles);
      const buttons = pick('button,a,[role="button"],input,textarea,select').filter(visible).map(sampleStyles);
      const sections = pick('header,main,section,article,footer,nav').filter(visible).map(sampleStyles);
      const cards = pick('[class*="card"],[class*="feature"],[class*="pricing"],li').filter(visible).map(sampleStyles);
      const images = pick('img,picture,svg').filter(visible).map(sampleStyles);

      return {
        title: document.title,
        description: document.querySelector('meta[name="description"]')?.getAttribute('content') || '',
        url: location.href,
        viewport: { width: innerWidth, height: innerHeight },
        samples: { headings, buttons, sections, cards, images }
      };
    }
  """) {
    value
  }
}
`;
}
