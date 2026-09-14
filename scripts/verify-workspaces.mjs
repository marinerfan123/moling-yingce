import { existsSync, readFileSync } from "node:fs";

const workspaces = [
  "apps/web",
  "apps/api",
  "apps/collab",
  "apps/worker-generation",
  "apps/worker-media",
  "packages/contracts",
  "packages/canvas-core",
  "packages/canvas-renderer-reactflow",
  "packages/canvas-collab-yjs",
  "packages/db",
  "packages/provider-sdk",
  "packages/queue",
  "packages/storage",
  "packages/observability",
  "packages/ui",
  "packages/config",
  "packages/test-kit",
];
const required = ["package.json", "tsconfig.json", "tsconfig.build.json", "src/index.ts", "src/bootstrap.test.ts"];
const failures = [];
for (const workspace of workspaces) {
  for (const file of required) {
    const path = `${workspace}/${file}`;
    if (!existsSync(path)) failures.push(path);
  }
  const pkg = JSON.parse(readFileSync(`${workspace}/package.json`, "utf8"));
  for (const script of ["build", "typecheck", "test"]) {
    if (!pkg.scripts?.[script]) failures.push(`${workspace}/package.json missing script ${script}`);
  }
}
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("17 workspaces complete");
