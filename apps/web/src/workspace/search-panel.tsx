import React from "react";

import type { OutlineNode } from "./outline-view.js";

export function filterWorkspaceNodes(nodes: readonly OutlineNode[], query: string): OutlineNode[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return [...nodes];
  }
  return nodes.filter((node) => `${node.label} ${node.kind}`.toLowerCase().includes(normalized));
}

export function SearchPanel({
  nodes,
  onResultSelect,
}: Readonly<{ nodes: readonly OutlineNode[]; onResultSelect: (nodeId: string) => void }>) {
  const [query, setQuery] = React.useState("");
  const results = filterWorkspaceNodes(nodes, query);
  return (
    <section aria-label="搜索画布" className="workspace-search">
      <label>
        搜索节点
        <input aria-label="搜索节点" onChange={(event) => setQuery(event.currentTarget.value)} value={query} />
      </label>
      <ul>
        {results.map((node) => (
          <li key={node.id}>
            <button onClick={() => onResultSelect(node.id)} type="button">
              {node.label}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
