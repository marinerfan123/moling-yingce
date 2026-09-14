import { z } from "zod";

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

export const NodeKindSchema = z.enum(nodeKinds);
export type NodeKind = z.infer<typeof NodeKindSchema>;

export const ResourceKindSchema = z.enum([
  "script",
  "scene",
  "shot",
  "character",
  "location",
  "prop",
  "style",
  "asset",
  "timeline",
]);
export type ResourceKind = z.infer<typeof ResourceKindSchema>;

export const NodeIdSchema = z.string().regex(/^node_[a-zA-Z0-9_-]{8,}$/);
export const EdgeIdSchema = z.string().regex(/^edge_[a-zA-Z0-9_-]{8,}$/);
export const BindingIdSchema = z.string().regex(/^binding_[a-zA-Z0-9_-]{8,}$/);
export const OperationIdSchema = z.string().regex(/^op_[a-zA-Z0-9_-]{8,}$/);

export type NodeId = z.infer<typeof NodeIdSchema>;
export type EdgeId = z.infer<typeof EdgeIdSchema>;

export const PointSchema = z.object({
  x: z.number().finite().min(-1_000_000).max(1_000_000),
  y: z.number().finite().min(-1_000_000).max(1_000_000),
});

export const SizeSchema = z.object({
  width: z.number().finite().min(40).max(4000),
  height: z.number().finite().min(40).max(4000),
});

export const ViewportSchema = z.object({
  x: z.number().finite().min(-1_000_000).max(1_000_000),
  y: z.number().finite().min(-1_000_000).max(1_000_000),
  zoom: z.number().finite().min(0.05).max(8),
});

export type Point = z.infer<typeof PointSchema>;
export type Viewport = z.infer<typeof ViewportSchema>;

export const PortSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["flow", "resource", "media", "audio", "timeline"]),
  cardinality: z.enum(["single", "many"]),
});

const PinnedResourceRefSchema = z
  .object({
    kind: ResourceKindSchema,
    id: z.string().min(1),
    follow: z.literal("pinned"),
    versionId: z.string().min(1),
  })
  .strict();

const LatestResourceRefSchema = z
  .object({
    kind: ResourceKindSchema,
    id: z.string().min(1),
    follow: z.literal("latest"),
  })
  .strict();

export const ResourceRefSchema = z.discriminatedUnion("follow", [PinnedResourceRefSchema, LatestResourceRefSchema]);
export type ResourceRef = z.infer<typeof ResourceRefSchema>;

const domainBackedKinds = new Set<NodeKind>(["script", "scene", "shot", "character", "location", "prop", "style"]);
const forbiddenDomainFields = new Set(["title", "name", "summary", "description", "scriptText", "prompt"]);

export const CanvasNodeSchema = z
  .object({
    id: NodeIdSchema,
    kind: NodeKindSchema,
    position: PointSchema,
    size: SizeSchema.default({ width: 240, height: 160 }),
    data: z.record(z.string(), z.unknown()).default({}),
    resourceRef: ResourceRefSchema.optional(),
    ports: z
      .object({
        inputs: z.array(PortSchema).default([]),
        outputs: z.array(PortSchema).default([]),
      })
      .default({ inputs: [], outputs: [] }),
    editLocked: z.boolean().default(false),
    parentId: NodeIdSchema.optional(),
    relativePosition: PointSchema.optional(),
  })
  .superRefine((node, ctx) => {
    if (domainBackedKinds.has(node.kind)) {
      for (const field of forbiddenDomainFields) {
        if (Object.prototype.hasOwnProperty.call(node.data, field)) {
          ctx.addIssue({
            code: "custom",
            path: ["data", field],
            message: "domain-backed node data cannot contain editable domain fields",
          });
        }
      }
    }
  });

export type CanvasNode = z.infer<typeof CanvasNodeSchema>;

export const EdgeKindSchema = z.enum(["flow", "reference", "timeline"]);
export type EdgeKind = z.infer<typeof EdgeKindSchema>;

export const CanvasEdgeSchema = z
  .object({
    id: EdgeIdSchema,
    source: NodeIdSchema,
    target: NodeIdSchema,
    sourcePort: z.string().min(1).optional(),
    targetPort: z.string().min(1).optional(),
    kind: EdgeKindSchema,
    bindingId: BindingIdSchema.optional(),
  })
  .superRefine((edge, ctx) => {
    if (edge.kind === "reference" && !edge.bindingId) {
      ctx.addIssue({ code: "custom", path: ["bindingId"], message: "reference edges require bindingId" });
    }
  });

export type CanvasEdge = z.infer<typeof CanvasEdgeSchema>;

export const CanvasSnapshotSchema = z.object({
  id: z.string().min(1).default("canvas"),
  schemaVersion: z.literal(1),
  viewport: ViewportSchema.default({ x: 0, y: 0, zoom: 1 }),
  nodes: z.array(CanvasNodeSchema),
  edges: z.array(CanvasEdgeSchema),
  meta: z
    .object({
      createdAt: z.string().optional(),
      updatedAt: z.string().optional(),
      title: z.string().optional(),
    })
    .default({}),
});

export type CanvasSnapshot = z.infer<typeof CanvasSnapshotSchema>;

const CommandBaseSchema = z.object({
  operationId: OperationIdSchema,
});

export const CanvasCommandSchema = z.discriminatedUnion("type", [
  CommandBaseSchema.extend({ type: z.literal("node.add"), node: CanvasNodeSchema }),
  CommandBaseSchema.extend({ type: z.literal("node.move"), positions: z.record(NodeIdSchema, PointSchema) }),
  CommandBaseSchema.extend({ type: z.literal("node.configure"), nodeId: NodeIdSchema, patch: z.unknown() }),
  CommandBaseSchema.extend({ type: z.literal("node.remove"), nodeIds: z.array(NodeIdSchema).min(1) }),
  CommandBaseSchema.extend({ type: z.literal("edge.connect"), edge: CanvasEdgeSchema }),
  CommandBaseSchema.extend({ type: z.literal("edge.disconnect"), edgeId: EdgeIdSchema }),
  CommandBaseSchema.extend({ type: z.literal("group.set"), parentId: NodeIdSchema, childIds: z.array(NodeIdSchema) }),
  CommandBaseSchema.extend({ type: z.literal("projection.upsert"), node: CanvasNodeSchema }),
]);

export type CanvasCommand = z.infer<typeof CanvasCommandSchema>;
