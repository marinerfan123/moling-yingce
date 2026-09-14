import { command, once, type ProcessorContext, type ShellCommand } from "./shared.js";
export type InspectUploadInput = Readonly<{ objectKey: string; declaredMime?: string; maxBytes: number }>;
export type Inspection = Readonly<{
  status: "scanning" | "rejected";
  commands: readonly ShellCommand[];
  reason?: string;
}>;
export function inspectUpload(input: InspectUploadInput, ctx: ProcessorContext): Inspection {
  return once(ctx, "inspect-upload", () => {
    if (input.maxBytes <= 0) return { status: "rejected", commands: [], reason: "INVALID_SIZE_LIMIT" };
    return {
      status: "scanning",
      commands: [
        command("clamscan", ["--no-summary", "--", input.objectKey]),
        command("ffprobe", ["-v", "error", "-of", "json", "--", input.objectKey]),
      ],
    };
  });
}
