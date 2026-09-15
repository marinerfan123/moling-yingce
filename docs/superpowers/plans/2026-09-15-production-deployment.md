# Complete Fork and Deploy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the modified `moling-yingce` repository with the missing application files from `ddcat-ai/open-ai-canvas`, then build and expose the complete application at `tv.moling.fun` on `8.217.12.36` without disturbing `/opt/moling`.

**Architecture:** Keep the modified repository's existing TypeScript reference workspace under `apps/` and `packages/` intact. Add the upstream Go backend, Bun/Vite React frontend, assets, payment plugin packages, and non-conflicting upstream support files at their expected paths. A dedicated production Compose file builds the upstream backend and web images from the merged repository, binds only the web to loopback port `3300`, and lets the web container proxy `/api` internally to the backend. Host Nginx terminates TLS for `tv.moling.fun` and forwards the public origin to that web port.

**Tech Stack:** Go 1.25, Bun 1.3.13, Vite, React, Docker Compose, PostgreSQL 17, Redis 7.4, Nginx, Certbot/Let's Encrypt.

## Global Constraints

- Preserve the current `apps/`, `packages/`, `tests/`, and existing user changes; do not replace them with upstream files.
- Import upstream application directories and files from the checked-out `.codex-upstream-open-ai-canvas` snapshot at commit `71a9a0e7f79601a3a827cda715a29aaec84a7034`.
- Resolve root-file conflicts by merging configuration or adding a clearly named deployment file; never silently discard existing project configuration.
- Do not commit, transmit, or print passwords, private keys, `.env` files, database contents, or TLS private keys.
- Leave the existing `/opt/moling` Compose project, containers, volumes, and ports untouched.
- Use isolated names, volumes, and loopback bindings for the new `/opt/comic-canvas-tv` deployment.
- Keep `CANVAS_REGISTRATION_ENABLED=false` for the public service unless a controlled first-admin bootstrap is explicitly performed and immediately disabled.

---

### Task 1: Complete the Repository With Upstream Runtime Files

**Files:**
- Create: `backend/` from `.codex-upstream-open-ai-canvas/backend/`
- Create: `web/` from `.codex-upstream-open-ai-canvas/web/`
- Create: `assets/` from `.codex-upstream-open-ai-canvas/assets/`
- Create: `plugin-packages/` from `.codex-upstream-open-ai-canvas/plugin-packages/`
- Create: `VERSION`, `.gitattributes`, and non-conflicting upstream root support files
- Modify: `.dockerignore`, `.gitignore`, `.env.example`, `README.md`
- Test: `scripts/verify-merged-upstream-layout.mjs`

**Interfaces:**
- Consumes: the upstream snapshot and the current modified workspace.
- Produces: a merged checkout containing `backend/cmd/server`, `backend/cmd/migrate-schema`, `web/src`, `web/package.json`, `assets/`, and `plugin-packages/`.

- [ ] **Step 1: Record the upstream source revision and enumerate collisions**

  Run `git -C .codex-upstream-open-ai-canvas rev-parse HEAD` and compare relative paths with `rg --files`. Treat only exact root collisions as merge points; the upstream `backend/`, `web/`, `assets/`, and `plugin-packages/` directories are additive.

- [ ] **Step 2: Copy the four additive runtime trees and required metadata**

  Copy the upstream `backend`, `web`, `assets`, `plugin-packages`, `VERSION`, and `.gitattributes` paths into the repository. Exclude the upstream `.git`, `output`, caches, and generated test artifacts.

- [ ] **Step 3: Merge root configuration without replacing the current workspace**

  Keep the current root `package.json`, `pnpm-workspace.yaml`, TypeScript configuration, and scripts. Merge upstream public environment keys into `.env.example`, add upstream ignore rules to `.gitignore` and `.dockerignore`, and append the upstream application/build notes to `README.md`.

- [ ] **Step 4: Add a deterministic merged-layout verifier**

  Make `scripts/verify-merged-upstream-layout.mjs` assert that the required backend entrypoints, frontend package/entrypoint, payment plugin build script, assets, `VERSION`, and production Compose/Dockerfile paths exist, while also asserting that `apps/api` and `packages/contracts` remain present.

