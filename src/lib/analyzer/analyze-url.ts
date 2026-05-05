import { analysisResultSchema, type AnalysisResult } from "@/lib/analysis/types";
import { validatePublicHttpUrl } from "@/lib/security/url-validation";
import type { z } from "zod";

type AnalysisInput = z.input<typeof analysisResultSchema>;

type ExtractedPage = Omit<AnalysisInput, "source" | "confidence" | "page"> & {
  title?: string;
  description?: string;
  sections: AnalysisInput["page"]["sections"];
};

export interface PageExtractor {
  extract(url: string): Promise<ExtractedPage>;
}

export async function analyzeUrl(
  inputUrl: string,
  extractor: PageExtractor
): Promise<AnalysisResult> {
  const validation = validatePublicHttpUrl(inputUrl);
  if (!validation.ok) throw new Error(validation.error);

  const extracted = await extractor.extract(validation.url);

  return analysisResultSchema.parse({
    source: {
      url: validation.url,
      analyzedAt: new Date().toISOString(),
      scanType: "single-page"
    },
    confidence: { overall: "medium" },
    page: {
      title: extracted.title,
      description: extracted.description,
      sections: extracted.sections
    },
    tokens: extracted.tokens,
    components: extracted.components,
    evidence: extracted.evidence,
    assumptions: extracted.assumptions,
    gaps: extracted.gaps
  });
}
