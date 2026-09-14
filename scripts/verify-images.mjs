import { readFileSync } from "node:fs";

const expected = ["web", "api", "collab", "worker-generation", "worker-media"];
const manifestPath = process.argv.includes("--manifest")
  ? process.argv[process.argv.indexOf("--manifest") + 1]
  : "test-results/images/image-manifest.json";

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const names = manifest.images.map((image) => image.name).sort();
if (JSON.stringify(names) !== JSON.stringify([...expected].sort())) {
  throw new Error(`IMAGE_SET_MISMATCH expected ${expected.join(",")}, got ${names.join(",")}`);
}
for (const image of manifest.images) {
  if (!image.image.includes("@sha256:") || image.image.includes(":latest")) {
    throw new Error(`MUTABLE_IMAGE_REF ${image.name}`);
  }
  if (image.revision !== manifest.releaseSha) {
    throw new Error(`REVISION_MISMATCH ${image.name}`);
  }
}
if (new Set(manifest.workloads).size !== 6) {
  throw new Error("WORKLOAD_SET_MISSING expected six workloads");
}
console.log(`verified ${manifest.images.length} images and ${manifest.workloads.length} workloads`);
