import { describe, expect, it } from "vitest";
import { buildBrowserlessEndpoint, mapBrowserlessError } from "./client";

describe("buildBrowserlessEndpoint", () => {
  it.each([
    ["sfo", "chrome", "https://production-sfo.browserless.io/chrome/bql?token=secret-token"],
    ["sfo", "webkit", "https://production-sfo.browserless.io/webkit/bql?token=secret-token"],
    ["sfo", "firefox", "https://production-sfo.browserless.io/firefox/bql?token=secret-token"],
    ["lon", "chrome", "https://production-lon.browserless.io/chrome/bql?token=secret-token"],
    ["lon", "webkit", "https://production-lon.browserless.io/webkit/bql?token=secret-token"],
    ["lon", "firefox", "https://production-lon.browserless.io/firefox/bql?token=secret-token"],
    ["ams", "chrome", "https://production-ams.browserless.io/chrome/bql?token=secret-token"],
    ["ams", "webkit", "https://production-ams.browserless.io/webkit/bql?token=secret-token"],
    ["ams", "firefox", "https://production-ams.browserless.io/firefox/bql?token=secret-token"]
  ] as const)(
    "builds exact %s %s BrowserQL endpoint",
    (region, browser, expected) => {
      const endpoint = buildBrowserlessEndpoint({
        token: "secret-token",
        region,
        browser
      });

      expect(endpoint.toString()).toBe(expected);
      expect(endpoint.searchParams.get("token")).toBe("secret-token");
    }
  );
});

describe("mapBrowserlessError", () => {
  it.each([402, 409, 429])(
    "maps status %s to quota or concurrency errors",
    (status) => {
      expect(mapBrowserlessError(status, "request failed")).toBe(
        "BROWSERLESS_QUOTA_OR_CONCURRENCY"
      );
    }
  );

  it("maps quota and concurrency message errors", () => {
    expect(mapBrowserlessError(500, "quota limit reached")).toBe(
      "BROWSERLESS_QUOTA_OR_CONCURRENCY"
    );
    expect(mapBrowserlessError(500, "Too many concurrent sessions")).toBe(
      "BROWSERLESS_QUOTA_OR_CONCURRENCY"
    );
  });

  it("maps timeout errors", () => {
    expect(mapBrowserlessError(504, "timeout")).toBe("BROWSERLESS_TIMEOUT");
  });

  it("maps unclassified errors to request failed", () => {
    expect(mapBrowserlessError(500, "internal error")).toBe(
      "BROWSERLESS_REQUEST_FAILED"
    );
  });
});
