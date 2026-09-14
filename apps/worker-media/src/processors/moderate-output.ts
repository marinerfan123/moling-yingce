import { once, type ProcessorContext } from "./shared.js";
export type OutputModerationRecord = Readonly<{
  id: string;
  assetVersionId: string;
  status: "needs_review" | "approved" | "rejected";
  evidenceHash: string;
}>;
export function moderateOutput(
  assetVersionId: string,
  evidenceHash: string,
  ctx: ProcessorContext,
): OutputModerationRecord {
  return once(ctx, "moderate-output", () => ({
    id: `mod_${ctx.eventId}`,
    assetVersionId,
    status: "needs_review",
    evidenceHash,
  }));
}
