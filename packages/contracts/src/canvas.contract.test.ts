import { describe, expect, it } from "vitest";

import {
  CanvasCommandSchema,
  CanvasEdgeSchema,
  CanvasNodeSchema,
  CanvasSnapshotSchema,
  ResourceRefSchema,
  nodeKinds,
} from "./index.js";

const node = {
  id: "node_12345678",
  kind: "unknown",
  position: { x: 1, y: 2 },
  data: { raw: { preserved: true } },
} as const;

const edge = {
  id: "edge_12345678",
  source: "node_12345678",
  target: "node_87654321",
  kind: "flow",
} as const;

describe("canvas contracts", () => {
  it("freezes the exact NodeKind set", () => {
    expect(nodeKinds).toEqual([
      "script",
      "scene",
      "shot",
      "character",
      "location",
      "prop",
      "style",
      "asset-input",
      "image-generation",
      "video-generation",
      "voice-generation",
      "audio",
      "caption",
      "timeline-output",
      "export",
      "review-gate",
      "frame",
      "note",
      "unknown",
    ]);
  });

  it("validates pinned/latest resource refs", () => {
    expect(ResourceRefSchema.parse({ kind: "asset", id: "asset-1", follow: "pinned", versionId: "v1" })).toMatchObject({
      follow: "pinned",
    });
    expect(() => ResourceRefSchema.parse({ kind: "asset", id: "asset-1", follow: "pinned" })).toThrow();
    expect(() =>
      ResourceRefSchema.parse({ kind: "asset", id: "asset-1", follow: "latest", versionId: "v1" }),
    ).toThrow();
  });

  it("preserves unknown node raw JSON and blocks editable domain fields", () => {
    expect(CanvasNodeSchema.parse(node).data).toEqual({ raw: { preserved: true } });
    expect(() =>
      CanvasNodeSchema.parse({
        id: "node_script01",
        kind: "script",
        position: { x: 0, y: 0 },
        data: { title: "editable domain title" },
      }),
    ).toThrow(/domain-backed/);
  });

  it("requires bindingId for reference edges", () => {
    expect(CanvasEdgeSchema.parse(edge).kind).toBe("flow");
    expect(() =>
      CanvasEdgeSchema.parse({
        ...edge,
        kind: "reference",
      }),
    ).toThrow(/bindingId/);
  });

  it("round-trips every command without losing operationId", () => {
    const commands = [
      { type: "node.add", operationId: "op_12345678", node },
      { type: "node.move", operationId: "op_22345678", positions: { node_12345678: { x: 10, y: 20 } } },
      { type: "node.configure", operationId: "op_32345678", nodeId: "node_12345678", patch: { a: 1 } },
      { type: "node.remove", operationId: "op_42345678", nodeIds: ["node_12345678"] },
      { type: "edge.connect", operationId: "op_52345678", edge },
      { type: "edge.disconnect", operationId: "op_62345678", edgeId: "edge_12345678" },
      { type: "group.set", operationId: "op_72345678", parentId: "node_12345678", childIds: ["node_87654321"] },
      { type: "projection.upsert", operationId: "op_82345678", node },
    ];
    for (const command of commands) {
      const parsed = CanvasCommandSchema.parse(JSON.parse(JSON.stringify(command)));
      expect(parsed.operationId).toBe(command.operationId);
    }
  });

  it("validates complete canvas snapshots", () => {
    expect(
      CanvasSnapshotSchema.parse({
        schemaVersion: 1,
        nodes: [node, { ...node, id: "node_87654321" }],
        edges: [edge],
        meta: { title: "Commercial canvas" },
      }),
    ).toMatchObject({ schemaVersion: 1, edges: [{ id: "edge_12345678" }] });
  });
});
