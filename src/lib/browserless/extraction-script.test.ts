import { describe, expect, it } from "vitest";
import { buildBrowserlessExtractionQuery } from "./extraction-script";

describe("buildBrowserlessExtractionQuery", () => {
  it("builds a BrowserQL mutation with target URL and extraction function", () => {
    const query = buildBrowserlessExtractionQuery("https://example.com", 50_000);
    expect(query).toContain("https://example.com");
    expect(query).toContain("mutation");
    expect(query).toContain("goto");
    expect(query).toContain("evaluate");
  });

  it("JSON-escapes the target URL", () => {
    const url = 'https://example.com/search?q="quoted"&path=\\value';
    const query = buildBrowserlessExtractionQuery(url, 50_000);

    expect(query).toContain(`goto(url: ${JSON.stringify(url)}, waitUntil: load, timeout: 50000)`);
  });

  it("defaults non-finite timeouts", () => {
    const query = buildBrowserlessExtractionQuery("https://example.com", Number.NaN);

    expect(query).toContain("timeout: 50000");
    expect(query).not.toContain("timeout: NaN");
  });

  it("defaults infinite timeouts", () => {
    const query = buildBrowserlessExtractionQuery("https://example.com", Number.POSITIVE_INFINITY);

    expect(query).toContain("timeout: 50000");
  });

  it("caps finite timeout values above the Browserless limit", () => {
    const query = buildBrowserlessExtractionQuery("https://example.com", 60_000);

    expect(query).toContain("timeout: 55000");
  });

  it("floors timeout values below the minimum", () => {
    const query = buildBrowserlessExtractionQuery("https://example.com", 1_000);

    expect(query).toContain("timeout: 5000");
  });
});
