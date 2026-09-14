import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const args = new Map(
  process.argv
    .slice(2)
    .map((value, index, all) => (value.startsWith("--") ? [value, all[index + 1] ?? "true"] : ["", ""])),
);
const manifestPath = args.get("--manifest") ?? "tests/fixtures/golden/project-sources.json";
const cache = args.get("--cache") ?? "test-results/golden-source-cache";
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

if (manifest.projects.length !== 3) throw new Error("GOLDEN_PROJECT_COUNT_MUST_BE_3");

const listed = new Set();
for (const project of manifest.projects) {
  for (const file of project.files) {
    listed.add(file.path);
    const destination = join(cache, file.path);
    if (!existsSync(destination)) throw new Error(`GOLDEN_FILE_MISSING ${file.path}`);
    const bytes = readFileSync(destination);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    if (sha256 !== file.sha256) throw new Error(`GOLDEN_HASH_MISMATCH ${file.path}`);
    if (bytes.length !== file.bytes) throw new Error(`GOLDEN_SIZE_MISMATCH ${file.path}`);
    if (!String(file.sourceUrl).startsWith("https://")) throw new Error(`GOLDEN_SOURCE_NOT_HTTPS ${file.path}`);
    if (!file.licenseEvidenceId) throw new Error(`GOLDEN_LICENSE_MISSING ${file.path}`);
  }
}

console.log(`verified ${listed.size} golden project source files`);
