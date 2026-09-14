import { describe, expect, it } from "vitest";

import { JobProcessor } from "../src/job-processor.js";
import { InMemoryAttemptStore } from "../src/attempt-service.js";

describe("provider submission recovery", () => {
  it("keeps an ambiguous submission on its persisted Attempt without a second submit", async () => {
    const store = new InMemoryAttemptStore();
    const attempt = store.createBeforeSubmit({
      tenantId: "tenant_12345678",
      projectId: "project_12345678",
      jobId: "job_12345678",
      providerConfigId: "providercfg_12345678",
      submissionKey: "submission_12345678",
    });
    const processor = new JobProcessor({ attempts: store });
    const result = await processor.recoverAmbiguousSubmission({
      attemptId: attempt.attemptId,
      submissionKey: "submission_12345678",
      recovery: { kind: "unknown", reasonCode: "PROVIDER_TRANSPORT_AMBIGUOUS" },
    });

    expect(result).toEqual({ state: "reconciling", resubmit: false });
    expect(store.get(attempt.attemptId)).toMatchObject({ state: "reconciling" });
  });
});
