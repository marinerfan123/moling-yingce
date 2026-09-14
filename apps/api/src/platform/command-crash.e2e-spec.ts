import { describe, expect, it } from "vitest";
import { ApiErrorFilter } from "./api-error.filter.js";

describe("command crash envelope", () => {
  it("does not leak provider details", () => {
    expect(new ApiErrorFilter().toEnvelope(new Error("provider secret stack"), "trace_12345678")).toEqual({
      error: { code: "INTERNAL_ERROR", message: "Internal error" },
      traceId: "trace_12345678",
    });
  });
});
