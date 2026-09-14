import { describe, expect, it } from "vitest";
import { isRawBodyWebhookPath, normalizeForwardedHeaders } from "./http-boundary.js";

describe("http boundary", () => {
  it("strips forwarded headers when no trusted proxy hop exists", () => {
    expect(normalizeForwardedHeaders({ "x-forwarded-for": "1.2.3.4" }, 0)).toEqual({});
  });

  it("keeps provider webhook raw-body path explicit", () => {
    expect(isRawBodyWebhookPath("/v1/webhooks/provider")).toBe(true);
    expect(isRawBodyWebhookPath("/v1/projects")).toBe(false);
  });
});
