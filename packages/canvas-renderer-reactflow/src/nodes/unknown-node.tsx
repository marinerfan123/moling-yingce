import React from "react";

import { NodeShell, type RenderableNode } from "../node-shell.js";

export function UnknownNode({ node }: Readonly<{ node: RenderableNode }>) {
  return (
    <NodeShell node={{ ...node, state: "stale" }} title="unknown">
      <code>{JSON.stringify(node.data ?? {})}</code>
    </NodeShell>
  );
}
