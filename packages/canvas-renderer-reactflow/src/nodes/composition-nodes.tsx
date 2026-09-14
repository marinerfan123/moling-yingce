import React from "react";

import { NodeShell, type RenderableNode } from "../node-shell.js";

export function CompositionNode({ node }: Readonly<{ node: RenderableNode }>) {
  return (
    <NodeShell node={node} title={node.kind}>
      {String(node.data?.["summary"] ?? "合成输出")}
    </NodeShell>
  );
}
