import { describe, expect, it } from "vitest";

import {
  AUTH_SESSION_COOKIE_NAME,
  InMemoryAuthSessionStore,
  clearSessionCookieHeader,
  readSessionCookie,
  setSessionCookieHeader,
} from "./session.js";

const identity = { issuer: "https://issuer.test", subject: "user-123", audience: "comic-api" };

describe("auth session", () => {
  it("keeps an opaque session alive across a browser refresh", () => {
    const store = new InMemoryAuthSessionStore({ ttlSeconds: 30 * 24 * 60 * 60 });
    const sessionId = store.create(identity, 1_000);

    expect(sessionId).not.toContain("user-123");
    expect(store.read(sessionId, 1_000 + 86_400)).toEqual(identity);
    expect(store.read(sessionId, 1_000 + 30 * 24 * 60 * 60)).toBeNull();
  });

  it("revokes a session immediately", () => {
    const store = new InMemoryAuthSessionStore();
    const sessionId = store.create(identity, 1_000);
    store.revoke(sessionId);

    expect(store.read(sessionId, 1_001)).toBeNull();
  });

  it("serializes an HttpOnly SameSite cookie without principal data", () => {
    const header = setSessionCookieHeader("opaque-session", { secure: true });

    expect(header).toContain(`${AUTH_SESSION_COOKIE_NAME}=opaque-session`);
    expect(header).toContain("HttpOnly");
    expect(header).toContain("SameSite=Lax");
    expect(header).toContain("Secure");
    expect(header).not.toContain("user-123");
    expect(readSessionCookie(header)).toBe("opaque-session");
    expect(clearSessionCookieHeader({ secure: false })).toContain("Max-Age=0");
  });
});
