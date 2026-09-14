import * as Y from "yjs";

export type CanvasNode = {
  id: string;
  kind: string;
  position: { x: number; y: number };
  size?: { width: number; height: number };
  data: Record<string, unknown>;
  parentId?: string;
};
export type CanvasEdge = { id: string; source: string; target: string; kind: string; bindingId?: string };
export type CanvasSnapshot = {
  id?: string;
  schemaVersion: 1;
  viewport?: { x: number; y: number; zoom: number };
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  meta: { title?: string };
};

export type CanvasYDoc = Readonly<{
  doc: Y.Doc;
  nodes: Y.Map<CanvasNode>;
  edges: Y.Map<CanvasEdge>;
  meta: Y.Map<unknown>;
  appliedOperations: Y.Map<boolean>;
}>;

export function createCanvasYDoc(snapshot?: CanvasSnapshot): CanvasYDoc {
  const doc = new Y.Doc();
  const ydoc = {
    doc,
    nodes: doc.getMap<CanvasNode>("nodes"),
    edges: doc.getMap<CanvasEdge>("edges"),
    meta: doc.getMap<unknown>("meta"),
    appliedOperations: doc.getMap<boolean>("appliedOperations"),
  };
  if (snapshot) {
    doc.transact(() => {
      ydoc.meta.set("schemaVersion", snapshot.schemaVersion);
      for (const node of snapshot.nodes) ydoc.nodes.set(node.id, structuredClone(node));
      for (const edge of snapshot.edges) ydoc.edges.set(edge.id, structuredClone(edge));
      ydoc.meta.set("title", snapshot.meta.title ?? "");
    }, "INIT");
  } else {
    ydoc.meta.set("schemaVersion", 1);
  }
  return ydoc;
}

export function readCanvasSnapshot(canvas: CanvasYDoc): CanvasSnapshot {
  const nodes = [...canvas.nodes.values()].sort((a, b) => a.id.localeCompare(b.id));
  const edges = [...canvas.edges.values()].sort((a, b) => a.id.localeCompare(b.id));
  return {
    id: "canvas",
    schemaVersion: 1,
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes,
    edges,
    meta: { title: String(canvas.meta.get("title") ?? "") },
  };
}

export function createScopedUndoManager(canvas: CanvasYDoc, origin: unknown) {
  return new Y.UndoManager([canvas.nodes, canvas.edges, canvas.meta], { trackedOrigins: new Set([origin]) });
}
