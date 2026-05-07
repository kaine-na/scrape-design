import type { AnalysisResult } from "@/lib/analysis/types";

type RawStyleSample = {
  text?: unknown;
  selector?: unknown;
  styles?: unknown;
};

type RawBrowserlessResult = {
  title?: unknown;
  description?: unknown;
  samples?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringOrUndefined(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function normalizeStyles(styles: unknown): Record<string, string> {
  if (!isRecord(styles)) return {};

  return Object.fromEntries(
    Object.entries(styles).filter((entry): entry is [string, string] =>
      typeof entry[1] === "string" && entry[1].length > 0
    )
  );
}

function normalizeSample(sample: unknown): RawStyleSample | undefined {
  if (!isRecord(sample)) return undefined;

  return {
    text: stringOrUndefined(sample.text),
    selector: stringOrUndefined(sample.selector),
    styles: normalizeStyles(sample.styles)
  };
}

function normalizeSampleBucket(samples: unknown): RawStyleSample[] {
  if (!Array.isArray(samples)) return [];
  return samples.flatMap((sample) => {
    const normalized = normalizeSample(sample);
    return normalized ? [normalized] : [];
  });
}

function normalizeSamples(samples: unknown): Record<string, RawStyleSample[]> {
  if (!isRecord(samples)) return {};

  return Object.fromEntries(
    Object.entries(samples).map(([bucketName, bucketSamples]) => [
      bucketName,
      normalizeSampleBucket(bucketSamples)
    ])
  );
}

function pushUniqueToken(
  target: AnalysisResult["tokens"]["colors"],
  seen: Set<string>,
  name: string,
  value: string | undefined,
  role?: string
) {
  if (!value || seen.has(value) || value === "rgba(0, 0, 0, 0)") return;
  seen.add(value);
  target.push({ name, value, role, source: "observed", confidence: "medium" });
}

function pushUniqueDesignToken(
  target: AnalysisResult["tokens"]["spacing"],
  seen: Set<string>,
  namePrefix: string,
  value: string | undefined,
  confidence: "low" | "medium" = "medium"
) {
  if (!value || seen.has(value)) return;
  seen.add(value);
  target.push({
    name: `${namePrefix}-${target.length + 1}`,
    value,
    source: "observed",
    confidence
  });
}

function compactStyles(styles: unknown) {
  return normalizeStyles(styles);
}

export function normalizeBrowserlessResult(input: {
  requestedUrl: string;
  raw: RawBrowserlessResult | unknown;
}): AnalysisResult {
  const raw = isRecord(input.raw) ? input.raw : {};
  const samples = normalizeSamples(raw.samples);
  const allSamples = Object.values(samples).flat();
  const seenColors = new Set<string>();
  const seenTypography = new Set<string>();
  const seenSpacing = new Set<string>();
  const seenRadius = new Set<string>();
  const seenShadows = new Set<string>();
  const seenGradients = new Set<string>();
  const seenEffects = new Set<string>();
  const seenMotion = new Set<string>();

  const colors: AnalysisResult["tokens"]["colors"] = [];
  const typography: AnalysisResult["tokens"]["typography"] = [];
  const spacing: AnalysisResult["tokens"]["spacing"] = [];
  const radius: AnalysisResult["tokens"]["radius"] = [];
  const shadows: AnalysisResult["tokens"]["shadows"] = [];
  const gradients: AnalysisResult["tokens"]["gradients"] = [];
  const effects: AnalysisResult["tokens"]["effects"] = [];
  const motion: AnalysisResult["tokens"]["motion"] = [];

  allSamples.forEach((sample) => {
    const styles = normalizeStyles(sample.styles);
    const text = stringOrUndefined(sample.text);
    pushUniqueToken(
      colors,
      seenColors,
      `color-${colors.length + 1}`,
      styles.color,
      "foreground"
    );
    pushUniqueToken(
      colors,
      seenColors,
      `surface-${colors.length + 1}`,
      styles.backgroundColor,
      "surface"
    );

    const typeValue = [
      styles.fontFamily,
      styles.fontSize,
      styles.fontWeight,
      styles.lineHeight
    ]
      .filter(Boolean)
      .join(" / ");
    if (typeValue && !seenTypography.has(typeValue)) {
      seenTypography.add(typeValue);
      typography.push({
        name: `type-${typography.length + 1}`,
        value: typeValue,
        role: text ? text.slice(0, 60) : undefined,
        source: "observed",
        confidence: "medium"
      });
    }

    pushUniqueDesignToken(spacing, seenSpacing, "spacing", styles.padding, "low");
    pushUniqueDesignToken(radius, seenRadius, "radius", styles.borderRadius);

    if (styles.boxShadow && styles.boxShadow !== "none") {
      pushUniqueDesignToken(shadows, seenShadows, "shadow", styles.boxShadow);
    }
    if (
      styles.backgroundImage?.includes("gradient") &&
      !seenGradients.has(styles.backgroundImage)
    ) {
      seenGradients.add(styles.backgroundImage);
      gradients.push({
        name: `gradient-${gradients.length + 1}`,
        value: styles.backgroundImage,
        kind: styles.backgroundImage.includes("radial")
          ? "radial"
          : styles.backgroundImage.includes("conic")
            ? "conic"
            : "linear",
        stops: [],
        source: "observed",
        confidence: "medium"
      });
    }
    if (styles.filter && styles.filter !== "none") {
      pushUniqueDesignToken(effects, seenEffects, "filter", styles.filter);
    }
    if (styles.transition && styles.transition !== "none") {
      pushUniqueDesignToken(motion, seenMotion, "motion", styles.transition);
    }
    if (styles.animation && styles.animation !== "none") {
      pushUniqueDesignToken(motion, seenMotion, "animation", styles.animation);
    }
  });

  const sectionSamples = samples.sections ?? [];
  const componentSamples = [
    ...(samples.buttons ?? []).map((sample) => ({ type: "control", sample })),
    ...(samples.cards ?? []).map((sample) => ({ type: "card", sample })),
    ...(samples.images ?? []).map((sample) => ({ type: "media", sample }))
  ];

  return {
    source: {
      url: input.requestedUrl,
      analyzedAt: new Date().toISOString(),
      scanType: "single-page"
    },
    confidence: { overall: allSamples.length > 8 ? "high" : "medium" },
    page: {
      title: stringOrUndefined(raw.title),
      description: stringOrUndefined(raw.description),
      sections: sectionSamples.slice(0, 12).map((sample, index) => {
        const text = stringOrUndefined(sample.text);
        return {
          role: stringOrUndefined(sample.selector) ?? "section",
          heading: text?.slice(0, 80),
          textSample: text,
          order: index
        };
      })
    },
    tokens: {
      colors,
      typography,
      spacing,
      radius,
      shadows,
      gradients,
      effects,
      motion,
      breakpoints: []
    },
    components: componentSamples.slice(0, 24).map(({ type, sample }, index) => ({
      type,
      name: `${type}-${index + 1}`,
      selector: stringOrUndefined(sample.selector),
      description: stringOrUndefined(sample.text),
      styles: compactStyles(sample.styles),
      states: [],
      confidence: "medium"
    })),
    evidence: ["Extracted with Browserless real-browser rendering."],
    assumptions: ["Single-page viewport sample; not a full site crawl."],
    gaps: []
  };
}
