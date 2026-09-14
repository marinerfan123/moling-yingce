import { command, once, type ProcessorContext, type ShellCommand } from "./shared.js";
export type ProxyResult = Readonly<{
  status: "ready";
  variants: readonly ("thumbnail" | "poster" | "proxy" | "waveform")[];
  command: ShellCommand;
}>;
export function generateProxies(objectKey: string, ctx: ProcessorContext): ProxyResult {
  return once(ctx, "generate-proxies", () => ({
    status: "ready",
    variants: ["thumbnail", "poster", "proxy", "waveform"],
    command: command("ffmpeg", ["-i", objectKey, "-map_metadata", "-1", "-f", "null", "-"]),
  }));
}
