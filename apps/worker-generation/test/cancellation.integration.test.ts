import { describe, expect, it } from "vitest";

import { InMemoryAttemptStore } from "../src/attempt-service.js";
import { CancellationService } from "../src/cancellation-service.js";

describe("provider cancellation", () => {
  it("does not terminalize an accepted cancellation and records exactly one operation", async () => {
    const store = new InMemoryAttemptStore();
    const attempt = store.createBeforeSubmit({
      tenantId: "tenant_12345678",
      projectId: "project_12345678",
      jobId: "job_12345678",
      providerConfigId: "providercfg_12345678",
      submissionKey: "submission_12345678",
    });
    store.update(attempt.attemptId, { state: "running", externalId: "external_12345678" });
    const cancellation = new CancellationService(store);
    const accepted = {
      kind: "accepted" as const,
      evidence: {
        source: "provider" as const,
        observedAt: new Date().toISOString(),
        reference: "cancel",
        requestAcknowledged: true,
      },
    };
    const first = await cancellation.apply("cancelop_12345678", attempt.attemptId, accepted);
    const duplicate = await cancellation.apply("cancelop_12345678", attempt.attemptId, accepted);
    expect(duplicate).toBe(first);
    expect(store.get(attempt.attemptId)).toMatchObject({ state: "running", cancellationState: "acknowledged" });
    await expect(
      cancellation.apply("cancelop_unknown", attempt.attemptId, { kind: "unknown", reasonCode: "timeout" }),
    ).resolves.toMatchObject({ cancellationState: "unknown" });
    await expect(
      cancellation.apply("cancelop_unsupported", attempt.attemptId, { kind: "unsupported" }),
    ).resolves.toMatchObject({ cancellationState: "unsupported" });
  });
});
