import { describe, expect, it } from "vitest";
import { getExecutionOrder, validateGraph } from "./graph-validator.js";

const nodes = [
  { id: "node_00000001", kind: "script" as const },
  { id: "node_00000002", kind: "scene" as const },
  { id: "node_00000003", kind: "shot" as const },
];

describe("graph validator", () => {
  it("accepts a simple content DAG and returns stable execution order", () => {
    const snapshot = {
      nodes,
      edges: [
        { id: "edge_00000001", source: "node_00000001", target: "node_00000002", kind: "flow" as const },
        { id: "edge_00000002", source: "node_00000002", target: "node_00000003", kind: "flow" as const },
      ],
    };
    expect(validateGraph(snapshot)).toEqual([]);
    expect(getExecutionOrder(snapshot)).toEqual(["node_00000001", "node_00000002", "node_00000003"]);
  });

  it("reports missing nodes distinctly", () => {
    expect(
      validateGraph({
        nodes: [nodes[0]!],
        edges: [{ id: "edge_00000001", source: "node_00000001", target: "node_missing1", kind: "flow" }],
      }).map((diagnostic) => diagnostic.code),
    ).toContain("MISSING_NODE");
  });

  it("allows reference cycles while rejecting flow cycles", () => {
    expect(
      validateGraph({
        nodes: [nodes[0]!, nodes[1]!],
        edges: [
          { id: "edge_00000001", source: "node_00000001", target: "node_00000002", kind: "reference" },
          { id: "edge_00000002", source: "node_00000002", target: "node_00000001", kind: "reference" },
        ],
      }),
    ).toEqual([]);
    expect(
      validateGraph({
        nodes: [nodes[0]!, nodes[1]!],
        edges: [
          { id: "edge_00000001", source: "node_00000001", target: "node_00000002", kind: "flow" },
          { id: "edge_00000002", source: "node_00000002", target: "node_00000001", kind: "flow" },
        ],
      }).map((diagnostic) => diagnostic.code),
    ).toContain("FLOW_CYCLE");
  });

  it("separates port mismatch from single input conflicts", () => {
    const diagnostics = validateGraph({
      nodes: [
        { id: "node_00000001", kind: "audio" },
        { id: "node_00000002", kind: "export" },
        { id: "node_00000003", kind: "timeline-output" },
      ],
      edges: [
        {
          id: "edge_00000001",
          source: "node_00000001",
          target: "node_00000002",
          sourcePort: "audio",
          targetPort: "timeline",
          kind: "flow",
        },
        {
          id: "edge_00000002",
          source: "node_00000003",
          target: "node_00000002",
          sourcePort: "timeline",
          targetPort: "timeline",
          kind: "flow",
        },
      ],
    }).map((diagnostic) => diagnostic.code);
    expect(diagnostics).toContain("PORT_MISMATCH");
    expect(diagnostics).toContain("SINGLE_INPUT_CONFLICT");
  });
});
