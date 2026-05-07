import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AnalysisResult } from "@/lib/analysis/types";
import HomePage from "./page";

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

function mockScrollIntoView() {
  Object.defineProperty(Element.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn()
  });
}

describe("HomePage", () => {
  beforeEach(() => {
    mockScrollIntoView();
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

  it("uses Browserless extraction then LLM generation", async () => {
    function createSseStream(chunks: string[]) {
      const encoder = new TextEncoder();
      return new ReadableStream({
        start(controller) {
          for (const chunk of chunks) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "chunk", content: chunk })}\n\n`));
          }
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`));
          controller.close();
        }
      });
    }

    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const requestUrl = String(input);
      if (requestUrl === "/api/extract") {
        return Response.json({
          analysis: validAnalysisFixture,
          meta: { provider: "browserless", browser: "chrome", region: "sfo" }
        });
      }
      if (requestUrl === "/api/generate") {
        return new Response(createSseStream(["# DESIGN.md"]), {
          headers: { "Content-Type": "text/event-stream" }
        });
      }
      return Response.json({}, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<HomePage />);

    fireEvent.change(screen.getByLabelText(/website url/i), {
      target: { value: "https://example.com" }
    });
    fireEvent.click(screen.getByRole("button", { name: /generate/i }));

    await screen.findByText(/DESIGN.md streamed successfully/i);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/extract");
    expect(fetchMock.mock.calls[1][0]).toBe("/api/generate");
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      url: "https://example.com",
      mode: "high-fidelity"
    });
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body)).analysis).toEqual(validAnalysisFixture);
  });

  it("shows error when Browserless extraction fails", { timeout: 15000 }, async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const requestUrl = String(input);
      if (requestUrl === "/api/extract") {
        return Response.json(
          { error: "Browserless is not configured.", code: "BROWSERLESS_NOT_CONFIGURED" },
          { status: 503 }
        );
      }
      return Response.json({}, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<HomePage />);

    fireEvent.change(screen.getByLabelText(/website url/i), {
      target: { value: "https://example.com" }
    });
    fireEvent.click(screen.getByRole("button", { name: /generate/i }));

    /* Wait for button to re-enable (loading done) */
    const btn = await screen.findByRole("button", { name: /generate/i });
    expect(btn).not.toBeDisabled();

    /* Error text should now be in the document */
    const allText = document.body.textContent ?? "";
    expect(allText).toContain("BROWSERLESS_NOT_CONFIGURED");
  });
});
