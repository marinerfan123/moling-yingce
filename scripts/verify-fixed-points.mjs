import { existsSync, readFileSync } from "node:fs";

const points = {
  C: "packages/contracts/src/index.ts",
  D: "packages/db/src/schema/index.ts",
  A: "apps/api/src/app.module.ts",
  W: "apps/web/src/app/router.tsx",
  R: "packages/canvas-renderer-reactflow/src/node-registry.tsx",
  G: "apps/worker-generation/src/adapter-registry.ts",
  M: "apps/worker-media/src/main.ts",
  T: "packages/test-kit/src/index.ts",
  Q: "packages/queue/src/index.ts",
};
const missing = [];
for (const [id, path] of Object.entries(points)) {
  if (!existsSync(path)) missing.push(`${id}:${path}`);
  else if (!readFileSync(path, "utf8").includes("export")) missing.push(`${id}:${path}:no export`);
}
if (missing.length) {
  console.error(missing.join("\n"));
  process.exit(1);
}
console.log("9 fixed points importable");
