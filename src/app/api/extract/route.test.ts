import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const { getBrowserlessConfigMock } = vi.hoisted(() => ({
  getBrowserlessConfigMock: vi.fn<() => unknown>(() => ({
    enabled: false,
    error: "BROWSERLESS_NOT_CONFIGURED" as const
  }))
}));

vi.mock("@/lib/browserless/config", () => ({
  getBrowserlessConfig: getBrowserlessConfigMock
}));

import { POST } from "./route";

const validBrowserlessPayload = {
  title: "Example",
  description: "Example description",
  samples: {
    headings: [
      {
        text: "Hero title",
        selector: "h1",
        styles: {
          color: "rgb(10, 20, 30)",
          backgroundColor: "rgb(255, 255, 255)",
          fontFamily: "Inter",
          fontSize: "64px",
          fontWeight: "700",
          lineHeight: "1.1"
        }
      }
    ],
    buttons: [],
    sections: [],
    cards: [],
    images: []
  }
};

describe("POST /api/extract", () => {
  beforeEach(() => {
    getBrowserlessConfigMock.mockReset();
    getBrowserlessConfigMock.mockReturnValue({
      enabled: false,
      error: "BROWSERLESS_NOT_CONFIGURED"
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns 400 for invalid JSON", async () => {
    const response = await POST(
      new Request("http://localhost/api/extract", { method: "POST", body: "{" })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: "INVALID_JSON" });
  });

  it("returns 400 for invalid URLs", async () => {
    const response = await POST(
      new Request("http://localhost/api/extract", {
        method: "POST",
        body: JSON.stringify({ url: "localhost:3000" })
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: "INVALID_URL" });
  });

  it("returns 503 when Browserless is not configured", async () => {
    const response = await POST(
      new Request("http://localhost/api/extract", {
        method: "POST",
        body: JSON.stringify({ url: "https://example.com" })
      })
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      code: "BROWSERLESS_NOT_CONFIGURED"
    });
  });

  it("returns normalized analysis from Browserless", async () => {
    getBrowserlessConfigMock.mockReturnValue({
      enabled: true,
      token: "test-token",
      region: "sfo",
      browser: "chrome",
      timeoutMs: 50_000,
      useResidentialProxy: false,
      maxConcurrency: 2
    });

    const fetchMock = vi.fn(async () =>
      Response.json({ data: { evaluate: { value: validBrowserlessPayload } } })
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(
      new Request("http://localhost/api/extract", {
        method: "POST",
        body: JSON.stringify({ url: "https://example.com" })
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(body.analysis.source.url).toBe("https://example.com/");
    expect(body.analysis.page.title).toBe("Example");
    expect(body.meta).toMatchObject({
      provider: "browserless",
      browser: "chrome",
      region: "sfo",
      timedOut: false
    });
  });

  it("maps Browserless failures", async () => {
    getBrowserlessConfigMock.mockReturnValue({
      enabled: true,
      token: "test-token",
      region: "sfo",
      browser: "chrome",
      timeoutMs: 50_000,
      useResidentialProxy: false,
      maxConcurrency: 2
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("Too many concurrent sessions", { status: 429 }))
    );

    const response = await POST(
      new Request("http://localhost/api/extract", {
        method: "POST",
        body: JSON.stringify({ url: "https://example.com" })
      })
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({
      code: "BROWSERLESS_QUOTA_OR_CONCURRENCY"
    });
  });
});
