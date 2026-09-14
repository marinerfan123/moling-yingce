import type { OfflineDatabase } from "./indexed-db.js";

export type GenerationIntent = Readonly<{
  id: string;
  tenantId: string;
  projectId: string;
  canvasId: string;
  nodeId: string;
  durableBaseline: string;
  requestedCapability: "image" | "video" | "voice" | "text";
  expiresAt: string;
  status: "offline-draft" | "revalidating" | "changed-awaiting-confirmation" | "submitted" | "expired" | "unauthorized";
}>;

export class GenerationIntentStore {
  constructor(private readonly db: OfflineDatabase) {}

  save(intent: GenerationIntent) {
    const forbidden = ["confirmedPrice", "jobId"].filter((key) => Object.prototype.hasOwnProperty.call(intent, key));
    if (forbidden.length > 0) throw new Error(`OFFLINE_INTENT_FORBIDDEN_FIELDS ${forbidden.join(",")}`);
    this.db.put("generationIntents", {
      id: intent.id,
      tenantId: intent.tenantId,
      projectId: intent.projectId,
      updatedAt: new Date().toISOString(),
      value: structuredClone(intent),
    });
  }

  revalidate(
    intent: GenerationIntent,
    input: {
      now: Date;
      authFresh: boolean;
      canvasSessionFresh: boolean;
      baselineChanged: boolean;
      estimateChanged: boolean;
    },
  ) {
    if (new Date(intent.expiresAt).getTime() <= input.now.getTime()) return { ...intent, status: "expired" as const };
    if (!input.authFresh || !input.canvasSessionFresh) return { ...intent, status: "unauthorized" as const };
    if (input.baselineChanged || input.estimateChanged)
      return { ...intent, status: "changed-awaiting-confirmation" as const };
    return { ...intent, status: "revalidating" as const };
  }
}
