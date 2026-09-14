export const packageName = "@comic-canvas/test-kit";

export function bootstrap() {
  return { packageName };
}

export * from "./api.js";
export * from "./canvas.js";
export * from "./db.js";
export * from "./media.js";
export * from "./provider.js";
export * from "./protocols.js";
export * from "./story.js";
export * from "./yjs.js";
