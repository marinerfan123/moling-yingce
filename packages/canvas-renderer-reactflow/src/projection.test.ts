import { describe, expect, it } from "vitest";

import { projectVisibleGraph } from "./projection.js";

function snapshot(count: number) {
  return {
    nodes: Array.from({ length: count }, (_, i) => ({
      id: `node_${String(i).padStart(8, "0")}`,
      kind: "note",
      position: { x: (i % 100) * 260, y: Math.floor(i / 100) * 180 },
      size: { width: 240, height: 160 },
    })),
    edges: Array.from({ length: Math.max(0, count - 1) }, (_, i) => ({
      id: `edge_${String(i).padStart(8, "0")}`,
      source: `node_${String(i).padStart(8, "0")}`,
      target: `node_${String(i + 1).padStart(8, "0")}`,
      kind: "flow",
    })),
  };
}

describe("projectVisibleGraph", () => {
  it("limits mounted nodes and details by zoom LOD", () => {
    const low = projectVisibleGraph(snapshot(1000), { x: 0, y: 0, width: 30000, height: 30000 }, 0.2);
    expect(low.nodes.length).toBeLessThanOrEqual(400);
    expect(low.lod).toBe("summary");
    const detail = projectVisibleGraph(snapshot(1000), { x: 0, y: 0, width: 30000, height: 30000 }, 0.9);
    expect(detail.nodes.length).toBeLessThanOrEqual(300);
    expect(detail.lod).toBe("detail");
  });

  it("keeps edges only when both endpoints are visible", () => {
    const projected = projectVisibleGraph(snapshot(10), { x: 0, y: 0, width: 260, height: 180 }, 1);
    const visibleIds = new Set(projected.nodes.map((node) => node.id));
    expect(projected.edges.every((edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target))).toBe(true);
  });
});
