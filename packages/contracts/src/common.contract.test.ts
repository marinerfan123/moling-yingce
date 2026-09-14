import { describe, expect, it } from "vitest";

import {
  ApiErrorEnvelopeSchema,
  CapabilitySchema,
  EventIdSchema,
  MoneyMicrosSchema,
  ProjectEventSchema,
  ProjectIdSchema,
  TenantIdSchema,
  capabilities,
} from "./index.js";

describe("common platform contracts", () => {
  it("validates money micros as non-negative decimal strings", () => {
    expect(MoneyMicrosSchema.parse("1200000")).toBe("1200000");
    expect(() => MoneyMicrosSchema.parse(1.2)).toThrow();
    expect(() => MoneyMicrosSchema.parse("-1")).toThrow();
  });

  it("rejects empty and cross-kind opaque IDs", () => {
    expect(TenantIdSchema.parse("tenant_12345678")).toBe("tenant_12345678");
    expect(() => TenantIdSchema.parse("")).toThrow();
    expect(() => ProjectIdSchema.parse("tenant_12345678")).toThrow();
  });

  it("keeps the exact 20 capability set", () => {
    expect(capabilities).toHaveLength(20);
    expect(CapabilitySchema.options).toEqual(capabilities);
    expect(CapabilitySchema.parse("rights:manage")).toBe("rights:manage");
  });

  it("requires stable error codes and trace ids", () => {
    expect(
      ApiErrorEnvelopeSchema.parse({
        error: { code: "PROJECT_NOT_FOUND", message: "Missing project" },
        traceId: "trace_12345678",
      }),
    ).toMatchObject({ error: { code: "PROJECT_NOT_FOUND" } });
    expect(() =>
      ApiErrorEnvelopeSchema.parse({ error: { code: "oops", message: "x" }, traceId: "trace_12345678" }),
    ).toThrow();
  });

  it("validates project event envelopes without merging job sequence into event id", () => {
    expect(
      ProjectEventSchema.parse({
        projectId: "project_12345678",
        eventId: "event_12345678",
        jobSequence: 7,
        occurredAt: "2026-08-24T00:00:00.000Z",
        type: "project.created",
        data: { ok: true },
      }),
    ).toMatchObject({ jobSequence: 7 });
    expect(() =>
      ProjectEventSchema.parse({
        projectId: "project_12345678",
        eventId: "project_12345678",
        occurredAt: "2026-08-24T00:00:00.000Z",
        type: "x",
        data: {},
      }),
    ).toThrow();
    expect(EventIdSchema.safeParse("event_12345678").success).toBe(true);
  });
});
