import React from "react";

import { NodeShell, type RenderableNode } from "../node-shell.js";

export function AudioNode({ node }: Readonly<{ node: RenderableNode }>) {
  return (
    <NodeShell node={node} title={node.kind}>
      {String(node.data?.["cue"] ?? "音频")}
    </NodeShell>
  );
}
