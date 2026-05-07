import { afterEach, describe, expect, it, vi } from "vitest";

const { getOptionalRequestContextMock } = vi.hoisted(() => ({
  getOptionalRequestContextMock: vi.fn()
}));

vi.mock("@cloudflare/next-on-pages", () => ({
  getOptionalRequestContext: getOptionalRequestContextMock
}));

describe("getBrowserlessEnv", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    getOptionalRequestContextMock.mockReset();
  });

  it("merges Cloudflare env bindings over process env", async () => {
    vi.stubEnv("BROWSERLESS_API_TOKEN", "local-token");
    vi.stubEnv("BROWSERLESS_REGION", "sfo");
    getOptionalRequestContextMock.mockReturnValue({
      env: {
        BROWSERLESS_API_TOKEN: "cloudflare-token",
        BROWSERLESS_REGION: "ams",
        NON_STRING_BINDING: { fetch: vi.fn() }
      }
    });

    const { getBrowserlessEnv } = await import("./env");
    const env = await getBrowserlessEnv();

    expect(env.BROWSERLESS_API_TOKEN).toBe("cloudflare-token");
    expect(env.BROWSERLESS_REGION).toBe("ams");
    expect(env.NON_STRING_BINDING).toBeUndefined();
  });
});
