import type { RendererNode } from "./projection.js";

export type SelectionBox = Readonly<{ x: number; y: number }>;

export function toggleSelection(current: readonly string[], nodeId: string, additive: boolean): string[] {
  if (!additive) {
    return [nodeId];
  }
  return current.includes(nodeId) ? current.filter((id) => id !== nodeId) : [...current, nodeId];
}

export function boxSelect(nodes: readonly RendererNode[], start: SelectionBox, end: SelectionBox): string[] {
  const left = Math.min(start.x, end.x);
  const right = Math.max(start.x, end.x);
  const top = Math.min(start.y, end.y);
  const bottom = Math.max(start.y, end.y);
  return nodes
    .filter((node) => {
      const width = node.size?.width ?? 240;
      const height = node.size?.height ?? 160;
      return (
        node.position.x >= left &&
        node.position.y >= top &&
        node.position.x + width <= right &&
        node.position.y + height <= bottom
      );
    })
    .map((node) => node.id);
}
