export const nodeKinds = [
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
] as const;

export type NodeKind = (typeof nodeKinds)[number];
export type PortType = "flow" | "resource" | "media" | "audio" | "timeline";

export type PortDefinition = Readonly<{
  id: string;
  type: PortType;
  cardinality: "single" | "many";
  required?: boolean;
}>;

export type NodeDefinition = Readonly<{
  kind: NodeKind;
  family: "content" | "bibles" | "media" | "audio" | "composition" | "auxiliary";
  defaultSize: { width: number; height: number };
  inputs: readonly PortDefinition[];
  outputs: readonly PortDefinition[];
  readOnly?: boolean;
  migrate(data: Record<string, unknown>): Record<string, unknown>;
}>;

export type CanvasNodeLike = Readonly<{
  id: string;
  kind: NodeKind;
  data?: Record<string, unknown>;
}>;

export type CanvasEdgeLike = Readonly<{
  id: string;
  source: string;
  target: string;
  sourcePort?: string;
  targetPort?: string;
  kind: "flow" | "reference" | "timeline";
}>;

export type CanvasSnapshotLike = Readonly<{
  schemaVersion?: number;
  nodes: readonly CanvasNodeLike[];
  edges: readonly CanvasEdgeLike[];
}>;

export function defineNode(
  definition: Omit<NodeDefinition, "migrate"> & Partial<Pick<NodeDefinition, "migrate">>,
): NodeDefinition {
  return {
    ...definition,
    migrate: definition.migrate ?? ((data) => data),
  };
}
