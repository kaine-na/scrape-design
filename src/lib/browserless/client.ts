import type { BrowserlessBrowser, BrowserlessRegion } from "./config";

export type BrowserlessErrorCode =
  | "BROWSERLESS_TIMEOUT"
  | "BROWSERLESS_QUOTA_OR_CONCURRENCY"
  | "BROWSERLESS_REQUEST_FAILED";

const regionHosts: Record<BrowserlessRegion, string> = {
  sfo: "production-sfo.browserless.io",
  lon: "production-lon.browserless.io",
  ams: "production-ams.browserless.io"
};

export function buildBrowserlessEndpoint(input: {
  token: string;
  region: BrowserlessRegion;
  browser: BrowserlessBrowser;
}) {
  const host = regionHosts[input.region];
  const endpoint = new URL(`https://${host}/${input.browser}/bql`);
  endpoint.searchParams.set("token", input.token);
  return endpoint;
}

export function mapBrowserlessError(
  status: number,
  message: string
): BrowserlessErrorCode {
  const lower = message.toLowerCase();
  if (status === 408 || status === 504 || lower.includes("timeout")) {
    return "BROWSERLESS_TIMEOUT";
  }
  if (
    status === 402 ||
    status === 409 ||
    status === 429 ||
    lower.includes("quota") ||
    lower.includes("concurrent")
  ) {
    return "BROWSERLESS_QUOTA_OR_CONCURRENCY";
  }
  return "BROWSERLESS_REQUEST_FAILED";
}
