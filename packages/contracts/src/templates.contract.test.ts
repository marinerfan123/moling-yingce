import { describe, expect, it } from "vitest";

import { CanvasTemplateSchema, TemplateChecksumSchema, TemplateVersionSchema } from "./index.js";

describe("template contracts", () => {
  it("freezes semantic template metadata and rejects mutable execution fields", () => {
    expect(TemplateVersionSchema.parse("1.0.0")).toBe("1.0.0");
    expect(TemplateChecksumSchema.parse("a".repeat(64))).toHaveLength(64);
    expect(() => TemplateVersionSchema.parse("latest")).toThrow();
    expect(() =>
      CanvasTemplateSchema.parse({
        templateId: "vertical-comic",
        version: "1.0.0",
        checksum: "a".repeat(64),
        name: "Vertical comic",
        nodes: [],
        edges: [],
        capabilities: ["generation:spend"],
        createsJobs: true,
      }),
    ).toThrow();
  });
});
