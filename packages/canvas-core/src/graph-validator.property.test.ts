import { describe, expect, it } from "vitest";
import { getExecutionOrder, validateGraph } from "./graph-validator.js";
import { migrateCanvas } from "./migrations.js";

function dag(size: number) {
  const nodes = Array.from({ length: size }, (_, index) => ({
    id: `node_${String(index + 1).padStart(8, "0")}`,
    kind: index === 0 ? ("script" as const) : ("note" as const),
    data: { index },
  }));
  const edges = Array.from({ length: Math.max(0, size - 1) }, (_, index) => ({
    id: `edge_${String(index + 1).padStart(8, "0")}`,
    source: nodes[index]!.id,
    target: nodes[index + 1]!.id,
    kind: "flow" as const,
  }));
  return { nodes, edges };
}

describe("graph validator properties", () => {
  it("returns stable topological order for 1000 deterministic DAGs", () => {
    for (let size = 1; size <= 1000; size += 1) {
      const snapshot = dag(Math.min(size, 25));
      expect(validateGraph(snapshot)).toEqual([]);
      expect(getExecutionOrder(snapshot)).toEqual(snapshot.nodes.map((node) => node.id));
    }
  });

  it("migration is deterministic and idempotent", () => {
    const once = migrateCanvas(dag(5));
    const twice = migrateCanvas(once);
    expect(twice).toEqual(once);
  });
});
