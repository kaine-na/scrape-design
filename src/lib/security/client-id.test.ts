import { describe, expect, it } from "vitest";
import { getClientIdentifier } from "./client-id";

function makeRequest(headers: Record<string, string>): Request {
  return new Request("https://example.com", { headers });
}

describe("getClientIdentifier", () => {
  it("prefers cf-connecting-ip over all others", () => {
    const request = makeRequest({
      "cf-connecting-ip": "1.1.1.1",
      "x-real-ip": "2.2.2.2",
      "x-forwarded-for": "3.3.3.3"
    });
    expect(getClientIdentifier(request)).toBe("1.1.1.1");
  });

  it("uses x-real-ip when cf-connecting-ip is absent", () => {
    const request = makeRequest({
      "x-real-ip": "2.2.2.2",
      "x-forwarded-for": "3.3.3.3"
    });
    expect(getClientIdentifier(request)).toBe("2.2.2.2");
  });

  it("falls back to first x-forwarded-for entry", () => {
    const request = makeRequest({
      "x-forwarded-for": "3.3.3.3, 4.4.4.4"
    });
    expect(getClientIdentifier(request)).toBe("3.3.3.3");
  });

  it("returns 'anonymous' when no identifying headers are present", () => {
    expect(getClientIdentifier(makeRequest({}))).toBe("anonymous");
  });

  it("trims whitespace from header values", () => {
    const request = makeRequest({ "cf-connecting-ip": "  1.1.1.1  " });
    expect(getClientIdentifier(request)).toBe("1.1.1.1");
  });
});
