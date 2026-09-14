export const packageName = "@comic-canvas/canvas-core";

export function bootstrap() {
  return { packageName };
}

export * from "./graph-validator.js";
export * from "./migrations.js";
export * from "./node-registry.js";
export * from "./template-validator.js";
export * from "./templates/vertical-comic.js";
