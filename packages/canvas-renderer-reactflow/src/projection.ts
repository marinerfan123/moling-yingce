import { projectionBudget, resolveLod } from "./lod.js";
import { intersectsViewport, type Bounds, type IndexedNode } from "./viewport-index.js";

export type RendererNode = IndexedNode & Readonly<{ kind: string; data?: Record<string, unknown> }>;
export type RendererEdge = Readonly<{ id: string; source: string; target: string; kind: string }>;
export type RendererSnapshot = Readonly<{ nodes: readonly RendererNode[]; edges: readonly RendererEdge[] }>;

export function projectVisibleGraph(snapshot: RendererSnapshot, viewport: Bounds, zoom: number) {
  const visibleNodes = snapshot.nodes
    .filter((node) => intersectsViewport(node, viewport))
    .slice(0, projectionBudget(zoom))
    .map((node) => ({ ...node, lod: resolveLod(zoom) }));
  const visibleIds = new Set(visibleNodes.map((node) => node.id));
  const visibleEdges = snapshot.edges.filter((edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target));
  return {
    nodes: visibleNodes,
    edges: visibleEdges,
    lod: resolveLod(zoom),
  };
}
