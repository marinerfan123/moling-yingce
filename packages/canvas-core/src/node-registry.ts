import { audioNodeDefinitions } from "./node-definitions/audio.js";
import { auxiliaryNodeDefinitions } from "./node-definitions/auxiliary.js";
import { biblesNodeDefinitions } from "./node-definitions/bibles.js";
import { compositionNodeDefinitions } from "./node-definitions/composition.js";
import { contentNodeDefinitions } from "./node-definitions/content.js";
import { mediaNodeDefinitions } from "./node-definitions/media.js";
import { nodeKinds, type NodeDefinition, type NodeKind } from "./node-definitions/types.js";

export type NodeRegistry = Readonly<{
  definitions: readonly NodeDefinition[];
  get(kind: NodeKind): NodeDefinition | undefined;
}>;

export function createNodeRegistry(): NodeRegistry {
  const definitions = [
    ...contentNodeDefinitions,
    ...biblesNodeDefinitions,
    ...mediaNodeDefinitions,
    ...audioNodeDefinitions,
    ...compositionNodeDefinitions,
    ...auxiliaryNodeDefinitions,
  ];
  return {
    definitions,
    get(kind) {
      return definitions.find((definition) => definition.kind === kind);
    },
  };
}

export function missingNodeKinds(registry = createNodeRegistry()) {
  const registered = new Set(registry.definitions.map((definition) => definition.kind));
  return nodeKinds.filter((kind) => !registered.has(kind));
}

export { nodeKinds };
export type { NodeDefinition, NodeKind };
