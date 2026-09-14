# Server Auth Session Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the authenticated state across browser refreshes with the same server-backed HttpOnly session-cookie model used by `open-ai-canvas`.

**Architecture:** The API issues an opaque, expiring session cookie after a verified OIDC principal is exchanged for a server session. The web app calls `/v1/auth/session` with `credentials: "include"` during bootstrap and exposes a single auth state for protected route decisions. Access and refresh tokens remain out of Web Storage.

**Tech Stack:** Node `http`, TypeScript, Vitest, React 19, browser Fetch API.

## Global Constraints

- Never write bearer or refresh tokens to `localStorage`, `sessionStorage`, or IndexedDB.
- Session cookies are `HttpOnly`, `SameSite=Lax`, `Path=/`, and `Secure` only when the request is HTTPS.
- Anonymous session hydration returns a normal `200` response with `user: null`.
- Logout revokes the server session and expires the cookie.

### Task 1: Session Cookie Domain

**Files:**

- Create: `apps/api/src/auth/session.ts`
- Test: `apps/api/src/auth/session.test.ts`

**Interfaces:**

- Produces `AuthSessionStore`, `InMemoryAuthSessionStore`, `readSessionCookie`, `setSessionCookieHeader`, and `clearSessionCookieHeader`.
- Session records contain only a verified principal and an opaque session identifier; cookie serialization contains no principal data.

- [x] **Step 1: Write failing tests** for expiry, revoke, cookie parsing, HttpOnly/SameSite attributes, and secure-cookie selection.
- [x] \*\*Step 2: Run `pnpm --filter @comic-canvas/api test -- src/auth/session.test.ts` and verify the new module is missing.
- [x] \*\*Step 3: Implement the opaque session store and cookie helpers with a 30-day default TTL.
- [x] \*\*Step 4: Run the focused tests and verify they pass.

### Task 2: API Session Endpoints

**Files:**

- Modify: `apps/api/src/main.ts`
- Modify: `apps/api/src/auth/auth.module.ts`
- Modify: `apps/api/src/index.ts`
- Test: `apps/api/src/auth/session-http.test.ts`

**Interfaces:**

- `ApiProductionDependencies.authSessionStore` supplies the session store.
- `ApiProductionDependencies.authSessionIssuer` exchanges an `Authorization` header for a verified principal; the route never decodes an unverified JWT.
- `POST /v1/auth/session` sets the cookie, `GET /v1/auth/session` hydrates it, and `POST /v1/auth/logout` revokes it.

- [x] **Step 1: Write failing HTTP tests** for anonymous hydration, session exchange, refresh hydration, logout, and missing issuer configuration.
- [x] \*\*Step 2: Run the focused API tests and verify the endpoints do not exist.
- [x] \*\*Step 3: Add the session dependencies and cookie-aware route handling to `startApiServer`.
- [x] \*\*Step 4: Run the focused HTTP tests and verify the refresh sequence passes.

### Task 3: Web Session Hydration

**Files:**

- Create: `apps/web/src/auth/auth-session.ts`
- Test: `apps/web/src/auth/auth-session.test.ts`
- Modify: `apps/web/src/main.tsx`
- Modify: `apps/web/src/index.ts`

**Interfaces:**

- `AuthSessionClient.getSession()` calls `/v1/auth/session` with `credentials: "include"` and returns `{ user }`.
- `AuthSessionClient.establish(accessToken)` exchanges the in-memory OIDC access token for the cookie session.
- `AuthSessionClient.logout()` revokes the cookie session.
- `hydrateWebSession()` is the route-independent bootstrap function used before protected pages mount.

- [x] **Step 1: Write failing tests** for cookie credentials, session exchange, anonymous state, and logout.
- [x] \*\*Step 2: Run the focused web tests and verify the client is missing.
- [x] \*\*Step 3: Implement the Fetch client and export the bootstrap function without persisting tokens.
- [x] \*\*Step 4: Run the focused web tests and web typecheck.

### Task 4: Verification

**Files:**

- No additional files.

- [x] \*\*Step 1: Run the complete API and web test suites.
- [x] \*\*Step 2: Run API and web typechecks.
- [x] \*\*Step 3: Run web production build and `git diff --check`.
- [x] \*\*Step 4: Inspect the final diff and report the exact refresh flow and any production-session-store limitation.

### Task 5: Connect the Real Login Boundary

**Files:**

- Create: `apps/api/src/auth/oidc-session-issuer.ts`
- Modify: `apps/api/src/main.ts`
- Modify: `apps/web/src/auth/auth-callback.tsx`
- Modify: `apps/web/src/app/router.tsx`
- Modify: `apps/web/vite.config.ts`

- [x] Verify access tokens with the configured OIDC issuer/JWKS before issuing a session.
- [x] Exchange the authorization-code callback for an in-memory token and establish the server cookie session.
- [x] Mount only the login route until the cookie-backed session hydrates.
- [x] Proxy local `/v1` requests to the API so `localhost:3000` uses the same cookie origin.
- [x] Verify callback, route-guard, issuer, API, Web, typecheck, build, and diff checks.