- [ ] **Step 5: Run the layout verifier and inspect the diff**

  Run `node scripts/verify-merged-upstream-layout.mjs`, `git status --short`, and `git diff --check`. The verifier must exit `0`, and the diff must contain no upstream `.git`, generated output, or secret files.

### Task 2: Add an Isolated Full-Application Production Stack

**Files:**
- Create: `infra/docker/compose.production.yml`
- Create: `infra/docker/.env.production.example`
- Create: `infra/docker/production-backend.Dockerfile`
- Create: `infra/docker/production-web.Dockerfile`
- Modify: `.dockerignore`
- Test: `scripts/verify-production-container-layout.mjs`

**Interfaces:**
- Consumes: the merged upstream `backend/`, `web/`, `assets/`, `plugin-packages/`, and `VERSION` trees.
- Produces: Compose services `postgres`, `redis`, `migrate`, `backend`, and `web` in project `comic-canvas-tv`, with web at `127.0.0.1:3300` and no host bindings for database or backend.

- [ ] **Step 1: Define the server-only environment template**

  Declare non-secret defaults for `CANVAS_REGISTRATION_ENABLED`, `CANVAS_CORS_ORIGINS=https://tv.moling.fun`, `CANVAS_DATA_PATH`, `CANVAS_POSTGRES_DATA_PATH`, `CANVAS_REDIS_DATA_PATH`, `CANVAS_HTTP_PORT=3300`, and placeholders for `POSTGRES_PASSWORD`, `DATABASE_URL`, and `CANVAS_IMAGE_TAG` without adding real credentials.

- [ ] **Step 2: Create deployment Dockerfiles that build the upstream app**

  Use the upstream backend build stages for Go binaries and payment-plugin verification, and the upstream root web build stages for Bun/Vite and Nginx. Keep runtime users non-root, add health checks for `/api/health/ready` and `/`, and copy only the merged runtime inputs.

- [ ] **Step 3: Configure unique Compose names and dependencies**

  Adapt the upstream server Compose topology with `name: comic-canvas-tv`, names prefixed `comic-canvas-tv-`, PostgreSQL migration gating, Redis persistence, loopback-only web port `127.0.0.1:3300:3000`, and no `ports:` entry for PostgreSQL, Redis, or backend.

- [ ] **Step 4: Extend the container-layout verifier**

  Assert that every Compose build context contains its Dockerfile, the Dockerfiles reference the required runtime trees, host bindings are loopback-only, and the production file does not reference `/opt/moling` or the reference TypeScript service commands.

- [ ] **Step 5: Render the production configuration without exposing secrets**

  Run `docker compose --env-file infra/docker/.env.production.example -f infra/docker/compose.production.yml config --quiet` and `node scripts/verify-production-container-layout.mjs`. Do not use plain `docker compose config` because it prints interpolated values.

### Task 3: Install the Domain Reverse Proxy Safely

**Files:**
- Create: `infra/deploy/host/tv.moling.fun.conf`
- Create: `infra/deploy/host/tv.moling.fun-acme.conf`
- Create: `infra/deploy/host/install-tv.sh`
- Modify: `docs/runbooks/tv-moling-fun-deployment.md`
- Test: `scripts/verify-nginx-site.mjs`

**Interfaces:**
- Consumes: the web loopback listener `127.0.0.1:3300` and the existing host Nginx installation.
- Produces: an idempotent Nginx site for `tv.moling.fun`, HTTP-to-HTTPS redirect, ACME webroot support, and safe SPA/API proxying.

- [ ] **Step 1: Define the Nginx site and ACME bootstrap site**

  Route `/` to `127.0.0.1:3300`, preserve forwarded headers, set upload and read timeouts suitable for the canvas, redirect port 80 to HTTPS after certificate issuance, and expose only `/.well-known/acme-challenge/` during bootstrap.

