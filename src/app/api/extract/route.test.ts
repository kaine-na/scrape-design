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

function mockDnsAndBrowserlessFetch(browserlessResponse: () => Response | Promise<Response>) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const requestUrl = String(input);
    if (requestUrl.startsWith("https://cloudflare-dns.com/dns-query")) {
      const type = new URL(requestUrl).searchParams.get("type");
      return Response.json({
        Answer: type === "A" ? [{ data: "93.184.216.34" }] : [{ data: "2606:2800:220:1:248:1893:25c8:1946" }]
      });
    }

    return browserlessResponse();
  });
}

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

  it("rejects private IPv6 URLs before Browserless", async () => {
    getBrowserlessConfigMock.mockReturnValue({
      enabled: true,
      token: "super-secret-token",
      region: "sfo",
      browser: "chrome",
      timeoutMs: 50_000,
      useResidentialProxy: false,
      maxConcurrency: 2
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(
      new Request("http://localhost/api/extract", {
        method: "POST",
        body: JSON.stringify({ url: "http://[::1]/" })
      })
    );
    const bodyText = await response.text();

    expect(response.status).toBe(400);
    expect(JSON.parse(bodyText)).toMatchObject({ code: "INVALID_URL" });
    expect(bodyText).not.toContain("super-secret-token");
    expect(fetchMock).not.toHaveBeenCalled();
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

    const fetchMock = mockDnsAndBrowserlessFetch(async () =>
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
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(body.analysis.source.url).toBe("https://example.com/");
    expect(body.analysis.page.title).toBe("Example");
    expect(body.meta).toMatchObject({
      provider: "browserless",
      browser: "chrome",
      region: "sfo",
      timedOut: false
    });
  });

  it("rejects hostnames whose DNS answers include private addresses", async () => {
    getBrowserlessConfigMock.mockReturnValue({
      enabled: true,
      token: "super-secret-token",
      region: "sfo",
      browser: "chrome",
      timeoutMs: 50_000,
      useResidentialProxy: false,
      maxConcurrency: 2
    });
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const requestUrl = String(input);
      if (requestUrl.startsWith("https://cloudflare-dns.com/dns-query")) {
        return Response.json({ Answer: [{ data: "10.0.0.5" }] });
      }
      return Response.json({ data: { evaluate: { value: validBrowserlessPayload } } });
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(
      new Request("http://localhost/api/extract", {
        method: "POST",
        body: JSON.stringify({ url: "https://example.com" })
      })
    );
    const bodyText = await response.text();

    expect(response.status).toBe(400);
    expect(JSON.parse(bodyText)).toMatchObject({ code: "INVALID_URL" });
    expect(bodyText).not.toContain("super-secret-token");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("fails closed when DNS preflight cannot resolve", async () => {
    getBrowserlessConfigMock.mockReturnValue({
      enabled: true,
      token: "super-secret-token",
      region: "sfo",
      browser: "chrome",
      timeoutMs: 50_000,
      useResidentialProxy: false,
      maxConcurrency: 2
    });
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const requestUrl = String(input);
      if (requestUrl.startsWith("https://cloudflare-dns.com/dns-query")) {
        return new Response("dns unavailable", { status: 503 });
      }
      return Response.json({ data: { evaluate: { value: validBrowserlessPayload } } });
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(
      new Request("http://localhost/api/extract", {
        method: "POST",
        body: JSON.stringify({ url: "https://example.com" })
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: "INVALID_URL" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns 429 when module concurrency is exhausted", async () => {
    getBrowserlessConfigMock.mockReturnValue({
      enabled: true,
      token: "test-token",
      region: "sfo",
      browser: "chrome",
      timeoutMs: 50_000,
      useResidentialProxy: false,
      maxConcurrency: 1
    });

    let releaseBrowserless: (() => void) | undefined;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const requestUrl = String(input);
      if (requestUrl.startsWith("https://cloudflare-dns.com/dns-query")) {
        return Response.json({ Answer: [{ data: "93.184.216.34" }] });
      }

      await new Promise<void>((resolve) => {
        releaseBrowserless = resolve;
      });
      return Response.json({ data: { evaluate: { value: validBrowserlessPayload } } });
    });
    vi.stubGlobal("fetch", fetchMock);

    const first = POST(
      new Request("http://localhost/api/extract", {
        method: "POST",
        body: JSON.stringify({ url: "https://example.com" })
      })
    );
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());

    const second = await POST(
      new Request("http://localhost/api/extract", {
        method: "POST",
        body: JSON.stringify({ url: "https://example.com" })
      })
    );

    expect(second.status).toBe(429);
    await expect(second.json()).resolves.toMatchObject({
      code: "BROWSERLESS_QUOTA_OR_CONCURRENCY"
    });

    releaseBrowserless?.();
    await expect(first).resolves.toMatchObject({ status: 200 });
  });

  it("decrements concurrency after extraction finishes", async () => {
    getBrowserlessConfigMock.mockReturnValue({
      enabled: true,
      token: "test-token",
      region: "sfo",
      browser: "chrome",
      timeoutMs: 50_000,
      useResidentialProxy: false,
      maxConcurrency: 1
    });
    vi.stubGlobal(
      "fetch",
      mockDnsAndBrowserlessFetch(async () =>
        Response.json({ data: { evaluate: { value: validBrowserlessPayload } } })
      )
    );

    const first = await POST(
      new Request("http://localhost/api/extract", {
        method: "POST",
        body: JSON.stringify({ url: "https://example.com" })
      })
    );
    const second = await POST(
      new Request("http://localhost/api/extract", {
        method: "POST",
        body: JSON.stringify({ url: "https://example.com" })
      })
    );

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
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
      mockDnsAndBrowserlessFetch(async () => new Response("Too many concurrent sessions", { status: 429 }))
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
