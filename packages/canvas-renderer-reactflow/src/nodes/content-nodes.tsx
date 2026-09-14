import React from "react";

import { NodeShell, type RenderableNode } from "../node-shell.js";

export function ContentNode({ node }: Readonly<{ node: RenderableNode }>) {
  return (
    <NodeShell node={node} title={node.kind}>
      {String(node.data?.["title"] ?? "内容节点")}
    </NodeShell>
  );
}