- [ ] **Step 2: Implement an idempotent install script**

  Resolve either Debian `sites-available/sites-enabled` or the detected panel layout, validate that the source and target paths are exact files under the intended Nginx directories, back up only this site's prior config, run `nginx -t`, install, and reload without touching unrelated hosts.

- [ ] **Step 3: Document certificate issuance and rollback**

  Document DNS verification, server preflight, server-only environment generation, Compose commands, Certbot webroot issuance, first-admin registration policy, health URLs, rollback, and the explicit boundary that `/opt/moling` is not modified.

- [ ] **Step 4: Run the Nginx config verifier**

  Run `node scripts/verify-nginx-site.mjs` and inspect that the domain, loopback upstream, ACME path, redirect, proxy headers, and WebSocket-capable HTTP/1.1 settings are present.

### Task 4: Verify and Transfer the Merged Application

**Files:**
- Modify: `docs/runbooks/tv-moling-fun-deployment.md`
- Generated remotely only: `/opt/comic-canvas-tv/.env.production`, Docker volumes, images, Nginx configuration, and certificates

**Interfaces:**
- Consumes: the locally verified merged tree.
- Produces: an exact source transfer to `/opt/comic-canvas-tv` that excludes secrets, `.git`, caches, the upstream checkout, and generated artifacts.

- [ ] **Step 1: Run local verification before any transfer**

  Run `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, `node scripts/verify-merged-upstream-layout.mjs`, `node scripts/verify-production-container-layout.mjs`, `node scripts/verify-nginx-site.mjs`, and `git diff --check`. Record any pre-existing formatting-only failures separately.

- [ ] **Step 2: Create a secret-free deployment archive**

  Package the current working tree, including uncommitted merged files, while excluding `.git`, `.codex-upstream-open-ai-canvas`, `node_modules`, `.pnpm-store`, `.turbo`, `dist`, `coverage`, `test-results`, `.env*`, and logs. Verify the archive member list before transfer.

- [ ] **Step 3: Transfer to a staging directory and verify server identity**

  Upload to a temporary directory under `/opt/comic-canvas-tv`, verify `hostname`, `docker --version`, `docker compose version`, `nginx -v`, and `getent hosts tv.moling.fun`; then atomically update only the application directory after the source checksum/layout check.

### Task 5: Deploy and Smoke-Test `tv.moling.fun`

**Files:**
- Modify remotely only: `/opt/comic-canvas-tv/infra/docker/.env.production`
- Generated remotely only: Compose state and Nginx certificates/configuration

**Interfaces:**
- Consumes: the transferred full application and user-provided server access.
- Produces: a running full upstream application at `https://tv.moling.fun/` with migration, backend readiness, web health, and HTTPS smoke-test evidence.

- [ ] **Step 1: Snapshot existing state without changing it**

  Record `/opt/moling` container status, ports, and compose project name. Confirm the new stack uses distinct names and ports before starting anything.

- [ ] **Step 2: Generate server-only secrets and build the full images**

  Create `.env.production` with `umask 077`, random PostgreSQL credentials, a matching `DATABASE_URL`, and public-domain settings. Run `docker compose ... config --quiet`, then build the backend and web images on the server.

- [ ] **Step 3: Run migrations and start the full stack**

  Start PostgreSQL and Redis, run the one-shot `migrate` service successfully, then start `backend` and `web`. Confirm the backend health check is healthy before starting or enabling the public Nginx site.

- [ ] **Step 4: Issue/install TLS and reload Nginx**

  Use the ACME webroot site and Certbot for `tv.moling.fun`, install the final site, run `nginx -t`, and reload Nginx. Do not remove or rewrite unrelated certificates or virtual hosts.

- [ ] **Step 5: Run end-to-end smoke tests and compare old state**

  Verify `curl -fsS http://127.0.0.1:3300/`, `curl -fsS http://127.0.0.1:3300/api/health/ready`, `curl -fsSI https://tv.moling.fun/`, `curl -fsS https://tv.moling.fun/api/health/ready`, browser asset loading, and the `/api` proxy. Re-check `/opt/moling` status and report any failed capability without claiming completion.
