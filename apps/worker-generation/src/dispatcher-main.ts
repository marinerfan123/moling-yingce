import { createServer } from "node:http";

const forbiddenDispatcherEnv = [
  "GENERATION_SUBMIT_KMS_KEY_ID",
  "WEBHOOK_VERIFICATION_KMS_KEY_ID",
  "API_COLLAB_SESSION_PRIVATE_JWK_FILE",
];

export function assertDispatcherEnvironment(env: NodeJS.ProcessEnv = process.env) {
  const present = forbiddenDispatcherEnv.filter((key) => Boolean(env[key]));
  if (present.length > 0) throw new Error(`DISPATCHER_FORBIDDEN_CREDENTIALS:${present.join(",")}`);
  return true;
}

export function startDispatcher(port = Number(process.env["HEALTH_PORT"] ?? 3103)) {
  assertDispatcherEnvironment();
  const server = createServer((_req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        status: "ok",
        service: "dispatcher",
        version: process.env["RELEASE_SHA"] ?? "test",
        readiness: "ready",
      }),
    );
  });
  server.listen(port, "127.0.0.1");
  return server;
}

if (process.env["COMIC_CANVAS_BOOT"] === "dispatcher") {
  startDispatcher();
}
