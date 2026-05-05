import { z } from "zod";

export const confidenceSchema = z.enum(["high", "medium", "low"]);
export type Confidence = z.infer<typeof confidenceSchema>;

export const evidenceSourceSchema = z.enum([
  "detected",
  "observed",
  "inferred"
]);
export type EvidenceSource = z.infer<typeof evidenceSourceSchema>;

export const designTokenSchema = z.object({
  name: z.string(),
  value: z.string(),
  role: z.string().optional(),
  source: evidenceSourceSchema.default("detected"),
  confidence: confidenceSchema.default("medium")
});

export const componentSpecSchema = z.object({
  type: z.string(),
  name: z.string(),
  selector: z.string().optional(),
  description: z.string().optional(),
  styles: z.record(z.string(), z.string()).default({}),
  states: z
    .array(
      z.object({
        name: z.string(),
        source: evidenceSourceSchema,
        styles: z.record(z.string(), z.string()).default({})
      })
    )
    .default([]),
  confidence: confidenceSchema.default("medium")
});

export const pageSectionSchema = z.object({
  role: z.string(),
  heading: z.string().optional(),
  textSample: z.string().optional(),
  order: z.number().int().nonnegative()
});

export const analysisResultSchema = z.object({
  source: z.object({
    url: z.string().url(),
    analyzedAt: z.string(),
    scanType: z.literal("single-page")
  }),
  confidence: z.object({ overall: confidenceSchema }),
  page: z.object({
    title: z.string().optional(),
    description: z.string().optional(),
    sections: z.array(pageSectionSchema)
  }),
  tokens: z.object({
    colors: z.array(designTokenSchema),
    typography: z.array(designTokenSchema),
    spacing: z.array(designTokenSchema),
    radius: z.array(designTokenSchema),
    shadows: z.array(designTokenSchema),
    motion: z.array(designTokenSchema),
    breakpoints: z.array(designTokenSchema)
  }),
  components: z.array(componentSpecSchema),
  evidence: z.array(z.string()),
  assumptions: z.array(z.string()),
  gaps: z.array(z.string())
});

export type DesignToken = z.infer<typeof designTokenSchema>;
export type ComponentSpec = z.infer<typeof componentSpecSchema>;
export type AnalysisResult = z.infer<typeof analysisResultSchema>;
