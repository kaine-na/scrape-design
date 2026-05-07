import { describe, expect, it } from "vitest";
import { getBrowserlessConfig } from "./config";

describe("getBrowserlessConfig", () => {
  it("returns disabled config when token is missing", () => {
    const config = getBrowserlessConfig({});
    expect(config.enabled).toBe(false);
    expect(config.error).toBe("BROWSERLESS_NOT_CONFIGURED");
  });

  it("uses safe defaults", () => {
    const config = getBrowserlessConfig({ BROWSERLESS_API_TOKEN: "token" });
    expect(config.enabled).toBe(true);
    if (!config.enabled) throw new Error("expected enabled config");
    expect(config.region).toBe("sfo");
    expect(config.browser).toBe("chrome");
    expect(config.timeoutMs).toBe(50_000);
    expect(config.useResidentialProxy).toBe(false);
    expect(config.maxConcurrency).toBe(2);
  });

  it("caps timeout below Browserless free session limit", () => {
    const config = getBrowserlessConfig({
      BROWSERLESS_API_TOKEN: "token",
      BROWSERLESS_TIMEOUT_MS: "120000"
    });
    expect(config.enabled).toBe(true);
    if (!config.enabled) throw new Error("expected enabled config");
    expect(config.timeoutMs).toBe(55_000);
  });
});
