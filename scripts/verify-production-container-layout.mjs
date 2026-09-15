#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const failures = [];

function read(relativePath) {
  try {
    return readFileSync(join(root, relativePath), "utf8");
  } catch {
    failures.push(`missing ${relativePath}`);
    return "";
  }
}

function requireText(value, expected, label) {
  if (!value.includes(expected)) failures.push(`${label} is missing ${expected}`);
}

const backendDockerfile = read("infra/docker/production-backend.Dockerfile");
const webDockerfile = read("infra/docker/production-web.Dockerfile");
const compose = read("infra/docker/compose.production.yml");
const envExample = read("infra/docker/.env.production.example");

for (const required of [
  "COPY backend/go.mod backend/go.sum",
  "COPY backend ./backend",
  "COPY plugin-packages ./plugin-packages",
  "./plugin-packages/build-packages.sh --payments-only",
  "go build",
  "USER app",
  "HEALTHCHECK",
]) {
  requireText(backendDockerfile, required, "production-backend.Dockerfile");
}

for (const required of [
  "FROM oven/bun:1.3.13 AS web-build",
  "COPY web/package.json web/bun.lock ./",
  "COPY assets /app/assets",
  "bun --bun ./node_modules/vite/bin/vite.js build",
  "FROM nginx:1.27-alpine",
  "HEALTHCHECK",
]) {
  requireText(webDockerfile, required, "production-web.Dockerfile");
}

for (const service of ["postgres", "redis", "migrate", "backend", "web"]) {
  if (!new RegExp(`^  ${service}:`, "m").test(compose)) failures.push(`production compose is missing ${service}`);
}
for (const forbiddenService of ["api", "collab", "dispatcher", "worker-generation", "worker-media", "minio", "keycloak"]) {
  if (new RegExp(`^  ${forbiddenService}:`, "m").test(compose)) {
    failures.push(`production compose must not start reference service ${forbiddenService}`);
  }
}

requireText(compose, "name: comic-canvas-tv", "production compose");
requireText(compose, '"127.0.0.1:3300:3000"', "production compose");
requireText(compose, "condition: service_completed_successfully", "production compose");
requireText(compose, "condition: service_healthy", "production compose");
requireText(compose, "production-backend.Dockerfile", "production compose");
requireText(compose, "production-web.Dockerfile", "production compose");
requireText(compose, "comic-canvas-tv-postgres", "production compose");
requireText(compose, "comic-canvas-tv-redis", "production compose");
if (compose.includes("127.0.0.1:3301") || compose.includes("127.0.0.1:3302")) {
  failures.push("production compose exposes obsolete reference service ports");
}
if (compose.includes("COMIC_CANVAS_REFERENCE_RUNTIME") || compose.includes("apps/api/dist")) {
  failures.push("production compose still references the TypeScript reference runtime");
}
if (/^\s+-\s+\d+:\d+/m.test(compose.replace(/127\.0\.0\.1:/g, ""))) {
  failures.push("production compose contains a non-loopback host binding");
}

for (const required of [
  "POSTGRES_PASSWORD=change-me",
  "DATABASE_URL=postgresql://open_ai_canvas:change-me@postgres:5432/open_ai_canvas?sslmode=disable",
  "CANVAS_REGISTRATION_ENABLED=false",
  "CANVAS_CORS_ORIGINS=https://tv.moling.fun",
]) {
  requireText(envExample, required, "production environment example");
}

if (failures.length > 0) {
  console.error("production container layout: FAILED");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log("production container layout: PASS");
}
