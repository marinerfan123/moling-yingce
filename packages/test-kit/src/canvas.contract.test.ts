import { describe, expect, it } from "vitest";

import { graphWith } from "./canvas.js";
import type { TestCanvasSnapshot } from "./protocols.js";

type ProductionLikeCanvasSnapshot = Readonly<{
  id: string;
  schemaVersion: 1;
  viewport: { x: number; y: number; zoom: number };
  nodes: readonly {
    id: string;
    kind: string;
    position: { x: number; y: number };
    data: Record<string, unknown>;
  }[];
  edges: readonly {
    id: string;
    source: string;
    target: string;
    kind: "flow" | "reference" | "timeline";
    bindingId?: string;
  }[];
  meta: Record<string, unknown>;
}>;

function assertAssignableBothWays(snapshot: TestCanvasSnapshot) {
  const productionLike: ProductionLikeCanvasSnapshot = snapshot;
  const testLike: TestCanvasSnapshot = productionLike;
  return testLike;
}

describe("test-kit canvas contract compatibility", () => {
  it("builds explicit production-like node fixtures without missing-node false positives", () => {
    const snapshot = assertAssignableBothWays(graphWith({ nodes: 4, edges: 3 }));
    expect(snapshot.nodes.map((node) => node.id)).toEqual([
      "node_00000001",
      "node_00000002",
      "node_00000003",
      "node_00000004",
    ]);
    expect(snapshot.edges).toHaveLength(3);
    expect(new Set(snapshot.edges.flatMap((edge) => [edge.source, edge.target])).size).toBe(4);
  });
});
