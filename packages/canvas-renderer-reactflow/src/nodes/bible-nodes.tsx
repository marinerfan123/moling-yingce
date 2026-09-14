import React from "react";

import { NodeShell, type RenderableNode } from "../node-shell.js";

export function BibleNode({ node }: Readonly<{ node: RenderableNode }>) {
  return (
    <NodeShell node={node} title={node.kind}>
      {String(node.data?.["name"] ?? "设定资料")}
    </NodeShell>
  );
}
