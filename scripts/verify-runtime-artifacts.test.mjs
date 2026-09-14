import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const images = ["web", "api", "collab", "worker-generation", "worker-media"];
const workloads = ["web", "api", "collab", "dispatcher", "worker-generation", "worker-media"];

test("runtime artifacts declare five images and six workloads", () => {
  for (const image of images) {
    const dockerfile = readFileSync(`infra/docker/Dockerfile.${image}`, "utf8");
    assert.match(dockerfile, /USER 100\d+/);
    assert.match(dockerfile, /ENTRYPOINT \[/);
    assert.doesNotMatch(dockerfile, /\.env/);
    assert.match(dockerfile, /org\.opencontainers\.image\.revision/);
  }
  const compose = readFileSync("infra/docker/compose.yml", "utf8");
  for (const workload of workloads) assert.match(compose, new RegExp(`\\n  ${workload}:`));
  assert.match(compose, /read_only: true/);
  assert.match(readFileSync("infra/deploy/kubernetes/base/dispatcher.yaml", "utf8"), /exec:/);
  assert.match(readFileSync("infra/deploy/kubernetes/base/worker-media.yaml", "utf8"), /7\.1\.1/);
});
