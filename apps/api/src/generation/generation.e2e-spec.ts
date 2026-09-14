import { describe, expect, it } from "vitest";

import { apiControllers, apiModules } from "../app.module.js";
import { GenerationController } from "./generation.controller.js";
import { GenerationService, type GenerationCreateInput } from "./generation.service.js";
import { JobCancellationService } from "./job-cancellation.service.js";

const principal = {
  tenantId: "tenant_12345678",
  userId: "user_12345678",
  memberships: [
    {
      projectId: "project_12345678",
      active: true,
      role: "Owner",
      capabilities: ["generation:spend"],
    },
  ],
} as const;

const validInput: GenerationCreateInput = {
  projectId: "project_12345678",
  modelId: "model_12345678",
  capability: "image",
  currency: "USD",
  activeCanvasRevisionId: "canvasrev_12345678",
  documentEpoch: 1,
  stateVectorHash: `sha256:${"a".repeat(64)}`,
  durableSeq: 7,
  nodeId: "node_12345678",
  operationKey: "op_generation_12345678",
  submissionKey: "submission_12345678",
};

describe("generation API", () => {
  it("registers generation and selection API modules", () => {
    expect(apiControllers).toEqual(expect.arrayContaining(["GenerationController", "SelectionsController"]));
    expect(apiModules).toEqual(expect.arrayContaining(["GenerationModule", "SelectionsModule"]));
  });

  it("estimates from durable canvas state and never creates a provider job during estimate", () => {
    const service = new GenerationService();
    const estimate = service.estimate(principal, validInput);
    expect(estimate).toMatchObject({
      projectId: "project_12345678",
      sourceNodeId: "node_12345678",
      capability: "image",
      currency: "USD",
      cancellation: { state: "none" },
    });
    expect(service.listOutbox()).toEqual([]);
  });

  it("creates one durable job, reservation and opaque queue event for duplicate operations", async () => {
    const controller = new GenerationController();
    const first = await controller.createJob(principal, validInput);
    const duplicate = await controller.createJob(principal, validInput);
    expect(duplicate.jobId).toBe(first.jobId);
    expect(duplicate.reservationId).toBe(first.reservationId);
    expect(Object.keys((controller as unknown as { generation: GenerationService }).generation ?? {})).toEqual([]);
    expect(first).toMatchObject({
      state: "queued",
      cancellationState: "none",
      inputSnapshotHash: expect.stringMatching(/^sha256:/),
      configSnapshotHash: expect.stringMatching(/^sha256:/),
    });
  });

  it("rejects stale durable canvas coordinates before reserving money", async () => {
    const service = new GenerationService();
    await expect(
      service.createJob(principal, { ...validInput, operationKey: "op_generation_stale", durableSeq: 8 }),
    ).rejects.toThrow("GENERATION_STALE_CANVAS_SNAPSHOT_409");
    expect(service.listOutbox()).toEqual([]);
  });

  it("validates spend, governance, model capability and currency gates", () => {
    const service = new GenerationService();
    expect(() =>
      service.estimate(
        { ...principal, memberships: [{ projectId: "project_12345678", active: true, role: "Viewer" }] },
        validInput,
      ),
    ).toThrow("GENERATION_SPEND_NOT_AUTHORIZED");
    expect(() => service.estimate(principal, { ...validInput, rightsReady: false })).toThrow(
      "GENERATION_RIGHTS_BLOCKED",
    );
    expect(() => service.estimate(principal, { ...validInput, capability: "tts" })).not.toThrow();
    expect(() => service.estimate(principal, { ...validInput, currency: "CNY" })).toThrow(
      "GENERATION_CURRENCY_MISMATCH",
    );
  });
});

describe("generation cancellation API", () => {
  it("cancels undispatched jobs atomically and makes duplicate cancel one effect", async () => {
    const service = new GenerationService();
    const cancellation = new JobCancellationService(service);
    const job = await service.createJob(principal, {
      ...validInput,
      operationKey: "op_generation_cancel_12345678",
      submissionKey: "submission_cancel_12345678",
    });
    const first = cancellation.cancel(principal, {
      projectId: job.projectId,
      jobId: job.jobId,
      operationKey: "op_cancel_12345678",
    });
    const duplicate = cancellation.cancel(principal, {
      projectId: job.projectId,
      jobId: job.jobId,
      operationKey: "op_cancel_12345678",
    });
    expect(duplicate).toBe(first);
    expect(first).toMatchObject({ effect: "canceled-undispatched", outboxEventId: null, job: { state: "canceled" } });
  });

  it("requests provider cancellation for already published/running jobs without terminalizing them", async () => {
    const service = new GenerationService();
    const cancellation = new JobCancellationService(service);
    const job = await service.createJob(principal, {
      ...validInput,
      operationKey: "op_generation_running",
      submissionKey: "submission_running_12345678",
    });
    service.markOutboxPublished(job.outboxEventId);
    service.updateJobState(job.jobId, "running");
    const result = cancellation.cancel(principal, {
      projectId: job.projectId,
      jobId: job.jobId,
      operationKey: "op_cancel_running_12345678",
    });
    expect(result).toMatchObject({
      effect: "requested-provider-cancel",
      job: { state: "running", cancellationState: "requested" },
      outboxEventId: expect.stringMatching(/^event_cancel_/),
    });
  });
});
