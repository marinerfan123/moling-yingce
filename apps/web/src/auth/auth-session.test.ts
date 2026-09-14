import { describe, expect, it, vi } from "vitest";

import { AuthSessionClient, hydrateWebSession } from "./auth-session.js";

const user = { issuer: "https://issuer.test", subject: "user-123", audience: "comic-api" };

describe("AuthSessionClient", () => {
  it("hydrates a logged-in user with browser credentials", async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init).toMatchObject({ credentials: "include", method: "GET" });
      return new Response(JSON.stringify({ user }), { status: 200, headers: { "content-type": "application/json" } });
    });
    const client = new AuthSessionClient(fetcher, "/v1/auth");

    await expect(client.getSession()).resolves.toEqual({ user });
    expect(fetcher).toHaveBeenCalledWith("/v1/auth/session", expect.any(Object));
  });

  it("exchanges the in-memory access token and logs out through the cookie session", async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST" && new Headers(init.headers).get("authorization")) {
        expect(new Headers(init.headers).get("authorization")).toBe("Bearer access");
        return new Response(JSON.stringify({ user }), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    const client = new AuthSessionClient(fetcher);

    await expect(client.establish("access")).resolves.toEqual({ user });
    await expect(client.logout()).resolves.toEqual({ ok: true });
    expect(fetcher).toHaveBeenNthCalledWith(2, "/v1/auth/logout", expect.objectContaining({ credentials: "include" }));
  });

  it("hydrates an anonymous state when the server rejects the session request", async () => {
    const client = new AuthSessionClient(async () => new Response("", { status: 503 }));

    await expect(hydrateWebSession(client)).resolves.toEqual({ status: "anonymous", user: null });
  });
});
