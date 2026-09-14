import { ApprovalGatePolicyService, type GateSubject } from "./approval-gate-policy.service.js";

export class ModerationGateway {
  constructor(private readonly gates = new ApprovalGatePolicyService()) {}

  recordDecision(
    subject: GateSubject,
    input: { stage: "input" | "output"; evidenceSha256: string; decision: "approved" | "needs_review" | "rejected" },
  ) {
    this.gates.recordModeration(subject, input.decision);
    return {
      subject,
      stage: input.stage,
      decision: input.decision,
      evidenceSha256: input.evidenceSha256,
      providerPayload: undefined,
    };
  }
}
