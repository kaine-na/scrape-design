export function buildBrowserlessExtractionQuery(url: string, timeoutMs: number) {
  const safeUrl = JSON.stringify(url);
  const finiteTimeoutMs = Number.isFinite(timeoutMs) ? timeoutMs : 50_000;
  const timeout = Math.max(5_000, Math.min(finiteTimeoutMs, 55_000));

  // BrowserQL mutation: goto page, wait for load, run extraction JS via evaluate
  // evaluate content must be a plain JS expression string (not a function declaration with triple quotes)
  // We use an IIFE: (async () => { ... })() which returns a value
  const extractionJs = [
    '(() => {',
    '  const visible = (el) => {',
    '    const rect = el.getBoundingClientRect();',
    '    const style = getComputedStyle(el);',
    '    return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";',
    '  };',
    '  const pick = (selector) => Array.from(document.querySelectorAll(selector)).filter(visible).slice(0, 12);',
    '  const sampleStyles = (el) => {',
    '    const style = getComputedStyle(el);',
    '    const rect = el.getBoundingClientRect();',
    '    return {',
    '      selector: el.tagName.toLowerCase(),',
    '      text: (el.textContent || "").trim().slice(0, 160),',
    '      rect: { width: Math.round(rect.width), height: Math.round(rect.height) },',
    '      styles: {',
    '        color: style.color,',
    '        backgroundColor: style.backgroundColor,',
    '        backgroundImage: style.backgroundImage,',
    '        fontFamily: style.fontFamily,',
    '        fontSize: style.fontSize,',
    '        fontWeight: style.fontWeight,',
    '        lineHeight: style.lineHeight,',
    '        letterSpacing: style.letterSpacing,',
    '        borderRadius: style.borderRadius,',
    '        boxShadow: style.boxShadow,',
    '        textShadow: style.textShadow,',
    '        padding: style.padding,',
    '        margin: style.margin,',
    '        display: style.display,',
    '        gap: style.gap,',
    '        transform: style.transform,',
    '        filter: style.filter,',
    '        backdropFilter: style.backdropFilter,',
    '        transition: style.transition,',
    '        animation: style.animation',
    '      }',
    '    };',
    '  };',
    '  const headings = pick("h1,h2,h3").map(sampleStyles);',
    '  const buttons = pick("button,a,[role=button],input,textarea,select").map(sampleStyles);',
    '  const sections = pick("header,main,section,article,footer,nav").map(sampleStyles);',
    '  const cards = pick("[class*=card],[class*=feature],[class*=pricing],li").map(sampleStyles);',
    '  const images = pick("img,picture,svg").map(sampleStyles);',
    '  return JSON.stringify({',
    '    title: document.title,',
    '    description: (document.querySelector("meta[name=description]") || {}).content || "",',
    '    url: location.href,',
    '    viewport: { width: innerWidth, height: innerHeight },',
    '    samples: { headings, buttons, sections, cards, images }',
    '  });',
    '})()'
  ].join('\\n');

  // Escape the JS string for safe embedding inside a GraphQL string literal
  const escapedJs = extractionJs.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

  return `mutation ExtractDesignSystem {
  goto(url: ${safeUrl}, waitUntil: load, timeout: ${timeout}) {
    status
  }
  wait(time: 2000) {
    time
  }
  evaluate(content: "${escapedJs}") {
    value
  }
}
`;
}
