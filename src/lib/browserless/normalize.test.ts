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
});
