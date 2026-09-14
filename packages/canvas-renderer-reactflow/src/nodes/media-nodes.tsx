import React from "react";

import { NodeShell, type RenderableNode } from "../node-shell.js";

export function MediaNode({ node }: Readonly<{ node: RenderableNode }>) {
  return (
    <NodeShell node={node} title={node.kind}>
      {String(node.data?.["asset"] ?? "媒体输入/生成")}
    </NodeShell>
  );
}
