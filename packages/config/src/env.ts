import { z } from "zod";

export type AppProcessRole =
  | "web"
  | "api"
  | "collab"
  | "dispatcher"
  | "worker-generation"
  | "worker-media"
  | "migrator";

export type BetaAccessMode = "off" | "allowlist" | "open";

export type HealthResponse = {
  status: "ok";
  service: string;
  version: string;
  readiness: "ready" | "not_ready";
};

const urlSchema = z.string().url();

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "staging", "production"]).default("development"),
    APP_PROCESS_ROLE: z
      .enum(["web", "api", "collab", "dispatcher", "worker-generation", "worker-media", "migrator"])
      .default("api"),
    RELEASE_SHA: z.string().min(1).default("local-dev"),
    IMAGE_DIGEST: z.string().min(1).default("local-image"),
    DATABASE_URL: z.string().min(1),
    REDIS_URL: urlSchema,
    S3_ENDPOINT: urlSchema,
    S3_BUCKET: z.string().min(1).default("comic-canvas-dev"),
    OIDC_ISSUER: urlSchema,
    PUBLIC_BASE_URL: urlSchema.default("http://localhost:3000"),
    INTERNAL_SERVICE_IDENTITY: z.string().min(1).default("local-dev"),
    TRUSTED_PROXY_CIDRS: z.string().min(1).default("127.0.0.1/32"),
    TRUSTED_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(1),
    CONTROLLED_EGRESS_ENDPOINT: urlSchema.default("http://controlled-egress:8080"),
    SAFE_FETCH_PROXY_ENDPOINT: urlSchema.default("http://safe-fetch-proxy:8080"),
    GENERATION_SUBMIT_KMS_KEY_ID: z.string().min(1).default("kms-local-generation-submit"),
    WEBHOOK_VERIFICATION_KMS_KEY_ID: z.string().min(1).default("kms-local-webhook-verification"),
    API_COLLAB_SESSION_PRIVATE_JWK_FILE: z.string().min(1).optional(),
    COLLAB_PUBLIC_JWKS_FILE: z.string().min(1).optional(),
    MEDIA_IMAGE_DIGEST: z.string().min(1).default("local-media-image"),
    MEDIA_COMPILER_DIGEST: z.string().min(1).default("local-media-compiler"),
    BETA_ACCESS_MODE: z.enum(["off", "allowlist", "open"]).default("off"),
  })
  .superRefine((value, ctx) => {
    if (value.GENERATION_SUBMIT_KMS_KEY_ID === value.WEBHOOK_VERIFICATION_KMS_KEY_ID) {
      ctx.addIssue({
        code: "custom",
        path: ["WEBHOOK_VERIFICATION_KMS_KEY_ID"],
        message: "WEBHOOK_VERIFICATION_KMS_KEY_ID must differ from GENERATION_SUBMIT_KMS_KEY_ID",
      });
    }
    if (value.APP_PROCESS_ROLE === "api" && !value.API_COLLAB_SESSION_PRIVATE_JWK_FILE) {
      ctx.addIssue({
        code: "custom",
        path: ["API_COLLAB_SESSION_PRIVATE_JWK_FILE"],
        message: "API requires API_COLLAB_SESSION_PRIVATE_JWK_FILE",
      });
    }
    if (value.APP_PROCESS_ROLE === "collab" && !value.COLLAB_PUBLIC_JWKS_FILE) {
      ctx.addIssue({
        code: "custom",
        path: ["COLLAB_PUBLIC_JWKS_FILE"],
        message: "Collab requires COLLAB_PUBLIC_JWKS_FILE",
      });
    }
    if (value.APP_PROCESS_ROLE === "dispatcher") {
      const forbidden = ["GENERATION_SUBMIT_KMS_KEY_ID", "WEBHOOK_VERIFICATION_KMS_KEY_ID"] as const;
      for (const key of forbidden) {
        if (value[key] !== envSchemaDefaults[key]) {
          ctx.addIssue({
            code: "custom",
            path: [key],
            message: "Dispatcher must not receive provider, KMS or API credentials",
          });
        }
      }
    }
  });

const envSchemaDefaults = {
  GENERATION_SUBMIT_KMS_KEY_ID: "kms-local-generation-submit",
  WEBHOOK_VERIFICATION_KMS_KEY_ID: "kms-local-webhook-verification",
};

export type AppEnv = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv): AppEnv {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
    throw new Error(`Invalid application environment: ${details}`);
  }
  return parsed.data;
}
