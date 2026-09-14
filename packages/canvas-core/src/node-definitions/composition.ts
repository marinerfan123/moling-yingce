import { defineNode } from "./types.js";

export const compositionNodeDefinitions = [
  defineNode({
    kind: "timeline-output",
    family: "composition",
    defaultSize: { width: 320, height: 200 },
    inputs: [{ id: "tracks", type: "timeline", cardinality: "many" }],
    outputs: [{ id: "timeline", type: "timeline", cardinality: "single" }],
  }),
  defineNode({
    kind: "export",
    family: "composition",
    defaultSize: { width: 260, height: 160 },
    inputs: [{ id: "timeline", type: "timeline", cardinality: "single", required: true }],
    outputs: [],
  }),
  defineNode({
    kind: "review-gate",
    family: "composition",
    defaultSize: { width: 260, height: 160 },
    inputs: [{ id: "subject", type: "flow", cardinality: "single" }],
    outputs: [{ id: "approved", type: "flow", cardinality: "many" }],
  }),
];
