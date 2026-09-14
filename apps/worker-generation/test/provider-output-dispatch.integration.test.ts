import { describe, expect, it } from "vitest";

import { InMemoryAttemptStore } from "../src/attempt-service.js";
import { ProviderOutputDispatch } from "../src/provider-output-dispatch.js";

describe("provider output dispatch", () => {
  it("persists the locator in a scoped instruction and emits no locator to the queue", () => {
    const store = new InMemoryAttemptStore();
    const attempt = store.createBeforeSubmit({
      tenantId: "tenant_12345678",
      projectId: "project_12345678",
      jobId: "job_12345678",
      providerConfigId: "providercfg_12345678",
      submissionKey: "submission_12345678",
    });
    const payload = new ProviderOutputDispatch(store).dispatch({
      attemptId: attempt.attemptId,
      locator: "https://cdn.provider.invalid/output.png",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      eventId: "event_output_12345678",
    });
    expect(payload).toMatchObject({ route: "provider.output.ingest" });
    expect(JSON.stringify(payload)).not.toContain("https://");
  });
});
