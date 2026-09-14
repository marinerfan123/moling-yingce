import type { GenerationIntent, GenerationIntentStore } from "./generation-intent-store.js";

export class ReconnectCoordinator {
  constructor(private readonly intents: GenerationIntentStore) {}

  reconnect(
    intent: GenerationIntent,
    checks: {
      authFresh: boolean;
      canvasSessionFresh: boolean;
      baselineChanged: boolean;
      estimateChanged: boolean;
      userConfirmed: boolean;
    },
  ) {
    const revalidated = this.intents.revalidate(intent, { ...checks, now: new Date() });
    if (revalidated.status !== "revalidating") return { submitted: false, intent: revalidated };
    if (!checks.userConfirmed)
      return { submitted: false, intent: { ...revalidated, status: "changed-awaiting-confirmation" as const } };
    return { submitted: true, intent: { ...revalidated, status: "submitted" as const } };
  }
}
