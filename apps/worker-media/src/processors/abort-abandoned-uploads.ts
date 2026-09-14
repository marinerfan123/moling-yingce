import { once, type ProcessorContext } from "./shared.js";
export function abortAbandonedUpload(
  input: Readonly<{ uploadSessionId: string; expiresAtMs: number; nowMs: number; completed: boolean }>,
  ctx: ProcessorContext,
) {
  return once(ctx, "abort-abandoned-upload", () =>
    input.completed
      ? { status: "ignored" as const }
      : input.nowMs >= input.expiresAtMs
        ? { status: "aborted" as const, uploadSessionId: input.uploadSessionId }
        : { status: "active" as const },
  );
}
