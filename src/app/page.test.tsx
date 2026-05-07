import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AnalysisResult } from "@/lib/analysis/types";
import { extractFromUrl } from "@/lib/analyzer/client-extractor";
import HomePage from "./page";

vi.mock("@/lib/analyzer/client-extractor", () => ({
  extractFromUrl: vi.fn()
}));

const validAnalysisFixture: AnalysisResult = {
  source: {
    url: "https://example.com",
    analyzedAt: "2026-05-07T00:00:00.000Z",
    scanType: "single-page"
  },
  confidence: { overall: "high" },
  page: {
    title: "Example",
    description: "Example site",
    sections: [{ role: "main", heading: "Example", order: 0 }]
  },
  tokens: {
    colors: [{ name: "Primary", value: "#111111", source: "detected", confidence: "high" }],
    typography: [],
    spacing: [],
    radius: [],
    shadows: [],
    gradients: [],
    effects: [],
    motion: [],
    breakpoints: []
  },
  components: [],
  evidence: ["Observed primary color"],
  assumptions: [],
  gaps: []
};

const fallbackExtraction = {
  title: "Fallback Example",
  description: "Fallback extraction",
  sections: [{ role: "main", heading: "Fallback", order: 0 }],
  tokens: {
    colors: [{ name: "Fallback Primary", value: "#222222", source: "detected" }],
    typography: [],
    spacing: [],
    radius: [],
    shadows: [],
    gradients: [],
    effects: [],
    motion: [],
    breakpoints: []
  },
  components: [],
  evidence: ["Fallback evidence"],
  assumptions: [],
  gaps: []
};

const extractFromUrlMock = vi.mocked(extractFromUrl);

function mockScrollIntoView() {
  Object.defineProperty(Element.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn()
  });
}

async function submitUrl() {
  render(<HomePage />);

  fireEvent.change(screen.getByLabelText(/website url/i), {
    target: { value: "https://example.com" }
  });
  fireEvent.click(screen.getByRole("button", { name: /generate/i }));

  await screen.findByText(/DESIGN.md generated successfully/i);
}

describe("HomePage", () => {
  beforeEach(() => {
    mockScrollIntoView();
    extractFromUrlMock.mockReset();
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("renders URL input and generate action", () => {
    render(<HomePage />);

    expect(screen.getByLabelText(/website url/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /generate/i })
    ).toBeInTheDocument();
  });

  it("uses high-fidelity extraction before markdown generation", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const requestUrl = String(input);
      if (requestUrl === "/api/extract") {
        return Response.json({
          analysis: validAnalysisFixture,
          meta: { provider: "browserless", browser: "chrome", region: "sfo" }
        });
      }
      if (requestUrl === "/api/analyze") {
        return Response.json({ markdown: "# DESIGN.md" });
      }
      return Response.json({}, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await submitUrl();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/extract");
    expect(fetchMock.mock.calls[1][0]).toBe("/api/analyze");
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      url: "https://example.com",
      mode: "high-fidelity"
    });
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body)).analysis).toEqual(validAnalysisFixture);
    expect(extractFromUrlMock).not.toHaveBeenCalled();
  });

  it("falls back to the client extractor when high-fidelity extraction fails", async () => {
    extractFromUrlMock.mockResolvedValue(fallbackExtraction);
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const requestUrl = String(input);
      if (requestUrl === "/api/extract") {
        return Response.json({ error: "Browserless is not configured.", code: "BROWSERLESS_NOT_CONFIGURED" }, { status: 503 });
      }
      if (requestUrl === "/api/analyze") {
        return Response.json({ markdown: "# DESIGN.md" });
      }
      return Response.json({}, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await submitUrl();

    await waitFor(() => expect(extractFromUrlMock).toHaveBeenCalledWith("https://example.com"));
    expect(fetchMock.mock.calls[0][0]).toBe("/api/extract");
    expect(fetchMock.mock.calls[1][0]).toBe("/api/analyze");
    const analyzeBody = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
    expect(analyzeBody.analysis.page.title).toBe("Fallback Example");
    expect(screen.getByText(/High-fidelity extraction failed.*using fast fallback/i)).toBeInTheDocument();
  });

  it("falls back to the client extractor when high-fidelity analysis is malformed", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    extractFromUrlMock.mockResolvedValue(fallbackExtraction);
    const malformedAnalysis = {
      ...validAnalysisFixture,
      source: { ...validAnalysisFixture.source, url: "not-a-url" }
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const requestUrl = String(input);
      if (requestUrl === "/api/extract") {
        return Response.json({
          analysis: malformedAnalysis,
          meta: { provider: "browserless", browser: "chrome", region: "sfo" }
        });
      }
      if (requestUrl === "/api/analyze") {
        return Response.json({ markdown: "# DESIGN.md" });
      }
      return Response.json({}, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await submitUrl();

    await waitFor(() => expect(extractFromUrlMock).toHaveBeenCalledWith("https://example.com"));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/extract");
    expect(fetchMock.mock.calls[1][0]).toBe("/api/analyze");
    const analyzeBody = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
    expect(analyzeBody.analysis.page.title).toBe("Fallback Example");
    expect(warnSpy).toHaveBeenCalledWith(
      "[client] high-fidelity extraction returned malformed analysis; using fast fallback",
      expect.any(Error)
    );
    expect(screen.getByText(/malformed analysis; using fast fallback/i)).toBeInTheDocument();
  });
});
