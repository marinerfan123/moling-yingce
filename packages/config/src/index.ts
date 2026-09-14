export const packageName = "@comic-canvas/config";

export function bootstrap() {
  return { packageName };
}

export { buildHealthResponse, createLoopbackHealthServer, probeLoopbackHealth } from "./loopback-health-probe.js";
export { loadEnv } from "./env.js";
export type { AppEnv, AppProcessRole, BetaAccessMode, HealthResponse } from "./env.js";
