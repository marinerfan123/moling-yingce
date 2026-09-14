import { describe, expect, it } from "vitest";
import { buildOpenApiDocument } from "./openapi.js";

describe("OpenAPI builder", () => {
  it("builds a valid empty OpenAPI 3 document", () => {
    expect(buildOpenApiDocument({})).toMatchObject({
      openapi: "3.1.0",
      info: { title: "Comic Canvas API" },
      paths: {},
    });
  });
});
