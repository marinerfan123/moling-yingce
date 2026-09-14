import type { CanvasSnapshotLike, NodeDefinition, PortDefinition } from "./node-definitions/types.js";
import { createNodeRegistry, type NodeRegistry } from "./node-registry.js";

export type GraphDiagnosticCode =
  | "MISSING_NODE"
  | "UNKNOWN_NODE_KIND"
  | "PORT_MISMATCH"
  | "SINGLE_INPUT_CONFLICT"
  | "FLOW_CYCLE";

export type GraphDiagnostic = Readonly<{
  code: GraphDiagnosticCode;
  message: string;
  edgeId?: string;
  nodeId?: string;
}>;

export function validateGraph(
  snapshot: CanvasSnapshotLike,
  registry: NodeRegistry = createNodeRegistry(),
): readonly GraphDiagnostic[] {
  const diagnostics: GraphDiagnostic[] = [];
  const nodes = new Map(snapshot.nodes.map((node) => [node.id, node]));
  const definitions = new Map(registry.definitions.map((definition) => [definition.kind, definition]));

  for (const node of snapshot.nodes) {
    if (!definitions.has(node.kind))
      diagnostics.push({ code: "UNKNOWN_NODE_KIND", nodeId: node.id, message: `Unknown node kind ${node.kind}` });
  }

  const singleInputs = new Set<string>();
  for (const edge of snapshot.edges) {
    const source = nodes.get(edge.source);
    const target = nodes.get(edge.target);
    if (!source || !target) {
      diagnostics.push({ code: "MISSING_NODE", edgeId: edge.id, message: `Edge ${edge.id} references a missing node` });
      continue;
    }
    const sourceDef = definitions.get(source.kind);
    const targetDef = definitions.get(target.kind);
    if (sourceDef && targetDef && edge.kind !== "reference") {
      const sourcePort = findPort(sourceDef.outputs, edge.sourcePort);
      const targetPort = findPort(targetDef.inputs, edge.targetPort);
      if (sourcePort && targetPort && sourcePort.type !== targetPort.type) {
        diagnostics.push({
          code: "PORT_MISMATCH",
          edgeId: edge.id,
          message: `Port type mismatch ${sourcePort.type} -> ${targetPort.type}`,
        });
      }
      if (targetPort?.cardinality === "single") {
        const key = `${edge.target}:${targetPort.id}`;
        if (singleInputs.has(key))
          diagnostics.push({
            code: "SINGLE_INPUT_CONFLICT",
            edgeId: edge.id,
            message: `Second edge into single input ${key}`,
          });
        singleInputs.add(key);
      }
    }
  }

  if (hasFlowCycle(snapshot)) diagnostics.push({ code: "FLOW_CYCLE", message: "Flow edges must form a DAG" });
  return diagnostics;
}

function findPort(ports: readonly PortDefinition[], id: string | undefined) {
  if (id) return ports.find((port) => port.id === id);
  return ports[0];
}

function hasFlowCycle(snapshot: CanvasSnapshotLike) {
  const outgoing = new Map<string, string[]>();
  for (const node of snapshot.nodes) outgoing.set(node.id, []);
  for (const edge of snapshot.edges) {
    if (edge.kind === "reference") continue;
    outgoing.get(edge.source)?.push(edge.target);
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): boolean => {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    for (const next of outgoing.get(id) ?? []) if (visit(next)) return true;
    visiting.delete(id);
    visited.add(id);
    return false;
  };
  return [...outgoing.keys()].some(visit);
}

export function getExecutionOrder(snapshot: CanvasSnapshotLike): readonly string[] {
  const indegree = new Map(snapshot.nodes.map((node) => [node.id, 0]));
  const outgoing = new Map(snapshot.nodes.map((node) => [node.id, [] as string[]]));
  for (const edge of snapshot.edges) {
    if (edge.kind === "reference") continue;
    outgoing.get(edge.source)?.push(edge.target);
    indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1);
  }
  const ready = [...indegree.entries()]
    .filter(([, degree]) => degree === 0)
    .map(([id]) => id)
    .sort();
  const order: string[] = [];
  while (ready.length > 0) {
    const id = ready.shift()!;
    order.push(id);
    for (const next of [...(outgoing.get(id) ?? [])].sort()) {
      const degree = (indegree.get(next) ?? 0) - 1;
      indegree.set(next, degree);
      if (degree === 0) ready.push(next);
    }
    ready.sort();
  }
  return order;
}
