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
});
