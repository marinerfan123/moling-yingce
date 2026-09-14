import { createHash } from "node:crypto";

import { ApprovalGatePolicyService, type GateSubject } from "./approval-gate-policy.service.js";

export type Principal = Readonly<{
  tenantId: string;
  userId: string;
  memberships: readonly { projectId: string; active: boolean; capabilities?: readonly string[] }[];
}>;

const id = (prefix: string, seed: string) =>
  `${prefix}_${createHash("sha256").update(seed).digest("hex").slice(0, 16)}`;

export class RightsService {
  readonly #records: unknown[] = [];

  constructor(private readonly gates = new ApprovalGatePolicyService()) {}

  appendRightsRecord(
    principal: Principal,
    subject: GateSubject,
    input: {
      owner: string;
      license: string;
      evidenceSha256: string;
      decision: "approved" | "restricted" | "rejected" | "expired";
      reason: string;
    },
  ) {
    this.assertRightsManage(principal, subject.projectId);
    const record = {
      id: id("rights", `${subject.projectId}:${subject.kind}:${subject.id}:${this.#records.length + 1}`),
      version: this.#records.length + 1,
      subject,
      ...input,
      actorUserId: principal.userId,
      createdAt: new Date().toISOString(),
    };
    this.#records.push(record);
    this.gates.recordRights(subject, input.decision);
    return record;
  }

  assertRightsManage(principal: Principal, projectId: string) {
    const membership = principal.memberships.find((item) => item.projectId === projectId && item.active);
    if (!membership) throw new Error("PROJECT_MEMBERSHIP_MISSING");
    if (!membership.capabilities?.includes("rights:manage")) throw new Error("RIGHTS_MANAGE_REQUIRED");
    return true;
  }
}
