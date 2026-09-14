import { once, type ProcessorContext } from "./shared.js";
export function promoteReady(
  input: Readonly<{
    assetVersionId: string;
    moderation: { status: "approved" | "rejected" };
    mezzanineExists?: boolean;
  }>,
  ctx: ProcessorContext,
) {
  return once(ctx, "promote-ready", () =>
    input.moderation.status === "approved" && input.mezzanineExists !== false
      ? { status: "ready" as const, assetVersionId: input.assetVersionId }
      : {
          status: "blocked" as const,
          reason: input.moderation.status !== "approved" ? "MODERATION_REQUIRED" : "MEZZANINE_REQUIRED",
        },
  );
}
