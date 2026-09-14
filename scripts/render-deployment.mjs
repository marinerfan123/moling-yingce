import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const args = new Map(
  process.argv
    .slice(2)
    .map((value, index, all) => (value.startsWith("--") ? [value, all[index + 1] ?? "true"] : ["", ""])),
);
const environment = args.get("--environment") ?? "staging";
const out = args.get("--out") ?? `test-results/deploy/${environment}`;
const manifestPath = args.get("--manifest") ?? "test-results/images/image-manifest.json";

if (!["staging", "production"].includes(environment)) {
  throw new Error(`UNKNOWN_ENVIRONMENT ${environment}`);
}
if (!existsSync(manifestPath)) {
  throw new Error(`IMAGE_MANIFEST_MISSING ${manifestPath}`);
}
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
if (manifest.images.some((image) => !image.image.includes("@sha256:"))) {
  throw new Error("DEPLOY_REQUIRES_DIGEST_ONLY_IMAGES");
}

await mkdir(out, { recursive: true });
await cp("infra/deploy/kubernetes/base", join(out, "base"), { recursive: true });
await cp(`infra/deploy/kubernetes/overlays/${environment}`, join(out, "overlay"), { recursive: true });
await writeFile(join(out, "image-manifest.lock.json"), `${JSON.stringify(manifest, null, 2)}\n`);

const matrix = JSON.parse(readFileSync("infra/deploy/kubernetes/base/network-policy-matrix.json", "utf8"));
if (!matrix.applicationsHaveNoDirectInternet || !matrix.onlyMediaCanReachSafeFetch) {
  throw new Error("NETWORK_MATRIX_UNSAFE");
}

console.log(`rendered ${environment} deployment to ${out}`);
