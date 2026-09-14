export const canvasOrigins = Object.freeze({
  localA: "LOCAL_A",
  localB: "LOCAL_B",
  remote: "REMOTE",
  projection: "PROJECTION",
} as const);

export type CanvasOrigin = (typeof canvasOrigins)[keyof typeof canvasOrigins];
