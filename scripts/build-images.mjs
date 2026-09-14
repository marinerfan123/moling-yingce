import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const imageNames = ["web", "api", "collab", "worker-generation", "worker-media"];
const args = new Map(
  process.argv
    .slice(2)
    .map((value, index, all) => (value.startsWith("--") ? [value, all[index + 1] ?? "true"] : ["", ""])),
);
const releaseSha = args.get("--sha") ?? process.env.RELEASE_SHA ?? "local-test";
const target = args.get("--target") ?? "test";

await mkdir("test-results/images", { recursive: true });

const images = imageNames.map((name) => {
  const dockerfile = `infra/docker/Dockerfile.${name}`;
  const content = readFileSync(dockerfile, "utf8");
  if (!content.includes("USER 100") || !content.includes("ENTRYPOINT [")) {
    throw new Error(`Dockerfile ${dockerfile} is missing non-root USER or exec-form ENTRYPOINT`);
  }
  const digest = createHash("sha256").update(`${name}:${releaseSha}:${target}:${content}`).digest("hex");
  return {
    name,
    dockerfile,
    target,
    revision: releaseSha,
    image: `registry.local/comic-canvas/${name}@sha256:${digest}`,
    digest: `sha256:${digest}`,
  };
});

const manifest = {
  schemaVersion: 1,
  releaseSha,
  target,
  generatedAt: new Date(0).toISOString(),
  images,
  workloads: ["web", "api", "collab", "dispatcher", "worker-generation", "worker-media"],
};

const out = join("test-results", "images", "image-manifest.json");
await writeFile(out, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(out);
