import { defineNode } from "./types.js";

export const contentNodeDefinitions = [
  defineNode({
    kind: "script",
    family: "content",
    defaultSize: { width: 320, height: 200 },
    inputs: [],
    outputs: [{ id: "scenes", type: "flow", cardinality: "many" }],
  }),
  defineNode({
    kind: "scene",
    family: "content",
    defaultSize: { width: 280, height: 180 },
    inputs: [{ id: "script", type: "flow", cardinality: "single" }],
    outputs: [{ id: "shots", type: "flow", cardinality: "many" }],
  }),
  defineNode({
    kind: "shot",
    family: "content",
    defaultSize: { width: 260, height: 160 },
    inputs: [{ id: "scene", type: "flow", cardinality: "single" }],
    outputs: [{ id: "frames", type: "flow", cardinality: "many" }],
  }),
];
