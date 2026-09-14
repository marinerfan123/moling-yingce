import type { NodeKind } from "../node-definitions/types.js";

type TemplateNode = {
  id: string;
  kind: NodeKind;
  position: { x: number; y: number };
  size: { width: number; height: number };
  data: Record<string, unknown>;
  ports: { inputs: []; outputs: [] };
  editLocked: boolean;
};
type TemplateEdge = {
  id: string;
  source: string;
  target: string;
  sourcePort?: string;
  targetPort?: string;
  kind: "flow" | "reference" | "timeline";
};
export type CanvasTemplate = {
  templateId: string;
  version: string;
  checksum: string;
  name: string;
  nodes: readonly TemplateNode[];
  edges: readonly TemplateEdge[];
  capabilities: readonly never[];
  proposals: readonly {
    type: "node.add" | "edge.connect";
    operationId: string;
    node?: TemplateNode;
    edge?: TemplateEdge;
  }[];
  resourcePolicy: "confirm";
  createsJobs: false;
};

const node = (id: string, kind: NodeKind, x: number, y: number): TemplateNode => ({
  id,
  kind,
  position: { x, y },
  size: { width: 260, height: 160 },
  data: { template: "vertical-comic" },
  ports: { inputs: [], outputs: [] },
  editLocked: false,
});

const nodes = [
  node("node_script01", "script", 0, 0),
  node("node_scene01", "scene", 360, 0),
  node("node_bibles1", "character", 0, 280),
  node("node_shot001", "shot", 720, 0),
  node("node_image01", "image-generation", 1080, -120),
  node("node_video01", "video-generation", 1080, 120),
  node("node_voice01", "voice-generation", 1080, 360),
  node("node_caption", "caption", 720, 360),
  node("node_timeline", "timeline-output", 1440, 0),
  node("node_export01", "export", 1800, 0),
  node("node_review01", "review-gate", 1800, 300),
] as const;

const edges = [
  {
    id: "edge_script01",
    source: "node_script01",
    target: "node_scene01",
    sourcePort: "scenes",
    targetPort: "script",
    kind: "flow" as const,
  },
  {
    id: "edge_scene01",
    source: "node_scene01",
    target: "node_shot001",
    sourcePort: "shots",
    targetPort: "scene",
    kind: "flow" as const,
  },
  {
    id: "edge_shotimg",
    source: "node_shot001",
    target: "node_image01",
    sourcePort: "frames",
    targetPort: "prompt",
    kind: "flow" as const,
  },
  {
    id: "edge_shotvid",
    source: "node_shot001",
    target: "node_video01",
    sourcePort: "frames",
    targetPort: "prompt",
    kind: "flow" as const,
  },
  {
    id: "edge_shotvoice",
    source: "node_shot001",
    target: "node_voice01",
    sourcePort: "frames",
    targetPort: "script",
    kind: "flow" as const,
  },
  {
    id: "edge_shotcaption",
    source: "node_shot001",
    target: "node_caption",
    sourcePort: "frames",
    targetPort: "script",
    kind: "flow" as const,
  },
  {
    id: "edge_timelineexport",
    source: "node_timeline",
    target: "node_export01",
    sourcePort: "timeline",
    targetPort: "timeline",
    kind: "timeline" as const,
  },
] as const;

export const verticalComicTemplate: CanvasTemplate = {
  templateId: "vertical-comic",
  version: "1.0.0",
  checksum: "f6a3f1b93d5b4c1c9a3a2d1e0f8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a00",
  name: "Vertical comic drama",
  nodes: [...nodes],
  edges: [...edges],
  capabilities: [],
  proposals: [
    ...nodes.map((templateNode, index) => ({
      type: "node.add" as const,
      operationId: `op_template${String(index + 1).padStart(2, "0")}`,
      node: templateNode,
    })),
    ...edges.map((edge, index) => ({
      type: "edge.connect" as const,
      operationId: `op_edge${String(index + 1).padStart(2, "0")}`,
      edge,
    })),
  ],
  resourcePolicy: "confirm",
  createsJobs: false,
};

export const VERTICAL_COMIC_TEMPLATE_ID = verticalComicTemplate.templateId;
export const VERTICAL_COMIC_TEMPLATE_VERSION = verticalComicTemplate.version;
export const VERTICAL_COMIC_TEMPLATE_CHECKSUM = verticalComicTemplate.checksum;
