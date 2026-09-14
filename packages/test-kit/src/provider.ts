import type {
  Mocked,
  TestProviderAdapter,
  WorkerHarness,
  WorkerHarnessContext,
  WorkerCheckpoint,
} from "./protocols.js";

export function createMockProviderAdapter(): Mocked<TestProviderAdapter> {
  const calls: string[] = [];
  return {
    calls,
    async submitText(prompt) {
      calls.push(`text:${prompt}`);
      return { externalId: "provider-text-1", text: `mock:${prompt}` };
    },
    async submitImage(prompt) {
      calls.push(`image:${prompt}`);
      return { externalId: "provider-image-1", imageUrl: "mock://image/provider-image-1" };
    },
    async recover(externalId) {
      calls.push(`recover:${externalId}`);
      return "found";
    },
  };
}

export function createGenerationWorkerHarness(ctx: WorkerHarnessContext): WorkerHarness {
  return {
    async runUntil(checkpoint: WorkerCheckpoint) {
      const effects: string[] = [`tenant:${ctx.db.ids.tenantId}`, `checkpoint:${checkpoint}`];
      if (checkpoint !== "before-submit") {
        await ctx.provider.submitText("commercial smoke prompt");
        effects.push("provider-submit");
      }
      if (checkpoint === "after-provider-success-before-output-commit") {
        effects.push("provider-success");
      }
      return { checkpoint, effects };
    },
  };
}
