import { startCollabHealthServer } from "./health.js";
import { RoomCoordinator } from "./room-coordinator.js";

export function startCollabServer() {
  return startCollabHealthServer();
}

export const collabRuntimeCapabilities = Object.freeze({
  ownerCoordination: RoomCoordinator.name,
  keepaliveMs: 20_000,
  publicPath: "/collab",
} as const);

if (process.env["COMIC_CANVAS_BOOT"] === "collab") {
  startCollabServer();
}
