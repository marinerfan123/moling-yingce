import { createHash } from "node:crypto";

import type { TestAsset } from "./protocols.js";

export function testAssetFixture(input: { id?: string; mime?: string; content?: string } = {}): TestAsset {
  const content = input.content ?? "comic-canvas-test-asset";
  return {
    id: input.id ?? "asset-test-1",
    mime: input.mime ?? "image/png",
    bytes: Buffer.byteLength(content),
    sha256: createHash("sha256").update(content).digest("hex"),
  };
}
