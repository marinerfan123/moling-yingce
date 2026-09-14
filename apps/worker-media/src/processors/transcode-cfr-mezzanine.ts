import { command, once, type ProcessorContext } from "./shared.js";
export type CfrMezzanine = Readonly<{
  status: "ready";
  recipe: Readonly<{ codec: "h264"; pixelFormat: "yuv420p"; frameRate: "25/1"; cfr: true }>;
  objectVersionId: string;
  sourceToFrameMapping: readonly number[];
  stableHash: string;
  command: ReturnType<typeof command>;
}>;
export function transcodeCfrMezzanine(
  input: Readonly<{
    sourceObjectKey: string;
    objectVersionId: string;
    sourceFrameCount: number;
    sourceFrameRate?: number;
    sourceTimestampsMs?: readonly number[];
  }>,
  ctx: ProcessorContext,
): CfrMezzanine {
  return once(ctx, "transcode-cfr-mezzanine", () => {
    const fps = input.sourceFrameRate && input.sourceFrameRate > 0 ? input.sourceFrameRate : 24;
    const mapping = input.sourceTimestampsMs?.length
      ? input.sourceTimestampsMs.map((timestamp) => Math.max(0, Math.round((timestamp * 25) / 1000)))
      : Array.from({ length: Math.max(0, input.sourceFrameCount) }, (_, i) => Math.floor((i * 25) / fps));
    return {
      status: "ready",
      recipe: { codec: "h264", pixelFormat: "yuv420p", frameRate: "25/1", cfr: true },
      objectVersionId: input.objectVersionId,
      sourceToFrameMapping: mapping,
      stableHash: `${input.objectVersionId}:25/1:${mapping.join(",")}`,
      command: command("ffmpeg", [
        "-i",
        input.sourceObjectKey,
        "-r",
        "25",
        "-vsync",
        "cfr",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
      ]),
    };
  });
}
export function ensureCfrMezzanine(input: Parameters<typeof transcodeCfrMezzanine>[0], ctx: ProcessorContext) {
  return transcodeCfrMezzanine(input, ctx);
}
