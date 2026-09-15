import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import { HealthController } from "./health.controller.js";
import { apiSecurityPolicies } from "./app.module.js";
import { createEnvironmentAuthSessionIssuer } from "./auth/oidc-session-issuer.js";
import {
  clearSessionCookieHeader,
  InMemoryAuthSessionStore,
  readSessionCookie,
  setSessionCookieHeader,
  type AuthSessionIdentity,
  type AuthSessionStore,
} from "./auth/session.js";
import { isRawBodyWebhookPath, readBoundedRawBody } from "./platform/http-boundary.js";
import { ProjectsController } from "./projects/projects.controller.js";
import type { ProviderWebhookController } from "./providers/provider-webhook.controller.js";
import { TemplatesController } from "./templates/templates.controller.js";

export type AuthSessionIssuer = (authorizationHeader: string) => Promise<AuthSessionIdentity>;

export type ApiProductionDependencies = Readonly<{
  providerWebhook?: ProviderWebhookController;
  replayStore?: object;
  routeStore?: object;
  kmsResolver?: object;
  authSessionStore?: AuthSessionStore;
  authSessionIssuer?: AuthSessionIssuer;
  projectsController?: ProjectsController;
  templatesController?: TemplatesController;
  runtimeProfile?: "reference" | "full";
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
  const controller = new HealthController(
    process.env["RELEASE_SHA"] ?? "local-dev",
    options.runtimeProfile === "reference" ? () => "not_ready" : () => "ready",
  );
  const authSessionStore = options.authSessionStore ?? new InMemoryAuthSessionStore();
  const authSessionIssuer = options.authSessionIssuer ?? createEnvironmentAuthSessionIssuer();
  if (process.env["NODE_ENV"] === "production" && !authSessionIssuer) throw new Error("AUTH_SESSION_ISSUER_REQUIRED");
  const server = createServer(async (req, res) => {
    const path = new URL(req.url ?? "/", "http://localhost").pathname;
    if (path === "/v1/auth/session") {
      await handleAuthSession(req, res, authSessionStore, authSessionIssuer);
      return;
    }
    if (path === "/v1/auth/logout" && req.method === "POST") {
      const sessionId = readSessionCookie(req.headers.cookie);
      if (sessionId) authSessionStore.revoke(sessionId);
      res.setHeader("set-cookie", clearSessionCookieHeader({ secure: isSecureRequest(req) }));
      sendJson(res, 200, { ok: true });
      return;
    }
    if (path === "/v1/templates" && req.method === "GET" && options.templatesController) {
      sendJson(res, 200, { templates: options.templatesController.list() });
      return;
    }
    if (path === "/v1/projects" && options.projectsController) {
      const identity = readSessionIdentity(req, authSessionStore);
      if (!identity) {
        sendJson(res, 401, { error: "AUTHENTICATION_REQUIRED" });
        return;
      }
      const principal = { tenantId: "reference-tenant", userId: identity.subject };
      if (req.method === "GET") {
        sendJson(res, 200, { projects: options.projectsController.listForUser(principal) });
        return;
      }
      if (req.method === "POST") {
        try {
          const input = JSON.parse(new TextDecoder().decode(await readBoundedRawBody(req))) as {
            title?: unknown;
            firstEpisodeTitle?: unknown;
          };
          if (typeof input.title !== "string" || !input.title.trim()) throw new Error("PROJECT_TITLE_REQUIRED");
          const firstEpisodeTitle =
            typeof input.firstEpisodeTitle === "string" && input.firstEpisodeTitle.trim()
              ? input.firstEpisodeTitle
              : undefined;
          sendJson(res, 201, {
            project: options.projectsController.create(principal, {
              title: input.title,
              ...(firstEpisodeTitle ? { firstEpisodeTitle } : {}),
            }),
          });
        } catch (error) {
          sendJson(res, 400, { error: error instanceof Error ? error.message : "PROJECT_BODY_INVALID" });
        }
        return;
      }
      sendJson(res, 405, { error: "METHOD_NOT_ALLOWED" });
      return;
    }
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

async function handleAuthSession(
  req: IncomingMessage,
  res: ServerResponse,
  store: AuthSessionStore,
  issuer?: AuthSessionIssuer,
) {
  if (req.method === "GET") {
    const sessionId = readSessionCookie(req.headers.cookie);
    const user = sessionId ? store.read(sessionId) : null;
    sendJson(res, 200, { user });
    return;
  }
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "METHOD_NOT_ALLOWED" });
    return;
  }
  if (!issuer) {
    sendJson(res, 503, { error: "AUTH_SESSION_ISSUER_UNAVAILABLE" });
    return;
  }
  const authorization = req.headers.authorization;
  if (!authorization?.startsWith("Bearer ")) {
    sendJson(res, 401, { error: "AUTHORIZATION_REQUIRED" });
    return;
  }
  try {
    const identity = await issuer(authorization);
    const sessionId = store.create(identity);
    res.setHeader("set-cookie", setSessionCookieHeader(sessionId, { secure: isSecureRequest(req) }));
    sendJson(res, 200, { user: identity });
  } catch {
    sendJson(res, 401, { error: "AUTH_SESSION_INVALID" });
  }
}

function isSecureRequest(req: IncomingMessage) {
  const forwardedProto = req.headers["x-forwarded-proto"];
  const proto = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto;
  return (
    Boolean((req.socket as { encrypted?: boolean }).encrypted) ||
    proto?.split(",", 1)[0]?.trim().toLowerCase() === "https"
  );
}

function sendJson(
  res: { setHeader(name: string, value: string): void; writeHead(status: number): void; end(body: string): void },
  status: number,
  body: unknown,
) {
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.writeHead(status);
  res.end(JSON.stringify(body));
}

if (process.env["COMIC_CANVAS_BOOT"] === "api") {
  if (process.env["NODE_ENV"] === "production") {
    const { createProductionApiDependencies } = await import("./production-bootstrap.js");
    startApiServer(undefined, createProductionApiDependencies());
  } else startApiServer();
}

function readSessionIdentity(req: IncomingMessage, store: AuthSessionStore): AuthSessionIdentity | null {
  const sessionId = readSessionCookie(req.headers.cookie);
  return sessionId ? store.read(sessionId) : null;
}
