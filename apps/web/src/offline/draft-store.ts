import type { OfflineDatabase } from "./indexed-db.js";

export class DraftStore {
  constructor(private readonly db: OfflineDatabase) {}

  saveCanvasDoc(input: {
    tenantId: string;
    projectId: string;
    canvasId: string;
    yjsUpdate: string;
    schemaVersion?: number;
  }) {
    this.db.put("canvasDocs", {
      id: input.canvasId,
      tenantId: input.tenantId,
      projectId: input.projectId,
      updatedAt: new Date().toISOString(),
      value: { yjsUpdate: input.yjsUpdate, schemaVersion: input.schemaVersion ?? 1 },
    });
  }

  saveComposerDraft(input: { tenantId: string; projectId: string; draftId: string; text: string }) {
    this.db.put("composerDrafts", {
      id: input.draftId,
      tenantId: input.tenantId,
      projectId: input.projectId,
      updatedAt: new Date().toISOString(),
      value: { text: input.text },
    });
  }

  recoverCanvasDoc(canvasId: string) {
    return this.db.get("canvasDocs", canvasId);
  }
}
