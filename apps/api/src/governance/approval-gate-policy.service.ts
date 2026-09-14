export type GateSubject = Readonly<{ projectId: string; kind: string; id: string; aiGenerated?: boolean }>;
export type GateDecision = Readonly<{ allow: boolean; reasons: readonly string[]; disclosureLabel?: string }>;

export class ApprovalGatePolicyService {
  readonly #approvedRights = new Set<string>();
  readonly #approvedModeration = new Set<string>();
  readonly #disclosures = new Map<string, { labelText: "本内容包含AI生成元素"; signed: true }>();

  recordRights(subject: GateSubject, decision: "approved" | "restricted" | "rejected" | "expired") {
    if (decision === "approved") this.#approvedRights.add(this.key(subject));
  }

  recordModeration(subject: GateSubject, decision: "approved" | "needs_review" | "rejected") {
    if (decision === "approved") this.#approvedModeration.add(this.key(subject));
  }

  signDisclosurePolicy(
    projectId: string,
    policy = { labelText: "本内容包含AI生成元素" as const, signed: true as const },
  ) {
    this.#disclosures.set(projectId, policy);
    return policy;
  }

  evaluatePaidGenerationOrExport(subject: GateSubject): GateDecision {
    const reasons: string[] = [];
    const key = this.key(subject);
    if (!this.#approvedRights.has(key)) reasons.push("RIGHTS_DECISION_REQUIRED");
    if (!this.#approvedModeration.has(key)) reasons.push("MODERATION_DECISION_REQUIRED");
    const disclosure = this.#disclosures.get(subject.projectId);
    if (subject.aiGenerated && !disclosure) reasons.push("AI_DISCLOSURE_POLICY_REQUIRED");
    const decision: GateDecision = { allow: reasons.length === 0, reasons };
    return disclosure ? { ...decision, disclosureLabel: disclosure.labelText } : decision;
  }

  assertWaiverAllowed(requirement: string) {
    if (["statutory_rights", "mandatory_ai_disclosure"].includes(requirement)) {
      throw new Error("GOVERNANCE_WAIVER_NOT_ALLOWED");
    }
    return true;
  }

  private key(subject: GateSubject) {
    return `${subject.projectId}:${subject.kind}:${subject.id}`;
  }
}
