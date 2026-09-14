import { describe, expect, it } from "vitest";
import { loadEnv } from "./env.js";

const baseEnv = {
  NODE_ENV: "test",
  APP_PROCESS_ROLE: "api",
  RELEASE_SHA: "test",
  IMAGE_DIGEST: "sha256:test",
  DATABASE_URL: "postgres://comic_api:test@127.0.0.1:5432/comic_canvas",
  REDIS_URL: "redis://127.0.0.1:6379",
  S3_ENDPOINT: "http://127.0.0.1:9000",
  S3_BUCKET: "comic-canvas-test",
  OIDC_ISSUER: "http://127.0.0.1:8080/realms/comic-canvas",
  PUBLIC_BASE_URL: "http://127.0.0.1:3000",
  INTERNAL_SERVICE_IDENTITY: "api.test.local",
  TRUSTED_PROXY_CIDRS: "127.0.0.1/32",
  TRUSTED_PROXY_HOPS: "1",
  CONTROLLED_EGRESS_ENDPOINT: "http://controlled-egress:8080",
  SAFE_FETCH_PROXY_ENDPOINT: "http://safe-fetch-proxy:8080",
  GENERATION_SUBMIT_KMS_KEY_ID: "kms-generation",
  WEBHOOK_VERIFICATION_KMS_KEY_ID: "kms-webhook",
  API_COLLAB_SESSION_PRIVATE_JWK_FILE: "/run/secrets/collab-session-private.jwk",
  MEDIA_IMAGE_DIGEST: "sha256:media",
  MEDIA_COMPILER_DIGEST: "sha256:compiler",
  BETA_ACCESS_MODE: "allowlist",
} satisfies NodeJS.ProcessEnv;

describe("loadEnv", () => {
  it("requires the database URL", () => {
    expect(() => loadEnv({ NODE_ENV: "test" })).toThrow(/DATABASE_URL/);
  });

  it("validates a commercial API runtime environment", () => {
    expect(loadEnv(baseEnv)).toMatchObject({
      NODE_ENV: "test",
      APP_PROCESS_ROLE: "api",
      BETA_ACCESS_MODE: "allowlist",
      TRUSTED_PROXY_HOPS: 1,
    });
  });

  it("requires distinct KMS key ids", () => {
    expect(() =>
      loadEnv({
        ...baseEnv,
        WEBHOOK_VERIFICATION_KMS_KEY_ID: "kms-generation",
      }),
    ).toThrow(/must differ/);
  });

  it("keeps dispatcher credentials narrow", () => {
    expect(() =>
      loadEnv({
        ...baseEnv,
        APP_PROCESS_ROLE: "dispatcher",
      }),
    ).toThrow(/Dispatcher must not receive/);
  });
});
