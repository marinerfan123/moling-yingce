import { defineNode } from "./types.js";

export const auxiliaryNodeDefinitions = [
  defineNode({ kind: "note", family: "auxiliary", defaultSize: { width: 220, height: 140 }, inputs: [], outputs: [] }),
  defineNode({
    kind: "unknown",
    family: "auxiliary",
    defaultSize: { width: 220, height: 140 },
    inputs: [],
    outputs: [],
    readOnly: true,
  }),
];
