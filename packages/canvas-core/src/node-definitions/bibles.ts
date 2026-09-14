import { defineNode } from "./types.js";

export const biblesNodeDefinitions = [
  defineNode({
    kind: "character",
    family: "bibles",
    defaultSize: { width: 240, height: 160 },
    inputs: [],
    outputs: [{ id: "ref", type: "resource", cardinality: "many" }],
  }),
  defineNode({
    kind: "location",
    family: "bibles",
    defaultSize: { width: 240, height: 160 },
    inputs: [],
    outputs: [{ id: "ref", type: "resource", cardinality: "many" }],
  }),
  defineNode({
    kind: "prop",
    family: "bibles",
    defaultSize: { width: 220, height: 140 },
    inputs: [],
    outputs: [{ id: "ref", type: "resource", cardinality: "many" }],
  }),
  defineNode({
    kind: "style",
    family: "bibles",
    defaultSize: { width: 220, height: 140 },
    inputs: [],
    outputs: [{ id: "ref", type: "resource", cardinality: "many" }],
  }),
];
