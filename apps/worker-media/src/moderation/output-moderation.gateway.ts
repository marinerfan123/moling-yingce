import type { OutputModerationRecord } from "../processors/moderate-output.js";
export interface OutputModerationGateway {
  recordBeforePromotion(assetVersionId: string, evidenceHash: string): OutputModerationRecord;
}
export function createOutputModerationGateway(): OutputModerationGateway {
  const records = new Map<string, OutputModerationRecord>();
  return {
    recordBeforePromotion(assetVersionId, evidenceHash) {
      const existing = records.get(assetVersionId);
      if (existing) return existing;
      const record = { id: `mod_${assetVersionId}`, assetVersionId, status: "needs_review" as const, evidenceHash };
      records.set(assetVersionId, record);
      return record;
    },
  };
}
