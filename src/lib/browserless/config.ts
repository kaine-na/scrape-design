export type BrowserlessRegion = "sfo" | "lon" | "ams";
export type BrowserlessBrowser = "chrome" | "webkit" | "firefox";

export type BrowserlessConfig =
  | { enabled: false; error: "BROWSERLESS_NOT_CONFIGURED" }
  | {
      enabled: true;
      token: string;
      region: BrowserlessRegion;
      browser: BrowserlessBrowser;
      timeoutMs: number;
      useResidentialProxy: boolean;
      maxConcurrency: number;
    };

type Env = Record<string, string | undefined>;

const regionSet = new Set(["sfo", "lon", "ams"]);
const browserSet = new Set(["chrome", "webkit", "firefox"]);

function parsePositiveInt(value: string | undefined, fallback: number) {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function getDefaultEnv(): Env {
  return typeof process !== "undefined" && process.env ? process.env : {};
}

export function getBrowserlessConfig(env: Env = getDefaultEnv()): BrowserlessConfig {
  const token = env.BROWSERLESS_API_TOKEN?.trim();
  if (!token) return { enabled: false, error: "BROWSERLESS_NOT_CONFIGURED" };

  const regionCandidate = env.BROWSERLESS_REGION ?? "sfo";
  const browserCandidate = env.BROWSERLESS_BROWSER ?? "chrome";

  const timeoutMs = Math.min(
    parsePositiveInt(env.BROWSERLESS_TIMEOUT_MS, 50_000),
    55_000
  );

  return {
    enabled: true,
    token,
    region: regionSet.has(regionCandidate)
      ? (regionCandidate as BrowserlessRegion)
      : "sfo",
    browser: browserSet.has(browserCandidate)
      ? (browserCandidate as BrowserlessBrowser)
      : "chrome",
    timeoutMs,
    useResidentialProxy: env.BROWSERLESS_USE_RESIDENTIAL_PROXY === "true",
    maxConcurrency: Math.min(
      parsePositiveInt(env.BROWSERLESS_MAX_CONCURRENCY, 2),
      2
    )
  };
}
