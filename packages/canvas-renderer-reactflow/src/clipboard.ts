import { snapPoint } from "./command-bridge.js";
import type { Point } from "./coordinates.js";

export type ClipboardNode = Readonly<{
  id: string;
  kind: string;
  position: Point;
  config?: Record<string, unknown>;
  domain?: Record<string, unknown>;
  references?: readonly string[];
}>;

export type CanvasClipboardPayload = Readonly<{
  format: "comic-canvas/config-reference-v1";
  items: readonly Readonly<{
    clipboardId: string;
    sourceNodeId: string;
    kind: string;
    position: Point;
    config: Record<string, unknown>;
    references: readonly string[];
  }>[];
}>;

export function copyNodesToClipboard(nodes: readonly ClipboardNode[]): CanvasClipboardPayload {
  return {
    format: "comic-canvas/config-reference-v1",
    items: nodes.map((node, index) => ({
      clipboardId: `${node.id}:${index}`,
      sourceNodeId: node.id,
      kind: node.kind,
      position: snapPoint(node.position),
      config: { ...(node.config ?? {}) },
      references: [...(node.references ?? [])],
    })),
  };
}
