import { describe, expect, it } from "vitest";
import * as entry from "./index.js";
import { assertGenerationWorkerProductionDependencies, composeGenerationWorkerRuntime } from "./main.js";
import { InMemoryAttemptStore } from "./attempt-service.js";
import { PostgresAttemptRepository } from "./postgres-attempt-repository.js";

const adapter = {
  providerKey: "provider",
  recoveryMode: "idempotency-key" as const,
  validate: () => ({ ok: true }),
  submit: async () => ({ externalId: "external" }),
  recover: async () => ({ kind: "unsupported" as const }),
  cancel: async () => ({ kind: "unsupported" as const }),
  parseWebhook: async () => ({ externalId: "external", eventId: "event" }),
  normalizeError: () => ({ code: "UNKNOWN", retryable: false }),
};

describe("apps/worker-generation bootstrap", () => {
  it("imports the real public entry", () => {
    expect(Object.keys(entry).length).toBeGreaterThan(0);
  });

  it("rejects the in-memory attempt store from production dependencies", () => {
    expect(() =>
      assertGenerationWorkerProductionDependencies({
        db: {},
        queue: {},
        adapter,
        consumer: { start() {} },
        attempts: new InMemoryAttemptStore(),
      }),
    ).toThrow("GENERATION_WORKER_POSTGRES_ATTEMPT_REPOSITORY_REQUIRED");
  });

  it("accepts the PostgreSQL attempt repository in production dependencies", () => {
    expect(() =>
      assertGenerationWorkerProductionDependencies({
        db: {},
        queue: {},
        adapter,
        consumer: { start() {} },
        attempts: new PostgresAttemptRepository({ query: async () => [] }),
      }),
    ).not.toThrow();
  });

  it("injects the PostgreSQL repository into the processor passed to the production consumer", async () => {
    const attempts = new PostgresAttemptRepository({ query: async () => [] });
    let observedAttempts: unknown;
    const consumer = {
      start(processor: { attempts: unknown }) {
        observedAttempts = processor.attempts;
      },
    };
    const runtime = composeGenerationWorkerRuntime({
      db: {},
      queue: {},
      adapter,
      consumer,
      attempts,
    });

    await runtime.consumer.start(runtime.processor);
    expect(runtime.processor.attempts).toBe(attempts);
    expect(observedAttempts).toBe(attempts);
  });
});
