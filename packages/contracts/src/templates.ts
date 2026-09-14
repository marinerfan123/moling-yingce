import { z } from "zod";

import { CanvasCommandSchema, CanvasEdgeSchema, CanvasNodeSchema } from "./canvas.js";

export const TemplateIdSchema = z.string().regex(/^[a-z0-9][a-z0-9-]*$/);
export const TemplateVersionSchema = z.string().regex(/^\d+\.\d+\.\d+$/);
export const TemplateChecksumSchema = z.string().regex(/^[a-f0-9]{64}$/);

/** A signed, read-only canvas starter. It can propose edits, but cannot execute them. */
export const CanvasTemplateSchema = z
  .object({
    templateId: TemplateIdSchema,
    version: TemplateVersionSchema,
    checksum: TemplateChecksumSchema,
    name: z.string().min(1),
    nodes: z.array(CanvasNodeSchema).min(1),
    edges: z.array(CanvasEdgeSchema),
    capabilities: z.array(z.never()).default([]),
    proposals: z.array(CanvasCommandSchema).default([]),
    resourcePolicy: z.literal("confirm").default("confirm"),
    createsJobs: z.literal(false).default(false),
  })
  .strict();

export type CanvasTemplate = z.infer<typeof CanvasTemplateSchema>;
export type TemplateProposal = z.infer<typeof CanvasCommandSchema>;
