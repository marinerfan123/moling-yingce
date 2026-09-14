import { createServer } from "node:http";

import { HealthController } from "./health.controller.js";
import { apiSecurityPolicies } from "./app.module.js";
import { isRawBodyWebhookPath, readBoundedRawBody } from "./platform/http-boundary.js";
import type { ProviderWebhookController } from "./providers/provider-webhook.controller.js";

export type ApiProductionDependencies = Readonly<{
  providerWebhook?: ProviderWebhookController;
  replayStore?: object;
  routeStore?: object;
  kmsResolver?: object;
}>;
export function assertApiProductionDependencies(
  dependencies: ApiProductionDependencies,
): asserts dependencies is Required<ApiProductionDependencies> {
  if (
    !dependencies.providerWebhook ||
    !dependencies.replayStore ||
    !dependencies.routeStore ||
    !dependencies.kmsResolver
  )
    throw new Error("API_WEBHOOK_DEPENDENCIES_REQUIRED");
}

export function startApiServer(port = Number(process.env["PORT"] ?? 3001), options: ApiProductionDependencies = {}) {
  if (process.env["NODE_ENV"] === "production") assertApiProductionDependencies(options);
  const controller = new HealthController(process.env["RELEASE_SHA"] ?? "local-dev");
  const server = createServer(async (req, res) => {
    if (req.url === "/health") {
      res.setHeader("content-security-policy", apiSecurityPolicies.csp);
      res.setHeader("x-content-type-options", "nosniff");
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(controller.getHealth()));
      return;
    }
    const match = /^\/v1\/webhooks\/provider\/([^/]+)\/([^/]+)$/.exec(req.url ?? "");
    if (req.method === "POST" && match && isRawBodyWebhookPath("/v1/webhooks/provider")) {
      if (!options.providerWebhook) {
        res.writeHead(503);
        res.end();
        return;
      }
      try {
        const rawBody = await readBoundedRawBody(req);
        const headers = Object.fromEntries(
          Object.entries(req.headers).flatMap(([key, value]) => (typeof value === "string" ? [[key, value]] : [])),
        );
        await options.providerWebhook.receive({ providerKey: match[1]!, routeToken: match[2]!, rawBody, headers });
        res.writeHead(202);
        res.end();
      } catch {
        res.writeHead(400);
        res.end();
      }
      return;
    }
    res.writeHead(404);
    res.end();
  });
  server.listen(port, "0.0.0.0");
  return server;
}

if (process.env["COMIC_CANVAS_BOOT"] === "api") {
  startApiServer();
}
