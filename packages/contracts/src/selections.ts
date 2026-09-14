import { z } from "zod";

import { AssetVersionIdSchema } from "./assets.js";
import { NodeIdSchema } from "./canvas.js";
import { JobIdSchema, ProjectIdSchema, TenantIdSchema, UserIdSchema } from "./ids.js";

const opaqueId = (prefix: string) =>
  z.string().regex(new RegExp(`^${prefix}_[a-zA-Z0-9][a-zA-Z0-9_-]{7,}$`), `${prefix} id must be opaque and prefixed`);
const Sha256Schema = z.string().regex(/^sha256:[a-f0-9]{64}$/);

export const SelectionIdSchema = opaqueId("selection");
export const SelectionSubjectSchema = z
  .object({
    projectId: ProjectIdSchema,
    shotNodeId: NodeIdSchema,
  })
  .strict()
  .readonly();

export const SelectionRecordSchema = z
  .object({
    id: SelectionIdSchema,
    tenantId: TenantIdSchema,
    projectId: ProjectIdSchema,
    shotNodeId: NodeIdSchema,
    assetVersionId: AssetVersionIdSchema,
    sourceJobId: JobIdSchema,
    outputState: z.literal("ready"),
    inputSnapshotHash: Sha256Schema,
    selectedBy: UserIdSchema,
    selectedAt: z.string().datetime(),
    supersedesSelectionId: SelectionIdSchema.nullable(),
    approvalState: z.literal("not_approval"),
  })
  .strict()
  .readonly()
  .superRefine((selection, ctx) => {
    if (selection.supersedesSelectionId === selection.id) {
      ctx.addIssue({ code: "custom", path: ["supersedesSelectionId"], message: "selection cannot supersede itself" });
    }
  });

export const CurrentSelectionPointerSchema = z
  .object({
    tenantId: TenantIdSchema,
    projectId: ProjectIdSchema,
    shotNodeId: NodeIdSchema,
    currentSelectionId: SelectionIdSchema,
    assetVersionId: AssetVersionIdSchema,
    updatedAt: z.string().datetime(),
  })
  .strict()
  .readonly();

export type SelectionId = z.infer<typeof SelectionIdSchema>;
export type SelectionSubject = z.infer<typeof SelectionSubjectSchema>;
export type SelectionRecord = z.infer<typeof SelectionRecordSchema>;
export type CurrentSelectionPointer = z.infer<typeof CurrentSelectionPointerSchema>;

export function selectionPointerMatchesRecord(pointer: CurrentSelectionPointer, record: SelectionRecord): boolean {
  return (
    pointer.tenantId === record.tenantId &&
    pointer.projectId === record.projectId &&
    pointer.shotNodeId === record.shotNodeId &&
    pointer.currentSelectionId === record.id &&
    pointer.assetVersionId === record.assetVersionId
  );
}
