import React from "react";

import type { RecoverableBrokenEdge } from "./command-bridge.js";

export function RecoverableBrokenEdgeNotice({ edge }: Readonly<{ edge: RecoverableBrokenEdge }>) {
  return (
    <aside aria-live="polite" data-edge-id={edge.id} role="status">
      连接已保留为可恢复断链，可在 {edge.noticeSeconds} 秒内恢复。
    </aside>
  );
}
