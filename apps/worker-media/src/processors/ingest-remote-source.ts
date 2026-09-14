import { safeLocatorDiagnostic, once, type ProcessorContext } from "./shared.js";
export type RemoteIngestInput = Readonly<{ instructionId: string; locator: string; maxBytes: number }>;
export type RemoteIngestResult = Readonly<{
  status: "fetching" | "failed";
  instructionId: string;
  diagnostic: string;
  reason?: string;
}>;
export function ingestRemoteSource(input: RemoteIngestInput, ctx: ProcessorContext): RemoteIngestResult {
  return once(ctx, "ingest-remote-source", () =>
    input.maxBytes > 0
      ? { status: "fetching", instructionId: input.instructionId, diagnostic: safeLocatorDiagnostic(input.locator) }
      : {
          status: "failed",
          instructionId: input.instructionId,
          diagnostic: "INVALID_SIZE_LIMIT",
          reason: "INVALID_SIZE_LIMIT",
        },
  );
}
