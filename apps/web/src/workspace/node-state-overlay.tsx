import React from "react";

export type NodeStateOverlayState = "idle" | "locked" | "recoverable-broken" | "confirmation-required";

export function NodeStateOverlay({
  state,
  noticeSeconds,
}: Readonly<{ state: NodeStateOverlayState; noticeSeconds?: number }>) {
  const label =
    state === "recoverable-broken"
      ? `断链已保留，可在 ${noticeSeconds ?? 10} 秒内恢复`
      : state === "confirmation-required"
        ? "需要确认后才会提交生成或替换"
        : state === "locked"
          ? "节点已锁定，编辑已阻止"
          : "节点可编辑";

  return (
    <div aria-live="polite" className="node-state-overlay" data-state={state} role="status">
      {label}
    </div>
  );
}
