type ValidationResult =
  | { ok: true; url: string; hostname: string }
  | { ok: false; error: string };

type DnsQuestionType = "A" | "AAAA";

type DnsAnswer = {
  data?: unknown;
};

type DnsResponse = {
  Answer?: DnsAnswer[];
};

const blockedHostnames = new Set(["localhost", "0.0.0.0"]);

function normalizeIpv6Hostname(hostname: string): string | null {
  if (!hostname.includes(":")) return null;
  return hostname.startsWith("[") && hostname.endsWith("]")
    ? hostname.slice(1, -1)
    : hostname;
}

function parseIpv4(hostname: string): number[] | null {
  const parts = hostname.split(".");
  if (parts.length !== 4) return null;

  const nums = parts.map((part) => Number(part));
  if (nums.some((num) => !Number.isInteger(num) || num < 0 || num > 255)) {
    return null;
  }

  return nums;
}

function isPrivateIpv4(hostname: string): boolean {
  const ip = parseIpv4(hostname);
  if (!ip) return false;
  return isPrivateIpv4Parts(ip);
}

function isLiteralIp(hostname: string): boolean {
  return parseIpv4(hostname) !== null || parseIpv6(hostname) !== null;
}

function isPrivateIpv4Parts(ip: number[]): boolean {
  const [a, b] = ip;

  return (
    a === 10 ||
    a === 127 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254) ||
    a === 0
  );
}

function parseIpv6(hostname: string): number[] | null {
  const normalized = normalizeIpv6Hostname(hostname);
  if (!normalized) return null;

  const sides = normalized.split("::");
  if (sides.length > 2) return null;

  const parseSide = (side: string): number[] | null => {
    if (!side) return [];
    const parts = side.split(":");
    const nums = parts.map((part) => parseInt(part, 16));
    if (
      parts.some((part) => !/^[\da-f]{1,4}$/i.test(part)) ||
      nums.some((num) => !Number.isInteger(num) || num < 0 || num > 0xffff)
    ) {
      return null;
    }
    return nums;
  };

  const left = parseSide(sides[0]);
  const right = parseSide(sides[1] ?? "");
  if (!left || !right) return null;

  if (sides.length === 1) {
    return left.length === 8 ? left : null;
  }

  const missing = 8 - left.length - right.length;
  if (missing < 1) return null;
  return [...left, ...Array<number>(missing).fill(0), ...right];
}

function isPrivateIpv6(hostname: string): boolean {
  const ip = parseIpv6(hostname);
  if (!ip) return false;

  const isUnspecified = ip.every((part) => part === 0);
  const isLoopback = ip.slice(0, 7).every((part) => part === 0) && ip[7] === 1;
  const isUniqueLocal = (ip[0] & 0xfe00) === 0xfc00;
  const isLinkLocal = (ip[0] & 0xffc0) === 0xfe80;
  const isIpv4Mapped =
    ip.slice(0, 5).every((part) => part === 0) && ip[5] === 0xffff;

  if (isIpv4Mapped) {
    return isPrivateIpv4Parts([
      ip[6] >> 8,
      ip[6] & 0xff,
      ip[7] >> 8,
      ip[7] & 0xff
    ]);
  }

  return isUnspecified || isLoopback || isUniqueLocal || isLinkLocal;
}

async function resolveDnsOverHttps(hostname: string, type: DnsQuestionType) {
  const response = await fetch(
    `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(hostname)}&type=${type}`,
    { headers: { Accept: "application/dns-json" } }
  );

  if (!response.ok) throw new Error("DNS preflight failed");

  const payload = (await response.json()) as DnsResponse;
  return (payload.Answer ?? [])
    .map((answer) => answer.data)
    .filter((data): data is string => typeof data === "string");
}

export async function preflightPublicHostnameDns(hostname: string): Promise<ValidationResult> {
  const normalized = hostname.toLowerCase();
  if (isLiteralIp(normalized)) return { ok: true, url: "", hostname: normalized };

  let answers: string[];
  try {
    const [ipv4Answers, ipv6Answers] = await Promise.all([
      resolveDnsOverHttps(normalized, "A"),
      resolveDnsOverHttps(normalized, "AAAA")
    ]);
    answers = [...ipv4Answers, ...ipv6Answers];
  } catch {
    return {
      ok: false,
      error: "Could not verify that this URL resolves to a public address."
    };
  }

  if (answers.length === 0) {
    return {
      ok: false,
      error: "Could not verify that this URL resolves to a public address."
    };
  }

  if (answers.some((answer) => isPrivateIpv4(answer) || isPrivateIpv6(answer))) {
    return { ok: false, error: "Private network URLs cannot be analyzed." };
  }

  return { ok: true, url: "", hostname: normalized };
}

export function validatePublicHttpUrl(input: string): ValidationResult {
  const trimmed = input.trim();
  if (!trimmed) return { ok: false, error: "Please enter a URL." };

  const candidate = /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return { ok: false, error: "Please enter a valid public website URL." };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, error: "Only public HTTP and HTTPS URLs are supported." };
  }

  const hostname = url.hostname.toLowerCase();
  if (blockedHostnames.has(hostname) || hostname.endsWith(".localhost")) {
    return { ok: false, error: "Local URLs cannot be analyzed." };
  }

  if (isPrivateIpv4(hostname) || isPrivateIpv6(hostname)) {
    return { ok: false, error: "Private network URLs cannot be analyzed." };
  }

  return { ok: true, url: url.toString(), hostname };
}
