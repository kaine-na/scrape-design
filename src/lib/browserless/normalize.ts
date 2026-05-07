import type { AnalysisResult } from "@/lib/analysis/types";

type RawStyleSample = {
  text?: string;
  selector?: string;
  styles?: Record<string, string | undefined>;
};

type RawBrowserlessResult = {
  title?: string;
  description?: string;
  samples?: Record<string, RawStyleSample[]>;
};

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

function compactStyles(styles: Record<string, string | undefined> | undefined) {
  return Object.fromEntries(
    Object.entries(styles ?? {}).filter((entry): entry is [string, string] =>
      Boolean(entry[1])
    )
  );
}

export function normalizeBrowserlessResult(input: {
  requestedUrl: string;
  raw: RawBrowserlessResult;
}): AnalysisResult {
  const samples = input.raw.samples ?? {};
  const allSamples = Object.values(samples).flat();
  const seenColors = new Set<string>();
  const seenTypography = new Set<string>();

  const colors: AnalysisResult["tokens"]["colors"] = [];
  const typography: AnalysisResult["tokens"]["typography"] = [];
  const spacing: AnalysisResult["tokens"]["spacing"] = [];
  const radius: AnalysisResult["tokens"]["radius"] = [];
  const shadows: AnalysisResult["tokens"]["shadows"] = [];
  const gradients: AnalysisResult["tokens"]["gradients"] = [];
  const effects: AnalysisResult["tokens"]["effects"] = [];
  const motion: AnalysisResult["tokens"]["motion"] = [];

  allSamples.forEach((sample, index) => {
    const styles = sample.styles ?? {};
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
        role: sample.text ? sample.text.slice(0, 60) : undefined,
        source: "observed",
        confidence: "medium"
      });
    }

    if (styles.padding) {
      spacing.push({
        name: `spacing-${index + 1}`,
        value: styles.padding,
        source: "observed",
        confidence: "low"
      });
    }
    if (styles.borderRadius) {
      radius.push({
        name: `radius-${index + 1}`,
        value: styles.borderRadius,
        source: "observed",
        confidence: "medium"
      });
    }
    if (styles.boxShadow && styles.boxShadow !== "none") {
      shadows.push({
        name: `shadow-${index + 1}`,
        value: styles.boxShadow,
        source: "observed",
        confidence: "medium"
      });
    }
    if (styles.backgroundImage?.includes("gradient")) {
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
      effects.push({
        name: `filter-${index + 1}`,
        value: styles.filter,
        source: "observed",
        confidence: "medium"
      });
    }
    if (styles.transition && styles.transition !== "none") {
      motion.push({
        name: `motion-${index + 1}`,
        value: styles.transition,
        source: "observed",
        confidence: "medium"
      });
    }
    if (styles.animation && styles.animation !== "none") {
      motion.push({
        name: `animation-${index + 1}`,
        value: styles.animation,
        source: "observed",
        confidence: "medium"
      });
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
      title: input.raw.title,
      description: input.raw.description,
      sections: sectionSamples.slice(0, 12).map((sample, index) => ({
        role: sample.selector ?? "section",
        heading: sample.text?.slice(0, 80),
        textSample: sample.text,
        order: index
      }))
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
      selector: sample.selector,
      description: sample.text,
      styles: compactStyles(sample.styles),
      states: [],
      confidence: "medium"
    })),
    evidence: ["Extracted with Browserless real-browser rendering."],
    assumptions: ["Single-page viewport sample; not a full site crawl."],
    gaps: []
  };
}
