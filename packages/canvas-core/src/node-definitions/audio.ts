import { defineNode } from "./types.js";

export const audioNodeDefinitions = [
  defineNode({
    kind: "voice-generation",
    family: "audio",
    defaultSize: { width: 300, height: 160 },
    inputs: [{ id: "script", type: "flow", cardinality: "single" }],
    outputs: [{ id: "voice", type: "audio", cardinality: "many" }],
  }),
  defineNode({
    kind: "audio",
    family: "audio",
    defaultSize: { width: 220, height: 120 },
    inputs: [],
    outputs: [{ id: "audio", type: "audio", cardinality: "many" }],
  }),
  defineNode({
    kind: "caption",
    family: "audio",
    defaultSize: { width: 220, height: 120 },
    inputs: [{ id: "script", type: "flow", cardinality: "single" }],
    outputs: [{ id: "caption", type: "timeline", cardinality: "many" }],
  }),
];
