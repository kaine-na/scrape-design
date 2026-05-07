import { describe, expect, it } from "vitest";
import { validatePublicHttpUrl } from "./url-validation";

describe("validatePublicHttpUrl", () => {
  it("accepts public http and https URLs", () => {
    expect(validatePublicHttpUrl("https://example.com/path").ok).toBe(true);
    expect(validatePublicHttpUrl("http://example.com").ok).toBe(true);
  });

  it("rejects unsupported schemes", () => {
    expect(validatePublicHttpUrl("file:///etc/passwd").ok).toBe(false);
    expect(validatePublicHttpUrl("ftp://example.com").ok).toBe(false);
  });

  it("rejects localhost and private hosts", () => {
    expect(validatePublicHttpUrl("http://localhost:3000").ok).toBe(false);
    expect(validatePublicHttpUrl("http://127.0.0.1:3000").ok).toBe(false);
    expect(validatePublicHttpUrl("http://10.0.0.1").ok).toBe(false);
    expect(validatePublicHttpUrl("http://192.168.1.1").ok).toBe(false);
    expect(validatePublicHttpUrl("http://169.254.169.254").ok).toBe(false);
  });

  it("rejects private and local IPv6 hosts", () => {
    expect(validatePublicHttpUrl("http://[::1]/").ok).toBe(false);
    expect(validatePublicHttpUrl("http://[fc00::1]/").ok).toBe(false);
    expect(validatePublicHttpUrl("http://[fe80::1]/").ok).toBe(false);
    expect(validatePublicHttpUrl("http://[::ffff:127.0.0.1]/").ok).toBe(false);
  });

  it("normalizes missing protocol to https", () => {
    const result = validatePublicHttpUrl("example.com");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.url).toBe("https://example.com/");
  });
});
