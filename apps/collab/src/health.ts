import { createServer } from "node:http";

export function buildCollabHealth(readiness: "ready" | "not_ready" = "ready") {
  return { status: "ok" as const, service: "collab", version: process.env["RELEASE_SHA"] ?? "test", readiness };
}

export function startCollabHealthServer(port = Number(process.env["HEALTH_PORT"] ?? 3102)) {
  const server = createServer((_req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(buildCollabHealth()));
  });
  server.listen(port, "127.0.0.1");
  return server;
}
