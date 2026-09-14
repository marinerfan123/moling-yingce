import { describe, expect, it } from "vitest";

import { appRoutes } from "../app/router.js";
import { exportEncryptedBackup, importEncryptedBackup, previewEncryptedBackup, type BackupScope } from "./backup.js";
import { createCollabProvider } from "./collab-provider.js";
import { DraftStore } from "./draft-store.js";
import { GenerationIntentStore, type GenerationIntent } from "./generation-intent-store.js";
import { OfflineDatabase } from "./indexed-db.js";
import { ReconnectCoordinator } from "./reconnect-coordinator.js";
import { registerRecoveryServiceWorker, serviceWorkerManifest } from "./service-worker.js";

const scope: BackupScope = {
  tenantId: "tenant_12345678",
  projectId: "project_12345678",
  canvasId: "canvas_12345678",
  schemaVersion: 1,
};

const intent: GenerationIntent = {
  id: "intent_12345678",
  tenantId: scope.tenantId,
  projectId: scope.projectId,
  canvasId: scope.canvasId,
  nodeId: "node_12345678",
  durableBaseline: "epoch1:seq1",
  requestedCapability: "image",
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
  status: "offline-draft",
};

describe("offline recovery", () => {
  it("recovers exact offline canvas and composer drafts after reload", () => {
    const db = new OfflineDatabase();
    const drafts = new DraftStore(db);
    drafts.saveCanvasDoc({ ...scope, yjsUpdate: "update-base64", schemaVersion: 1 });
    drafts.saveComposerDraft({
      tenantId: scope.tenantId,
      projectId: scope.projectId,
      draftId: "draft_1",
      text: "离线写下的台词",
    });
    expect(drafts.recoverCanvasDoc(scope.canvasId)?.value).toEqual({ yjsUpdate: "update-base64", schemaVersion: 1 });
    expect(db.get("composerDrafts", "draft_1")?.value).toEqual({ text: "离线写下的台词" });
  });

  it("exports, previews and imports encrypted backup atomically", async () => {
    const source = new OfflineDatabase();
    const drafts = new DraftStore(source);
    drafts.saveCanvasDoc({ ...scope, yjsUpdate: "update-base64" });
    new GenerationIntentStore(source).save(intent);
    const backup = await exportEncryptedBackup(source, scope, "correct horse battery staple");
    const preview = await previewEncryptedBackup(backup, "correct horse battery staple", scope);
    expect(preview.counts).toMatchObject({ canvasDocs: 1, generationIntents: 1 });
    const target = new OfflineDatabase();
    await expect(importEncryptedBackup(target, backup, "correct horse battery staple", scope)).resolves.toMatchObject({
      imported: true,
    });
    expect(target.counts()).toMatchObject({ canvasDocs: 1, generationIntents: 1 });
  });

  it("rejects wrong passphrase, tamper, truncated data, schema downgrade and cross-scope before writes", async () => {
    const source = new OfflineDatabase();
    new DraftStore(source).saveCanvasDoc({ ...scope, yjsUpdate: "update-base64" });
    const backup = await exportEncryptedBackup(source, scope, "passphrase");
    const empty = new OfflineDatabase();
    await expect(importEncryptedBackup(empty, backup, "wrong", scope)).rejects.toThrow(/BACKUP_DECRYPT_FAILED/);
    await expect(importEncryptedBackup(empty, backup.slice(0, -10), "passphrase", scope)).rejects.toThrow();
    const tampered = JSON.parse(backup) as { header: Record<string, unknown>; ciphertext: string };
    tampered.header["projectId"] = "project_87654321";
    await expect(importEncryptedBackup(empty, JSON.stringify(tampered), "passphrase", scope)).rejects.toThrow(
      /BACKUP_SCOPE_MISMATCH|BACKUP_DECRYPT_FAILED/,
    );
    const downgraded = JSON.parse(backup) as { header: Record<string, unknown>; ciphertext: string };
    downgraded.header["schemaVersion"] = 0;
    await expect(importEncryptedBackup(empty, JSON.stringify(downgraded), "passphrase", scope)).rejects.toThrow(
      /BACKUP_SCHEMA_UNSUPPORTED/,
    );
    expect(empty.counts()).toMatchObject({
      canvasDocs: 0,
      composerDrafts: 0,
      generationIntents: 0,
      recoveryMetadata: 0,
    });
  });

  it("retains offline intents but never submits without fresh auth, session, estimate diff and confirmation", () => {
    const db = new OfflineDatabase();
    const store = new GenerationIntentStore(db);
    store.save(intent);
    const coordinator = new ReconnectCoordinator(store);
    expect(
      coordinator.reconnect(intent, {
        authFresh: false,
        canvasSessionFresh: true,
        baselineChanged: false,
        estimateChanged: false,
        userConfirmed: true,
      }),
    ).toMatchObject({
      submitted: false,
      intent: { status: "unauthorized" },
    });
    expect(
      coordinator.reconnect(intent, {
        authFresh: true,
        canvasSessionFresh: true,
        baselineChanged: true,
        estimateChanged: true,
        userConfirmed: false,
      }),
    ).toMatchObject({
      submitted: false,
      intent: { status: "changed-awaiting-confirmation" },
    });
    expect(
      coordinator.reconnect(intent, {
        authFresh: true,
        canvasSessionFresh: true,
        baselineChanged: false,
        estimateChanged: false,
        userConfirmed: true,
      }),
    ).toMatchObject({
      submitted: true,
      intent: { status: "submitted" },
    });
  });

  it("creates scoped collab provider, service worker shell registration and recovery route", async () => {
    expect(
      createCollabProvider({
        wsUrl: "wss://collab.example.com/collab",
        session: {
          token: "token",
          canvasId: scope.canvasId,
          capabilities: ["read"],
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        },
      }),
    ).toMatchObject({
      readOnly: true,
    });
    await expect(registerRecoveryServiceWorker({ register: async () => ({}) })).resolves.toMatchObject({
      registered: true,
    });
    expect(serviceWorkerManifest.forbidden).toContain("tokens");
    expect(appRoutes).toContain("/recovery");
  });
});
