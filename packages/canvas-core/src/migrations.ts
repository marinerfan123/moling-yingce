import type { CanvasSnapshotLike } from "./node-definitions/types.js";
import { createNodeRegistry } from "./node-registry.js";

export function migrateCanvas<T extends CanvasSnapshotLike>(snapshot: T): T & { schemaVersion: 1 } {
  const registry = createNodeRegistry();
  return {
    ...snapshot,
    schemaVersion: 1,
    nodes: snapshot.nodes.map((node) => ({
      ...node,
      data: registry.get(node.kind)?.migrate(node.data ?? {}) ?? node.data ?? {},
    })),
  };
}
