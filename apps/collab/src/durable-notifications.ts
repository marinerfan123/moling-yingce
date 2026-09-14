export function durableAppendNotification(input: { canvasId: string; documentEpoch: number; durableSeq: number }) {
  return { type: "canvas.durable.appended" as const, ...input };
}
