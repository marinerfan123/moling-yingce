import { z } from "zod";

import { OperationIdSchema } from "./canvas.js";
import { ScriptIdSchema, ScriptRevisionIdSchema } from "./projects.js";

const opaqueId = (prefix: string) =>
  z.string().regex(new RegExp(`^${prefix}_[a-zA-Z0-9][a-zA-Z0-9_-]{7,}$`), `${prefix} id must be opaque and prefixed`);

export const SceneIdSchema = opaqueId("scene");
export const BeatIdSchema = opaqueId("beat");
export const ShotIdSchema = opaqueId("shot");
export const LineIdSchema = opaqueId("line");

const StableLineSchema = z
  .object({
    id: LineIdSchema,
    speaker: z.string().trim().min(1).max(80),
    text: z.string().trim().min(1).max(2_000),
  })
  .strict();

const StableShotSchema = z
  .object({
    id: ShotIdSchema,
    description: z.string().trim().min(1).max(2_000),
    lines: z.array(StableLineSchema).default([]),
  })
  .strict();

const StableBeatSchema = z
  .object({
    id: BeatIdSchema,
    summary: z.string().trim().min(1).max(1_000),
    shots: z.array(StableShotSchema).default([]),
  })
  .strict();

const StableSceneSchema = z
  .object({
    id: SceneIdSchema,
    title: z.string().trim().min(1).max(160),
    beats: z.array(StableBeatSchema).default([]),
  })
  .strict();

export const ScriptAggregateSchema = z
  .object({
    scriptId: ScriptIdSchema,
    headRevisionId: ScriptRevisionIdSchema,
    sourceSha256: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    scenes: z.array(StableSceneSchema),
  })
  .strict();

export const ScriptRevisionSchema = z
  .object({
    id: ScriptRevisionIdSchema,
    scriptId: ScriptIdSchema,
    parentRevisionId: ScriptRevisionIdSchema.nullable(),
    canonicalSha256: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    sourceSha256: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    createdAt: z.string().datetime(),
    operationId: OperationIdSchema,
    aggregate: ScriptAggregateSchema,
  })
  .strict();

const CommandBaseSchema = z.object({ operationId: OperationIdSchema });

export const ScriptCommandSchema = z.discriminatedUnion("type", [
  CommandBaseSchema.extend({
    type: z.literal("scene.rename"),
    sceneId: SceneIdSchema,
    title: z.string().min(1).max(160),
  }),
  CommandBaseSchema.extend({ type: z.literal("line.edit"), lineId: LineIdSchema, text: z.string().min(1).max(2_000) }),
  CommandBaseSchema.extend({
    type: z.literal("shot.describe"),
    shotId: ShotIdSchema,
    description: z.string().min(1).max(2_000),
  }),
]);

export const SaveScriptRequestSchema = z
  .object({
    expectedHeadRevisionId: ScriptRevisionIdSchema,
    operationId: OperationIdSchema,
    commands: z.array(ScriptCommandSchema).min(1).max(100),
  })
  .strict();

export const RestoreScriptRevisionRequestSchema = z
  .object({
    expectedHeadRevisionId: ScriptRevisionIdSchema,
    restoreRevisionId: ScriptRevisionIdSchema,
    operationId: OperationIdSchema,
  })
  .strict();

export const ScriptConflictSchema = z
  .object({
    status: z.literal(409),
    reason: z.literal("SCRIPT_HEAD_CONFLICT"),
    baseRevisionId: ScriptRevisionIdSchema,
    headRevisionId: ScriptRevisionIdSchema,
    localOperationId: OperationIdSchema,
  })
  .strict();

export type ScriptAggregate = z.infer<typeof ScriptAggregateSchema>;
export type ScriptRevision = z.infer<typeof ScriptRevisionSchema>;
export type ScriptCommand = z.infer<typeof ScriptCommandSchema>;
