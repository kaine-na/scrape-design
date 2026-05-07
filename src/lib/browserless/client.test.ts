import { describe, expect, it } from "vitest";
import { buildBrowserlessEndpoint, mapBrowserlessError } from "./client";

describe("buildBrowserlessEndpoint", () => {
  it("builds a Browserless BrowserQL endpoint without leaking token in logs", () => {
    const endpoint = buildBrowserlessEndpoint({
      token: "secret-token",
      region: "sfo",
      browser: "chrome"
    });

    expect(endpoint.toString()).toContain("browserless.io");
    expect(endpoint.searchParams.get("token")).toBe("secret-token");
  });
});

describe("mapBrowserlessError", () => {
  it("maps quota and concurrency errors", () => {
    expect(mapBrowserlessError(429, "Too many concurrent sessions")).toBe(
      "BROWSERLESS_QUOTA_OR_CONCURRENCY"
    );
  });

  it("maps timeout errors", () => {
    expect(mapBrowserlessError(504, "timeout")).toBe("BROWSERLESS_TIMEOUT");
  });
});
