import React from "react";

import type { WorkspaceCanvasCommand } from "./canvas-workspace.js";

export type OutlineNode = Readonly<{ id: string; label: string; kind: string }>;

export function OutlineView({
  nodes,
  onCommand,
}: Readonly<{ nodes: readonly OutlineNode[]; onCommand: (command: WorkspaceCanvasCommand) => void }>) {
  return (
    <nav
      aria-label="画布大纲"
      className="workspace-outline"
      onKeyDown={(event) => {
        if (event.key === "Tab") {
          return;
        }
        if (event.key.toLowerCase() === "n") {
          event.preventDefault();
          onCommand({ type: "intent.quick-create", source: "keyboard" });
        }
      }}
    >
      <h2>大纲</h2>
      <ul>
        {nodes.map((node) => (
          <li key={node.id}>
            <button
              aria-label={`选择 ${node.label}`}
              onClick={() => onCommand({ type: "node.select", nodeId: node.id, source: "outline" })}
              type="button"
            >
              {node.label}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
