import type { CanvasEdge, CanvasNode, CanvasYDoc } from "./document.js";

export type CanvasCommand =
  | { type: "node.add"; operationId: string; node: CanvasNode }
  | { type: "node.move"; operationId: string; positions: Record<string, { x: number; y: number }> }
  | { type: "node.configure"; operationId: string; nodeId: string; patch: unknown }
  | { type: "node.remove"; operationId: string; nodeIds: string[] }
  | { type: "edge.connect"; operationId: string; edge: CanvasEdge }
  | { type: "edge.disconnect"; operationId: string; edgeId: string }
  | { type: "group.set"; operationId: string; parentId: string; childIds: string[] }
  | { type: "projection.upsert"; operationId: string; node: CanvasNode };

export function applyCanvasCommand(canvas: CanvasYDoc, command: CanvasCommand, origin: unknown) {
  if (canvas.appliedOperations.get(command.operationId))
    return { applied: false as const, reason: "DUPLICATE_OPERATION" };
  canvas.doc.transact(() => {
    switch (command.type) {
      case "node.add":
      case "projection.upsert":
        canvas.nodes.set(command.node.id, structuredClone(command.node));
        break;
      case "node.move":
        for (const [nodeId, position] of Object.entries(command.positions)) {
          const node = canvas.nodes.get(nodeId);
          if (node) canvas.nodes.set(nodeId, { ...node, position });
        }
        break;
      case "node.configure": {
        const node = canvas.nodes.get(command.nodeId);
        if (node) canvas.nodes.set(command.nodeId, { ...node, data: { ...node.data, ...asRecord(command.patch) } });
        break;
      }
      case "node.remove":
        for (const nodeId of command.nodeIds) {
          canvas.nodes.delete(nodeId);
          for (const edge of canvas.edges.values()) {
            if (edge.source === nodeId || edge.target === nodeId) canvas.edges.delete(edge.id);
          }
        }
        break;
      case "edge.connect":
        canvas.edges.set(command.edge.id, structuredClone(command.edge));
        break;
      case "edge.disconnect":
        canvas.edges.delete(command.edgeId);
        break;
      case "group.set":
        for (const childId of command.childIds) {
          const child = canvas.nodes.get(childId);
          if (child) canvas.nodes.set(childId, { ...child, parentId: command.parentId });
        }
        break;
    }
    canvas.appliedOperations.set(command.operationId, true);
  }, origin);
  return { applied: true as const };
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
