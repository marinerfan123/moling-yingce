import { randomUUID } from "node:crypto";

export type SelectionsPrincipal = Readonly<{
  tenantId: string;
  userId: string;
  memberships: readonly { projectId: string; active: boolean; capabilities?: readonly string[]; role?: string }[];
}>;

export type AppendSelectionInput = Readonly<{
  projectId: string;
  shotNodeId: string;
  assetVersionId: string;
  sourceJobId: string;
  outputState: "ready" | "quarantine" | "failed";
  inputSnapshotHash: string;
}>;

export class SelectionsService {
  readonly #records: unknown[] = [];
  readonly #heads = new Map<string, unknown>();

  append(principal: SelectionsPrincipal, input: AppendSelectionInput) {
    this.assertAccess(principal, input.projectId);
    if (input.outputState !== "ready") throw new Error("SELECTION_OUTPUT_NOT_READY");
    const previous = this.#heads.get(this.headKey(principal.tenantId, input.projectId, input.shotNodeId)) as
      | { currentSelectionId: string }
      | undefined;
    const record = {
      id: `selection_${randomUUID().replaceAll("-", "").slice(0, 24)}`,
      tenantId: principal.tenantId,
      projectId: input.projectId,
      shotNodeId: input.shotNodeId,
      assetVersionId: input.assetVersionId,
      sourceJobId: input.sourceJobId,
      outputState: "ready" as const,
      inputSnapshotHash: input.inputSnapshotHash,
      selectedBy: principal.userId,
      selectedAt: new Date().toISOString(),
      supersedesSelectionId: previous?.currentSelectionId ?? null,
      approvalState: "not_approval" as const,
    };
    this.#records.push(record);
    const pointer = {
      tenantId: principal.tenantId,
      projectId: input.projectId,
      shotNodeId: input.shotNodeId,
      currentSelectionId: record.id,
      assetVersionId: input.assetVersionId,
      updatedAt: record.selectedAt,
    };
    this.#heads.set(this.headKey(principal.tenantId, input.projectId, input.shotNodeId), pointer);
    return { record, pointer };
  }

  current(principal: SelectionsPrincipal, input: Readonly<{ projectId: string; shotNodeId: string }>) {
    this.assertAccess(principal, input.projectId);
    return this.#heads.get(this.headKey(principal.tenantId, input.projectId, input.shotNodeId)) ?? null;
  }

  private assertAccess(principal: SelectionsPrincipal, projectId: string) {
    if (!principal.memberships.some((membership) => membership.projectId === projectId && membership.active)) {
      throw new Error("PROJECT_MEMBERSHIP_MISSING");
    }
  }

  private headKey(tenantId: string, projectId: string, shotNodeId: string) {
    return `${tenantId}:${projectId}:${shotNodeId}`;
  }
}
