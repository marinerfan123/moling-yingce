import { startCollabHealthServer } from "./health.js";
import { createProductionCollabDependencies } from "./production-bootstrap.js";
import { RoomCoordinator } from "./room-coordinator.js";

export function startCollabServer() {
  const production = process.env["NODE_ENV"] === "production" ? createProductionCollabDependencies() : undefined;
  return startCollabHealthServer(undefined, undefined, production ? "not_ready" : "ready");
}

export const collabRuntimeCapabilities = Object.freeze({
  ownerCoordination: RoomCoordinator.name,
  keepaliveMs: 20_000,
  publicPath: "/collab",
} as const);

if (process.env["COMIC_CANVAS_BOOT"] === "collab") {
  startCollabServer();
}
