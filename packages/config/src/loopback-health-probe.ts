import { createServer, request } from "node:http";

import type { AddressInfo } from "node:net";
import type { HealthResponse } from "./env.js";

export function buildHealthResponse(
  service: string,
  version: string,
  readiness: "ready" | "not_ready" = "ready",
): HealthResponse {
  return { status: "ok", service, version, readiness };
}

export function createLoopbackHealthServer(options: {
  service: string;
  version: string;
  readiness?: () => Promise<"ready" | "not_ready"> | "ready" | "not_ready";
}) {
  return createServer(async (_req, res) => {
    const readiness = options.readiness ? await options.readiness() : "ready";
    const body = JSON.stringify(buildHealthResponse(options.service, options.version, readiness));
    res.writeHead(200, { "content-type": "application/json" });
    res.end(body);
  });
}

export async function probeLoopbackHealth(port: number): Promise<HealthResponse> {
  return new Promise((resolve, reject) => {
    const req = request({ hostname: "127.0.0.1", port, path: "/health", method: "GET" }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        body += chunk;
      });
      res.on("end", () => {
        try {
          resolve(JSON.parse(body) as HealthResponse);
        } catch (error) {
          reject(error);
        }
      });
    });
    req.on("error", reject);
    req.end();
  });
}

export async function listenOnLoopback(server: ReturnType<typeof createLoopbackHealthServer>, port = 0) {
  await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve));
  return (server.address() as AddressInfo).port;
}

if (process.argv[1]?.endsWith("loopback-health-probe.js") && process.argv[2]) {
  const port = Number(process.argv[2]);
  probeLoopbackHealth(port)
    .then((health) => {
      process.stdout.write(JSON.stringify(health));
      process.exit(health.status === "ok" ? 0 : 1);
    })
    .catch(() => process.exit(1));
}
