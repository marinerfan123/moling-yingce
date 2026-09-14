import fc from "fast-check";

import type { Point, TestCanvasSnapshot, TestNodeDefinition, TestNodeRegistry, Viewport } from "./protocols.js";

export type GraphFixtureInput = Readonly<{
  nodes?: number;
  edges?: number;
  kind?: string;
}>;

const defaultDefinitions: readonly TestNodeDefinition[] = Object.freeze([
  { kind: "script", title: "Script", outputs: ["scene"] },
  { kind: "scene", title: "Scene", inputs: ["script"], outputs: ["shot"] },
  { kind: "shot", title: "Shot", inputs: ["scene"], outputs: ["frame"] },
  { kind: "image-generation", title: "Image Generation", inputs: ["prompt"], outputs: ["asset"] },
  { kind: "video-generation", title: "Video Generation", inputs: ["prompt"], outputs: ["asset"] },
]);

export function graphWith(input: GraphFixtureInput = {}): TestCanvasSnapshot {
  const nodeCount = input.nodes ?? 3;
  const edgeCount = Math.min(input.edges ?? Math.max(0, nodeCount - 1), Math.max(0, nodeCount - 1));
  const nodes = Array.from({ length: nodeCount }, (_, index) => ({
    id: `node_${String(index + 1).padStart(8, "0")}`,
    kind: input.kind ?? defaultDefinitions[index % defaultDefinitions.length]?.kind ?? "unknown",
    position: { x: index * 240, y: index * 80 },
    data: { fixtureLabel: `Node ${index + 1}` },
  }));
  const edges = Array.from({ length: edgeCount }, (_, index) => ({
    id: `edge_${String(index + 1).padStart(8, "0")}`,
    source: nodes[index]?.id ?? "node-1",
    target: nodes[index + 1]?.id ?? "node-1",
    kind: "flow" as const,
  }));
  return {
    id: "canvas-fixture",
    schemaVersion: 1,
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes,
    edges,
    meta: { fixture: true },
  };
}

export function createTestRegistry(overrides: readonly TestNodeDefinition[] = []): TestNodeRegistry {
  const definitions = [...defaultDefinitions, ...overrides];
  return {
    definitions,
    get(kind) {
      return definitions.find((definition) => definition.kind === kind);
    },
  };
}

export const pointArb: fc.Arbitrary<Point> = fc.record({
  x: fc.integer({ min: -10_000, max: 10_000 }),
  y: fc.integer({ min: -10_000, max: 10_000 }),
});

export const viewportArb: fc.Arbitrary<Viewport> = fc.record({
  x: fc.integer({ min: -10_000, max: 10_000 }),
  y: fc.integer({ min: -10_000, max: 10_000 }),
  zoom: fc.double({ min: 0.1, max: 4, noNaN: true }),
});
