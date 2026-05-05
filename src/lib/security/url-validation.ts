type ValidationResult =
  | { ok: true; url: string; hostname: string }
  | { ok: false; error: string };

const blockedHostnames = new Set(["localhost", "0.0.0.0"]);

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

  if (isPrivateIpv4(hostname)) {
    return { ok: false, error: "Private network URLs cannot be analyzed." };
  }

  return { ok: true, url: url.toString(), hostname };
}
