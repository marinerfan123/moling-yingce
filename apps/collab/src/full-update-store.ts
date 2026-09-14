export function materializeFullUpdate(input: {
  canvasId: string;
  durableSeq: number;
  updateHash: string;
  bytes: Uint8Array;
}) {
  return {
    contentObjectId: `canvas-full-${input.canvasId}-${input.durableSeq}`,
    sha256: input.updateHash,
    bytes: input.bytes,
    schemaVersion: 1 as const,
  };
}
