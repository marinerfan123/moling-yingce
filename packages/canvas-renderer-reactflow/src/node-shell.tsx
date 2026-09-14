import React from "react";

export type NodeVisualState = "idle" | "queued" | "running" | "reconciling" | "failed" | "stale" | "approved";

export type RenderableNode = Readonly<{
  id: string;
  kind: string;
  data?: Record<string, unknown>;
  state?: NodeVisualState;
}>;

export function NodeShell({
  node,
  title,
  children,
  width = 240,
  height = 160,
}: React.PropsWithChildren<{ node: RenderableNode; title: string; width?: number; height?: number }>) {
  return (
    <article
      aria-label={`${title} node`}
      data-node-kind={node.kind}
      data-node-state={node.state ?? "idle"}
      style={{ width, height, overflow: "hidden" }}
    >
      <header>{title}</header>
      <p>{stateLabel(node.state ?? "idle")}</p>
      <section>{children}</section>
    </article>
  );
}

export function stateLabel(state: NodeVisualState) {
  const labels: Record<NodeVisualState, string> = {
    idle: "空闲",
    queued: "排队中",
    running: "生成中",
    reconciling: "核对中",
    failed: "失败",
    stale: "需刷新",
    approved: "已批准",
  };
  return labels[state];
}
