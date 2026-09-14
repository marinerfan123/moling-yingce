import { randomBytes } from "node:crypto";

export const AUTH_SESSION_COOKIE_NAME = "comic_canvas_session";
export const AUTH_SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

export type AuthSessionIdentity = Readonly<{
  issuer: string;
  subject: string;
  audience: string;
}>;

export type AuthSessionStore = Readonly<{
  create(identity: AuthSessionIdentity, nowSeconds?: number): string;
  read(sessionId: string, nowSeconds?: number): AuthSessionIdentity | null;
  revoke(sessionId: string): void;
}>;

type StoredSession = Readonly<{
  identity: AuthSessionIdentity;
  expiresAt: number;
}>;

export class InMemoryAuthSessionStore implements AuthSessionStore {
  readonly #ttlSeconds: number;
  readonly #sessions = new Map<string, StoredSession>();

  constructor(options: Readonly<{ ttlSeconds?: number }> = {}) {
    this.#ttlSeconds = options.ttlSeconds ?? AUTH_SESSION_TTL_SECONDS;
    if (!Number.isInteger(this.#ttlSeconds) || this.#ttlSeconds <= 0) throw new Error("AUTH_SESSION_TTL_INVALID");
  }

  create(identity: AuthSessionIdentity, nowSeconds = currentSeconds()) {
    const sessionId = randomBytes(32).toString("base64url");
    this.#sessions.set(sessionId, { identity, expiresAt: nowSeconds + this.#ttlSeconds });
    return sessionId;
  }

  read(sessionId: string, nowSeconds = currentSeconds()) {
    const session = this.#sessions.get(sessionId);
    if (!session) return null;
    if (session.expiresAt <= nowSeconds) {
      this.#sessions.delete(sessionId);
      return null;
    }
    return session.identity;
  }

  revoke(sessionId: string) {
    this.#sessions.delete(sessionId);
  }
}

export function readSessionCookie(cookieHeader: string | undefined, name = AUTH_SESSION_COOKIE_NAME): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0 || part.slice(0, separator).trim() !== name) continue;
    const value = part.slice(separator + 1).trim();
    if (!value) return null;
    try {
      return decodeURIComponent(value);
    } catch {
      return null;
    }
  }
  return null;
}

export function setSessionCookieHeader(
  sessionId: string,
  options: Readonly<{ secure: boolean; maxAgeSeconds?: number }> = { secure: false },
) {
  const maxAgeSeconds = options.maxAgeSeconds ?? AUTH_SESSION_TTL_SECONDS;
  return [
    `${AUTH_SESSION_COOKIE_NAME}=${encodeURIComponent(sessionId)}`,
    "Path=/",
    `Max-Age=${maxAgeSeconds}`,
    "HttpOnly",
    "SameSite=Lax",
    ...(options.secure ? ["Secure"] : []),
  ].join("; ");
}

export function clearSessionCookieHeader(options: Readonly<{ secure: boolean }> = { secure: false }) {
  return [
    `${AUTH_SESSION_COOKIE_NAME}=`,
    "Path=/",
    "Max-Age=0",
    "HttpOnly",
    "SameSite=Lax",
    ...(options.secure ? ["Secure"] : []),
  ].join("; ");
}

function currentSeconds() {
  return Math.floor(Date.now() / 1000);
}
