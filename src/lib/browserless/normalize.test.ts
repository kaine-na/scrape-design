import { describe, expect, it } from "vitest";
import { analysisResultSchema } from "@/lib/analysis/types";
import { normalizeBrowserlessResult } from "./normalize";

describe("normalizeBrowserlessResult", () => {
  it("converts Browserless samples into AnalysisResult", () => {
    const result = normalizeBrowserlessResult({
      requestedUrl: "https://example.com",
      raw: {
        title: "Example",
        description: "Example description",
        samples: {
          headings: [
            {
              text: "Hero title",
              styles: {
                color: "rgb(10, 20, 30)",
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
      }
    });

    expect(() => analysisResultSchema.parse(result)).not.toThrow();
    expect(result.page.title).toBe("Example");
    expect(result.tokens.colors.length).toBeGreaterThan(0);
    expect(result.tokens.typography.length).toBeGreaterThan(0);
  });

  it("normalizes malformed and empty Browserless payloads without throwing", () => {
    const emptyResult = normalizeBrowserlessResult({
      requestedUrl: "https://example.com",
      raw: null
    });

    expect(() => analysisResultSchema.parse(emptyResult)).not.toThrow();
    expect(emptyResult.page.title).toBeUndefined();
    expect(emptyResult.tokens.colors).toEqual([]);
    expect(emptyResult.components).toEqual([]);

    const malformedResult = normalizeBrowserlessResult({
      requestedUrl: "https://example.com",
      raw: {
        title: null,
        description: null,
        samples: {
          headings: [
            null,
            "bad sample",
            {
              text: null,
              selector: null,
              styles: null
            },
            {
              text: "Valid heading",
              selector: "h1",
              styles: {
                color: null,
                fontSize: "32px",
                lineHeight: undefined
              }
            }
          ],
          buttons: null,
          sections: null,
          cards: "not an array",
          images: [42]
        }
      }
    });

    expect(() => analysisResultSchema.parse(malformedResult)).not.toThrow();
    expect(malformedResult.page.title).toBeUndefined();
    expect(malformedResult.page.description).toBeUndefined();
    expect(malformedResult.tokens.typography).toHaveLength(1);
    expect(malformedResult.components).toEqual([]);
  });

  it("suppresses duplicate non-color tokens by value", () => {
    const result = normalizeBrowserlessResult({
      requestedUrl: "https://example.com",
      raw: {
        samples: {
          headings: [
            {
              text: "One",
              styles: {
                padding: "16px",
                borderRadius: "8px",
                boxShadow: "0 1px 2px rgb(0 0 0 / 20%)",
                backgroundImage: "linear-gradient(red, blue)",
                filter: "blur(2px)",
                transition: "opacity 150ms ease"
              }
            },
            {
              text: "Two",
              styles: {
                padding: "16px",
                borderRadius: "8px",
                boxShadow: "0 1px 2px rgb(0 0 0 / 20%)",
                backgroundImage: "linear-gradient(red, blue)",
                filter: "blur(2px)",
                transition: "opacity 150ms ease",
                animation: "opacity 150ms ease"
              }
            },
            {
              text: "Three",
              styles: {
                padding: "24px",
                borderRadius: "12px",
                boxShadow: "0 2px 4px rgb(0 0 0 / 20%)",
                backgroundImage: "radial-gradient(red, blue)",
                filter: "brightness(0.9)",
                animation: "spin 1s linear"
              }
            }
          ]
        }
      }
    });

    expect(() => analysisResultSchema.parse(result)).not.toThrow();
    expect(result.tokens.spacing.map((token) => token.value)).toEqual([
      "16px",
      "24px"
    ]);
    expect(result.tokens.radius.map((token) => token.value)).toEqual([
      "8px",
      "12px"
    ]);
    expect(result.tokens.shadows.map((token) => token.value)).toEqual([
      "0 1px 2px rgb(0 0 0 / 20%)",
      "0 2px 4px rgb(0 0 0 / 20%)"
    ]);
    expect(result.tokens.gradients.map((token) => token.value)).toEqual([
      "linear-gradient(red, blue)",
      "radial-gradient(red, blue)"
    ]);
    expect(result.tokens.effects.map((token) => token.value)).toEqual([
      "blur(2px)",
      "brightness(0.9)"
    ]);
    expect(result.tokens.motion.map((token) => token.value)).toEqual([
      "opacity 150ms ease",
      "spin 1s linear"
    ]);
  });
});
