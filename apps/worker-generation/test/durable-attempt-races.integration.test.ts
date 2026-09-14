import { describe, expect, it } from "vitest";

import { InMemoryAttemptStore } from "../src/attempt-service.js";
import { CancellationService } from "../src/cancellation-service.js";
import { JobProcessor } from "../src/job-processor.js";

const sha = (char: string) => `sha256:${char.repeat(64)}`;

describe("durable provider attempt crashes and races", () => {
  it("persists transport checkpoints only when the adapter reports invoke and bytes started", async () => {
    const store = new InMemoryAttemptStore();
    let submitCount = 0;
    const processor = new JobProcessor({
      attempts: store,
      adapter: {
        providerKey: "provider",
        recoveryMode: "client-reference-query",
        validate: () => ({ ok: true }),
        submit: async (_input, transport) => {
          submitCount += 1;
          expect(store.all()[0]).toMatchObject({ state: "submitted", sendCheckpoint: "definitely_not_sent" });
          await transport.beforeInvoke();
          expect(store.all()[0]).toMatchObject({ state: "submitted", sendCheckpoint: "possibly_sent" });
          await transport.bytesStarted();
          expect(store.all()[0]).toMatchObject({ state: "submitted", sendCheckpoint: "bytes_started" });
          throw new Error("connection reset after bytes started");
        },
        recover: async () => ({ kind: "unknown", reasonCode: "LOOKUP_UNAVAILABLE" }),
        cancel: async () => ({ kind: "unsupported" }),
        parseWebhook: async () => ({ externalId: "external", eventId: "event" }),
        normalizeError: () => ({ code: "CONNECTION_RESET", retryable: true }),
      },
    });

    const attempt = await processor.submit({
      tenantId: "tenant_12345678",
      projectId: "project_12345678",
      jobId: "job_12345678",
      providerConfigId: "providercfg_12345678",
      providerKey: "provider",
      modelKey: "model",
      capability: "image",
      submissionKey: "submission_12345678",
    });
    expect(attempt).toMatchObject({ state: "reconciling", sendCheckpoint: "bytes_started" });
    await processor.recover(attempt.attemptId);
    expect(submitCount).toBe(1);
    expect(store.listEvidence(attempt.attemptId).map((entry) => entry.kind)).toEqual([
      "submit_intent_persisted",
      "submit_invoke_started",
      "submit_bytes_started",
      "submit_transport_ambiguous",
      "recovery_unknown",
    ]);
  });

  it("resumes a persisted definitely-not-sent idempotent attempt with the same Attempt and key", async () => {
    const store = new InMemoryAttemptStore();
    const created = store.createBeforeSubmit({
      tenantId: "tenant_12345678",
      projectId: "project_12345678",
      jobId: "job_12345678",
      providerConfigId: "providercfg_12345678",
      submissionKey: "submission_12345678",
    });
    const submitted = store.transition({
      attemptId: created.attemptId,
      expectedState: "created",
      nextState: "submitted",
      sendCheckpoint: "definitely_not_sent",
      evidence: { kind: "submit_intent_persisted", observedAt: "2026-08-28T00:00:00.000Z", evidenceHash: sha("f") },
    });
    const calls: string[] = [];
    const processor = new JobProcessor({
      attempts: store,
      adapter: {
        providerKey: "provider",
        recoveryMode: "idempotency-key",
        validate: () => ({ ok: true }),
        submit: async (input, transport) => {
          calls.push(String(input["submissionKey"]));
          await transport.beforeInvoke();
          await transport.bytesStarted();
          return { externalId: "external_12345678" };
        },
        recover: async () => ({ kind: "unsupported" }),
        cancel: async () => ({ kind: "unsupported" }),
        parseWebhook: async () => ({ externalId: "external", eventId: "event" }),
        normalizeError: () => ({ code: "UNKNOWN", retryable: true }),
      },
    });

    await expect(
      processor.submit({
        tenantId: submitted.tenantId,
        projectId: submitted.projectId,
        jobId: submitted.jobId,
        providerConfigId: submitted.providerConfigId,
        providerKey: "provider",
        modelKey: "model",
        capability: "image",
        submissionKey: submitted.submissionKey,
      }),
    ).resolves.toMatchObject({
      attemptId: submitted.attemptId,
      state: "accepted",
      sendCheckpoint: "bytes_started",
    });
    expect(calls).toEqual([submitted.submissionKey]);
  });

  it("recovers a persisted client-reference attempt before any possible resubmit", async () => {
    const store = new InMemoryAttemptStore();
    const created = store.createBeforeSubmit({
      tenantId: "tenant_12345678",
      projectId: "project_12345678",
      jobId: "job_12345678",
      providerConfigId: "providercfg_12345678",
      submissionKey: "submission_12345678",
    });
    const submitted = store.transition({
      attemptId: created.attemptId,
      expectedState: "created",
      nextState: "submitted",
      sendCheckpoint: "definitely_not_sent",
      evidence: { kind: "submit_intent_persisted", observedAt: "2026-08-28T00:00:00.000Z", evidenceHash: sha("g") },
    });
    let submitCalls = 0;
    let recoverCalls = 0;
    const processor = new JobProcessor({
      attempts: store,
      adapter: {
        providerKey: "provider",
        recoveryMode: "client-reference-query",
        validate: () => ({ ok: true }),
        submit: async () => {
          submitCalls += 1;
          return { externalId: "duplicate" };
        },
        recover: async () => {
          recoverCalls += 1;
          return { kind: "found", submission: { externalId: "external_12345678" } };
        },
        cancel: async () => ({ kind: "unsupported" }),
        parseWebhook: async () => ({ externalId: "external", eventId: "event" }),
        normalizeError: () => ({ code: "UNKNOWN", retryable: true }),
      },
    });

    await expect(
      processor.submit({
        tenantId: submitted.tenantId,
        projectId: submitted.projectId,
        jobId: submitted.jobId,
        providerConfigId: submitted.providerConfigId,
        providerKey: "provider",
        modelKey: "model",
        capability: "image",
        submissionKey: submitted.submissionKey,
      }),
    ).resolves.toMatchObject({ state: "accepted", externalId: "external_12345678" });
    expect({ submitCalls, recoverCalls }).toEqual({ submitCalls: 0, recoverCalls: 1 });
  });

  it("deduplicates cancellation across service restart and unknown is never auto-retried", async () => {
    const store = new InMemoryAttemptStore();
    const attempt = store.createBeforeSubmit({
      tenantId: "tenant_12345678",
      projectId: "project_12345678",
      jobId: "job_12345678",
      providerConfigId: "providercfg_12345678",
      submissionKey: "submission_12345678",
    });
    store.update(attempt.attemptId, { state: "running", externalId: "external_12345678" });
    let calls = 0;
    const invoke = async () => {
      calls += 1;
      return { kind: "unknown" as const, reasonCode: "TIMEOUT" };
    };

    await new CancellationService(store).execute("cancelop_12345678", attempt.attemptId, invoke);
    const replay = await new CancellationService(store).execute("cancelop_12345678", attempt.attemptId, invoke);
    expect(calls).toBe(1);
    expect(replay).toMatchObject({ attemptId: attempt.attemptId, cancellationState: "unknown" });
    await expect(
      new CancellationService(store).execute("cancelop_12345678", "attempt_other_12345678", invoke),
    ).rejects.toThrow("CANCELLATION_OPERATION_SCOPE_MISMATCH");
  });

  it("reuses a committed cancellation claim when the provider invoke never began", async () => {
    const store = new InMemoryAttemptStore();
    const attempt = store.createBeforeSubmit({
      tenantId: "tenant_12345678",
      projectId: "project_12345678",
      jobId: "job_12345678",
      providerConfigId: "providercfg_12345678",
      submissionKey: "submission_12345678",
    });
    store.update(attempt.attemptId, { state: "running", externalId: "external_12345678" });
    expect(store.beginCancellation("cancelop_12345678", attempt.attemptId)).toEqual({ disposition: "invoke" });
    let calls = 0;

    await expect(
      new CancellationService(store).execute("cancelop_12345678", attempt.attemptId, async () => {
        calls += 1;
        return { kind: "accepted" };
      }),
    ).resolves.toMatchObject({ cancellationState: "acknowledged" });
    expect(calls).toBe(1);
  });

  it("preserves terminal success against a concurrent cancellation result", async () => {
    const store = new InMemoryAttemptStore();
    const attempt = store.createBeforeSubmit({
      tenantId: "tenant_12345678",
      projectId: "project_12345678",
      jobId: "job_12345678",
      providerConfigId: "providercfg_12345678",
      submissionKey: "submission_12345678",
    });
    store.update(attempt.attemptId, { state: "running", externalId: "external_12345678" });
    store.transition({
      attemptId: attempt.attemptId,
      expectedState: "running",
      nextState: "succeeded",
      evidence: { kind: "provider_terminal", observedAt: "2026-08-28T00:00:00.000Z", evidenceHash: sha("c") },
    });

    await expect(
      new CancellationService(store).apply("cancelop_12345678", attempt.attemptId, {
        kind: "already_terminal",
        status: { normalizedStatus: "failed" },
      }),
    ).resolves.toMatchObject({ cancellationState: "acknowledged", terminalStatus: "failed" });
    expect(store.get(attempt.attemptId)).toMatchObject({ state: "succeeded" });
    expect(store.listEvidence(attempt.attemptId).map((entry) => entry.kind)).toContain(
      "cancellation_acknowledged_late_terminal_conflict",
    );
  });

  it("consumes fully-bound absence evidence atomically before creating one replacement", async () => {
    const store = new InMemoryAttemptStore();
    const previous = store.createBeforeSubmit({
      tenantId: "tenant_12345678",
      projectId: "project_12345678",
      jobId: "job_12345678",
      providerConfigId: "providercfg_12345678",
      submissionKey: "submission_previous_12345678",
    });
    store.update(previous.attemptId, { state: "reconciling", sendCheckpoint: "possibly_sent" });
    const processor = new JobProcessor({
      attempts: store,
      adapter: {
        providerKey: "provider",
        recoveryMode: "client-reference-query",
        validate: () => ({ ok: true }),
        submit: async () => ({ externalId: "external" }),
        recover: async () => ({ kind: "unsupported" }),
        cancel: async () => ({ kind: "unsupported" }),
        parseWebhook: async () => ({ externalId: "external", eventId: "event" }),
        normalizeError: () => ({ code: "UNKNOWN", retryable: true }),
      },
    });
    const recovery = {
      kind: "definitively_absent" as const,
      evidence: {
        source: "authoritative_lookup" as const,
        authoritative: true,
        previousAttemptId: previous.attemptId,
        providerConfigId: previous.providerConfigId,
        submissionKey: previous.submissionKey,
        observedAt: "2026-08-28T00:00:00.000Z",
        evidenceHash: sha("d"),
      },
    };
    await processor.recoverAmbiguousSubmission({
      attemptId: previous.attemptId,
      submissionKey: previous.submissionKey,
      recovery,
    });

    await expect(
      processor.createReplacementAttempt(previous.attemptId, { submissionKey: "submission_new_12345678" }, recovery),
    ).resolves.toMatchObject({ submissionKey: "submission_new_12345678", state: "created" });
    await expect(
      processor.createReplacementAttempt(previous.attemptId, { submissionKey: "submission_other_12345678" }, recovery),
    ).rejects.toThrow("GENERATION_ABSENCE_EVIDENCE_ALREADY_CONSUMED");
  });

  it("rejects authoritative absence evidence bound to another provider configuration", async () => {
    const store = new InMemoryAttemptStore();
    const previous = store.createBeforeSubmit({
      tenantId: "tenant_12345678",
      projectId: "project_12345678",
      jobId: "job_12345678",
      providerConfigId: "providercfg_12345678",
      submissionKey: "submission_previous_12345678",
    });
    store.update(previous.attemptId, { state: "reconciling" });
    const processor = new JobProcessor({ attempts: store });

    await expect(
      processor.recoverAmbiguousSubmission({
        attemptId: previous.attemptId,
        submissionKey: previous.submissionKey,
        recovery: {
          kind: "definitively_absent",
          evidence: {
            source: "authoritative_lookup",
            authoritative: true,
            previousAttemptId: previous.attemptId,
            providerConfigId: "providercfg_other_12345678",
            submissionKey: previous.submissionKey,
            observedAt: "2026-08-28T00:00:00.000Z",
            evidenceHash: sha("e"),
          },
        },
      }),
    ).rejects.toThrow("RECOVERY_ABSENCE_EVIDENCE_SCOPE_MISMATCH");
    expect(store.listEvidence(previous.attemptId)).toHaveLength(0);
  });
});
