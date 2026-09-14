import type { Point } from "./coordinates.js";

export type CanvasPortRef = Readonly<{ nodeId: string; portId: string }>;

export type CanvasCommand =
  | Readonly<{ type: "intent.quick-create"; source: "keyboard" | "double-click" | "port-drop" }>
  | Readonly<{ type: "generation.confirmation.open"; source: "keyboard" | "menu"; directSubmit: false }>
  | Readonly<{ type: "node.move"; nodeId: string; position: Point; origin: "local-user" }>
  | Readonly<{ type: "node.rename-domain-backed"; nodeId: string; name: string; route: "project-api" }>
  | Readonly<{ type: "edge.connect"; edgeId: string; source: CanvasPortRef; target: CanvasPortRef }>
  | Readonly<{
      type: "edge.reconnect";
      edgeId: string;
      nextSource?: CanvasPortRef;
      nextTarget?: CanvasPortRef;
      preserveBrokenEdgeOnFailure: true;
    }>
  | Readonly<{
      type: "edge.replace-single-input";
      nodeId: string;
      inputPortId: string;
      nextEdgeId?: string;
      nextSource?: CanvasPortRef;
      replacement: "explicit-replace" | "explicit-cancel";
    }>
  | Readonly<{ type: "group.create"; groupId: string; childNodeIds: readonly string[] }>
  | Readonly<{ type: "group.ungroup"; groupId: string; childNodeIds: readonly string[] }>
  | Readonly<{ type: "group.delete-container"; groupId: string; childHandling: "keep-children" | "delete-children" }>
  | Readonly<{ type: "clipboard.copy"; nodeIds: readonly string[]; mode: "config-and-references-only" }>
  | Readonly<{ type: "edit.blocked"; reason: "locked" | "read-only" | "approval-required"; nodeId?: string }>;

export type RecoverableBrokenEdge = Readonly<{
  id: string;
  source: string;
  target: string;
  kind: "recoverable-broken";
  recoverable: true;
  reason: "delete-upstream" | "reconnect-failed" | "missing-node";
  noticeSeconds: 10;
}>;

export function snapPoint(point: Point, gridSize = 8): Point {
  return {
    x: Math.round(point.x / gridSize) * gridSize,
    y: Math.round(point.y / gridSize) * gridSize,
  };
}

export const buildCanvasCommand = {
  quickCreate(source: "keyboard" | "double-click" | "port-drop"): CanvasCommand {
    return { type: "intent.quick-create", source };
  },
  openGenerationConfirmation(source: "keyboard" | "menu"): CanvasCommand {
    return { type: "generation.confirmation.open", source, directSubmit: false };
  },
  moveNode(nodeId: string, position: Point): CanvasCommand {
    return { type: "node.move", nodeId, position: snapPoint(position), origin: "local-user" };
  },
  renameDomainBackedNode(nodeId: string, name: string): CanvasCommand {
    return { type: "node.rename-domain-backed", nodeId, name, route: "project-api" };
  },
  connect(
    edgeId: string,
    sourceNodeId: string,
    sourcePortId: string,
    targetNodeId: string,
    targetPortId: string,
  ): CanvasCommand {
    return {
      type: "edge.connect",
      edgeId,
      source: { nodeId: sourceNodeId, portId: sourcePortId },
      target: { nodeId: targetNodeId, portId: targetPortId },
    };
  },
  reconnect(edgeId: string, nextSource?: CanvasPortRef, nextTarget?: CanvasPortRef): CanvasCommand {
    return {
      type: "edge.reconnect",
      edgeId,
      ...(nextSource ? { nextSource } : {}),
      ...(nextTarget ? { nextTarget } : {}),
      preserveBrokenEdgeOnFailure: true,
    };
  },
  replaceSingleInput(
    nextEdgeId: string,
    nodeId: string,
    inputPortId: string,
    sourceNodeId: string,
    sourcePortId: string,
  ): CanvasCommand {
    return {
      type: "edge.replace-single-input",
      nodeId,
      inputPortId,
      nextEdgeId,
      nextSource: { nodeId: sourceNodeId, portId: sourcePortId },
      replacement: "explicit-replace",
    };
  },
  cancelSingleInputReplacement(nodeId: string, inputPortId: string): CanvasCommand {
    return { type: "edge.replace-single-input", nodeId, inputPortId, replacement: "explicit-cancel" };
  },
};

export function createRecoverableBrokenEdge(
  edgeId: string,
  source: string,
  target: string,
  reason: RecoverableBrokenEdge["reason"],
): RecoverableBrokenEdge {
  return {
    id: `broken_${edgeId}`,
    source,
    target,
    kind: "recoverable-broken",
    recoverable: true,
    reason,
    noticeSeconds: 10,
  };
}
