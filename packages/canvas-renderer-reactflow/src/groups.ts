import type { CanvasCommand } from "./command-bridge.js";

export function createGroupCommand(groupId: string, childNodeIds: readonly string[]): CanvasCommand {
  return { type: "group.create", groupId, childNodeIds: [...childNodeIds].sort() };
}

export function ungroupCommand(groupId: string, childNodeIds: readonly string[]): CanvasCommand {
  return { type: "group.ungroup", groupId, childNodeIds: [...childNodeIds].sort() };
}

export function deleteGroupContainerCommand(
  groupId: string,
  childHandling: "keep-children" | "delete-children",
): CanvasCommand {
  return { type: "group.delete-container", groupId, childHandling };
}
