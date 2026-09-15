import { access, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));

async function exists(relativePath) {
  try {
    await access(resolve(root, relativePath));
    return true;
  } catch {
    return false;
  }
}

async function requirePath(relativePath) {
  if (!(await exists(relativePath))) throw new Error(`missing required path: ${relativePath}`);
}

for (const path of [
  "backend/go.mod",
  "backend/cmd/server/main.go",
  "backend/cmd/migrate-schema/main.go",
  "web/package.json",
  "web/bun.lock",
  "web/index.html",
  "web/src/main.tsx",
  "assets",
  "plugin-packages/build-packages.sh",
  "plugin-packages/verify-payment-packages.sh",
  "VERSION",
  "apps/api/package.json",
  "packages/contracts/package.json",
  "infra/docker/compose.production.yml",
  "infra/docker/production-backend.Dockerfile",
  "infra/docker/production-web.Dockerfile",
]) {
  await requirePath(path);
}

const webPackage = JSON.parse(await readFile(resolve(root, "web/package.json"), "utf8"));
if (webPackage.scripts?.build !== "tsc --noEmit && vite build") {
  throw new Error("web/package.json does not contain the expected upstream build script");
}

const goModule = await readFile(resolve(root, "backend/go.mod"), "utf8");
if (!goModule.includes("module infinite-canvas/backend")) {
  throw new Error("backend/go.mod is not the upstream Go module");
}

for (const forbidden of ["backend/.git", "web/.git", "assets/.git", "plugin-packages/.git", "output"]) {
  if (await exists(forbidden)) throw new Error(`generated or nested repository path must not be merged: ${forbidden}`);
}

console.log("Merged upstream layout is complete.");
