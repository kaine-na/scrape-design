import { describe, expect, it } from "vitest";
import { extractFromHtml } from "./playwright-extractor";

describe("extractFromHtml", () => {
  it("extracts core visual tokens and components from rendered HTML", async () => {
    const html = `
      <html>
        <head>
          <title>Fixture</title>
          <style>
            body { font-family: Urbanist, sans-serif; color: #111827; background: #f8fafc; }
            h1 { font-size: 64px; line-height: 72px; }
            .cta { background: #fd3a25; color: white; border-radius: 999px; padding: 14px 24px; transition: transform 180ms ease; }
            .card { box-shadow: 0 12px 30px rgba(0,0,0,.12); padding: 32px; border-radius: 32px; }
            @media (max-width: 768px) { h1 { font-size: 40px; } }
          </style>
        </head>
        <body>
          <header><nav><a href="/">Home</a></nav></header>
          <main><section><h1>Hero Title</h1><button class="cta">Start</button><article class="card">Card</article></section></main>
        </body>
      </html>
    `;

    const result = await extractFromHtml(html);

    expect(result.title).toBe("Fixture");
    expect(result.sections[0]?.heading).toBe("Hero Title");
    expect(result.tokens.colors.some((token) => token.value === "rgb(253, 58, 37)")).toBe(true);
    expect(result.tokens.radius.some((token) => token.value === "999px")).toBe(true);
    expect(result.tokens.motion.some((token) => token.value.includes("180ms"))).toBe(true);
    expect(result.components.some((component) => component.type === "button")).toBe(true);
  });
});
