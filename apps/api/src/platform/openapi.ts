export type OpenApiDocument = {
  openapi: "3.1.0";
  info: { title: string; version: string };
  paths: Record<string, unknown>;
  components: { schemas: Record<string, unknown> };
};

export function buildOpenApiDocument(_app: unknown): OpenApiDocument {
  return {
    openapi: "3.1.0",
    info: {
      title: "Comic Canvas API",
      version: process.env["RELEASE_SHA"] ?? "local-dev",
    },
    paths: {},
    components: {
      schemas: {
        ApiErrorEnvelope: {
          type: "object",
          required: ["error", "traceId"],
        },
      },
    },
  };
}
