export function canFinalizeProjection(input: {
  markerDurable: boolean;
  sourceOutboxTerminal: boolean;
  consumerWatermarkAtLeastSeq: boolean;
  deadLetter: boolean;
}) {
  return input.markerDurable && input.sourceOutboxTerminal && input.consumerWatermarkAtLeastSeq && !input.deadLetter;
}
