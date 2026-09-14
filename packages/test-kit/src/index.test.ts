import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import {
  connectTestDocs,
  createCanvasDocFixture,
  createDbTestContext,
  createGenerationWorkerHarness,
  createMockProviderAdapter,
  createTestApiClient,
  createTestRegistry,
  graphWith,
  pointArb,
  storyProposalFixture,
  testAssetFixture,
  viewportArb,
} from "./index.js";

describe("test-kit public contract", () => {
  it("exports deterministic canvas, Yjs, DB, provider, story and media helpers", async () => {
    const canvas = graphWith({ nodes: 3 });
    expect(canvas.nodes).toHaveLength(3);
    expect(createTestRegistry().get("script")?.title).toBe("Script");
    expect(createCanvasDocFixture(canvas).snapshot.id).toBe(canvas.id);
    expect(pointArb).toBeDefined();
    expect(viewportArb).toBeDefined();

    const a = new Y.Doc();
    const b = new Y.Doc();
    const link = connectTestDocs(a, b);
    link.flush();
    link.disconnect();

    const db = await createDbTestContext();
    const provider = createMockProviderAdapter();
    const harness = createGenerationWorkerHarness({ db, provider });
    await expect(harness.runUntil("after-provider-success-before-output-commit")).resolves.toMatchObject({
      checkpoint: "after-provider-success-before-output-commit",
    });
    expect(provider.calls).toContain("text:commercial smoke prompt");

    expect(createTestApiClient().baseURL).toContain("127.0.0.1");
    expect(storyProposalFixture({ scenes: 2, characters: 1 }).scenes).toHaveLength(2);
    expect(testAssetFixture().sha256).toMatch(/^[a-f0-9]{64}$/);
    await db.cleanup();
  });
});
