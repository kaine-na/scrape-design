import { describe, expect, it } from "vitest";
import { buildBrowserlessExtractionCode } from "./extraction-script";

describe("buildBrowserlessExtractionCode", () => {
  it("produces a Puppeteer function string with page.goto and page.evaluate", () => {
    const code = buildBrowserlessExtractionCode();
    expect(code).toContain("export default async");
    expect(code).toContain("page.goto");
    expect(code).toContain("page.evaluate");
    expect(code).toContain("getComputedStyle");
    expect(code).toContain("return { data, type");
  });

  it("includes selectors for headings, buttons, sections, cards, images", () => {
    const code = buildBrowserlessExtractionCode();
    expect(code).toContain("h1,h2,h3");
    expect(code).toContain("button,a");
    expect(code).toContain("header,main,section");
    expect(code).toContain("img,picture,svg");
  });

  it("uses DOM-ready navigation with resilient content waits for SPAs", () => {
    const code = buildBrowserlessExtractionCode();
    expect(code).toContain("domcontentloaded");
    expect(code).toContain("waitForSelector");
    expect(code).toContain("waitForFunction");
    expect(code).not.toContain("networkidle2");
  });
});
