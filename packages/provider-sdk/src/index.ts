export const packageName = "@comic-canvas/provider-sdk";

export * from "./adapter.js";
export * from "./contract-suite.js";
export * from "./generation-credential-resolver.js";
export * from "./types.js";
export * from "./webhook-secret-resolver.js";
export * from "./webhook-verifier.js";

export function bootstrap() {
  return { packageName };
}
