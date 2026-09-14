import { describe, expect, it } from "vitest";

import { isGlobalUnicastIp, safeFetchToQuarantine, validateSafeFetchRequest } from "./safe-fetch.js";

const base = {
  url: "https://cdn.example.com/input.png",
  maxBytes: 10_000,
  timeoutMs: 5_000,
  resolvedAddresses: [{ address: "93.184.216.34", family: 4 as const }],
  caller: "media-worker" as const,
};

describe("safe fetch", () => {
  it("accepts only globally routable unicast IP addresses", () => {
    for (const address of [
      "0.0.0.0",
      "10.0.0.1",
      "100.64.0.1",
      "127.0.0.1",
      "169.254.1.1",
      "172.16.0.1",
      "192.0.2.1",
      "192.168.1.1",
      "198.18.0.1",
      "198.51.100.1",
      "203.0.113.1",
      "224.0.0.1",
      "240.0.0.1",
      "::",
      "::1",
      "fe80::1",
      "fc00::1",
      "ff02::1",
      "2001:db8::1",
      "2001:2::1",
      "::ffff:192.168.1.1",
      "::ffff:198.51.100.1",
    ]) {
      expect(isGlobalUnicastIp(address), address).toBe(false);
    }
    expect(isGlobalUnicastIp("93.184.216.34")).toBe(true);
    expect(isGlobalUnicastIp("2606:2800:220:1:248:1893:25c8:1946")).toBe(true);
  });

  it("matches IPv6 special-purpose prefixes by their network bits", () => {
    const cases: readonly [address: string, global: boolean][] = [
      ["0100::", false],
      ["0100:0:0:1::", false],
      ["2001:0002::", false],
      ["2001:0010::", false],
      ["2001:0020::", false],
      ["2001:0db8::", false],
      ["3fff::", false],
      ["64:ff9b:1::", false],
      ["2001:4860:4860::8888", true],
    ];
    for (const [address, global] of cases) expect(isGlobalUnicastIp(address), address).toBe(global);
  });

  it("allows HTTPS public-address media-worker requests and pins the resolved IP", async () => {
    const result = await safeFetchToQuarantine(base, async (accepted) => ({
      bytes: accepted.maxBytes - 1,
      sha256: `sha256:${"d".repeat(64)}`,
    }));
    expect(result).toMatchObject({ allow: true, pinnedIp: "93.184.216.34" });
  });

  it("pins the final redirect address and verifies the redirected hostname for TLS", () => {
    expect(
      validateSafeFetchRequest({
        ...base,
        redirects: [
          { url: "https://cdn-final.example.com/file", resolvedAddresses: [{ address: "93.184.216.35", family: 4 }] },
        ],
      }),
    ).toMatchObject({ allow: true, pinnedIp: "93.184.216.35", tlsServerName: "cdn-final.example.com" });
    expect(
      validateSafeFetchRequest({
        ...base,
        redirects: [
          {
            url: "https://cdn-final.example.com/file",
            tlsServerName: "wrong.example.com",
            resolvedAddresses: [{ address: "93.184.216.35", family: 4 }],
          },
        ],
      }),
    ).toEqual({ allow: false, reason: "SAFE_FETCH_TLS_HOST_MISMATCH" });
  });

  it("rejects private, loopback, metadata and non-HTTP targets", () => {
    expect(validateSafeFetchRequest({ ...base, resolvedAddresses: [{ address: "127.0.0.1", family: 4 }] })).toEqual({
      allow: false,
      reason: "SAFE_FETCH_NO_PUBLIC_ADDRESS",
    });
    expect(
      validateSafeFetchRequest({ ...base, resolvedAddresses: [{ address: "169.254.169.254", family: 4 }] }).allow,
    ).toBe(false);
    expect(validateSafeFetchRequest({ ...base, url: "file:///etc/passwd" })).toEqual({
      allow: false,
      reason: "SAFE_FETCH_NON_HTTPS_PROTOCOL",
    });
  });

  it("rejects DNS rebinding, unsafe redirects, caller misuse, TLS mismatch and oversized responses", () => {
    expect(
      validateSafeFetchRequest({
        ...base,
        resolvedAddresses: [
          { address: "93.184.216.34", family: 4 },
          { address: "10.0.0.1", family: 4 },
        ],
      }),
    ).toEqual({ allow: false, reason: "SAFE_FETCH_PRIVATE_ADDRESS" });
    expect(
      validateSafeFetchRequest({
        ...base,
        redirects: [
          { url: "https://internal.example.com/file", resolvedAddresses: [{ address: "192.168.1.5", family: 4 }] },
        ],
      }),
    ).toEqual({ allow: false, reason: "SAFE_FETCH_REDIRECT_PRIVATE_ADDRESS" });
    expect(validateSafeFetchRequest({ ...base, caller: "api" })).toEqual({
      allow: false,
      reason: "SAFE_FETCH_MEDIA_WORKER_ONLY",
    });
    expect(validateSafeFetchRequest({ ...base, tlsServerName: "evil.example.com" })).toEqual({
      allow: false,
      reason: "SAFE_FETCH_TLS_HOST_MISMATCH",
    });
    expect(validateSafeFetchRequest({ ...base, responseBytes: 20_000 })).toEqual({
      allow: false,
      reason: "SAFE_FETCH_RESPONSE_TOO_LARGE",
    });
  });
});
