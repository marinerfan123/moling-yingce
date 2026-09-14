import React from "react";

import { NodeShell, type RenderableNode } from "../node-shell.js";

export function AuxiliaryNode({ node }: Readonly<{ node: RenderableNode }>) {
  return (
    <NodeShell node={node} title={node.kind}>
      {String(node.data?.["note"] ?? "辅助信息")}
    </NodeShell>
  );
}
