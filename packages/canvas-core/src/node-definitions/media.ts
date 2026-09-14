import { defineNode } from "./types.js";

export const mediaNodeDefinitions = [
  defineNode({
    kind: "asset-input",
    family: "media",
    defaultSize: { width: 260, height: 160 },
    inputs: [],
    outputs: [{ id: "asset", type: "media", cardinality: "many" }],
  }),
  defineNode({
    kind: "image-generation",
    family: "media",
    defaultSize: { width: 300, height: 180 },
    inputs: [{ id: "prompt", type: "flow", cardinality: "single" }],
    outputs: [{ id: "image", type: "media", cardinality: "many" }],
  }),
  defineNode({
    kind: "video-generation",
    family: "media",
    defaultSize: { width: 300, height: 180 },
    inputs: [{ id: "prompt", type: "flow", cardinality: "single" }],
    outputs: [{ id: "video", type: "media", cardinality: "many" }],
  }),
  defineNode({
    kind: "frame",
    family: "media",
    defaultSize: { width: 220, height: 180 },
    inputs: [{ id: "image", type: "media", cardinality: "single" }],
    outputs: [{ id: "frame", type: "media", cardinality: "many" }],
  }),
];
