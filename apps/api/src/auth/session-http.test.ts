import { once } from "node:events";
import type { AddressInfo } from "node:net";

import { describe, expect, it } from "vitest";

import { startApiServer } from "../main.js";

const identity = { issuer: "https://issuer.test", subject: "user-123", audience: "comic-api" };

describe("auth session HTTP endpoints", () => {
  it("exchanges a verified authorization header and hydrates the same session after refresh", async () => {
    const server = startApiServer(0, {
      authSessionIssuer: async (authorization) => {
        expect(authorization).toBe("Bearer verified-access-token");
        return identity;
      },
    });
    await once(server, "listening");
    const port = (server.address() as AddressInfo).port;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      const anonymous = await fetch(`${baseUrl}/v1/auth/session`);
      await expect(anonymous.json()).resolves.toEqual({ user: null });

      const exchange = await fetch(`${baseUrl}/v1/auth/session`, {
        method: "POST",
        headers: { authorization: "Bearer verified-access-token" },
      });
      expect(exchange.status).toBe(200);
      expect(exchange.headers.get("set-cookie")).toContain("HttpOnly");
      const cookie = exchange.headers.get("set-cookie")!.split(";", 1)[0]!;

      const refreshed = await fetch(`${baseUrl}/v1/auth/session`, { headers: { cookie } });
      expect(refreshed.status).toBe(200);
      await expect(refreshed.json()).resolves.toEqual({ user: identity });

      const logout = await fetch(`${baseUrl}/v1/auth/logout`, { method: "POST", headers: { cookie } });
      expect(logout.headers.get("set-cookie")).toContain("Max-Age=0");

      const afterLogout = await fetch(`${baseUrl}/v1/auth/session`, { headers: { cookie } });
      await expect(afterLogout.json()).resolves.toEqual({ user: null });
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    }
  });

  it("does not create a session when no verified issuer is configured", async () => {
    const server = startApiServer(0);
    await once(server, "listening");
    const port = (server.address() as AddressInfo).port;

    try {
      const response = await fetch(`http://127.0.0.1:${port}/v1/auth/session`, {
        method: "POST",
        headers: { authorization: "Bearer unverified" },
      });
      expect(response.status).toBe(503);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    }
  });
});
