import React from "react";

export type LayoutNode = Readonly<{ id: string; position: { x: number; y: number } }>;
export type LayoutPreview = Readonly<{ status: "preview"; positions: readonly LayoutNode[]; writesPositions: false }>;
export type LayoutCommit = Readonly<{ status: "committed"; positions: readonly LayoutNode[]; writesPositions: true }>;

export function createLayoutPreview(nodes: readonly LayoutNode[]): LayoutPreview {
  return {
    status: "preview",
    writesPositions: false,
    positions: nodes.map((node, index) => ({
      id: node.id,
      position: { x: 160 * index, y: 120 * index },
    })),
  };
}

export function confirmLayoutPreview(preview: LayoutPreview): LayoutCommit {
  return { status: "committed", writesPositions: true, positions: preview.positions };
}

export function LayoutPreviewPanel({
  nodes,
  onConfirm,
}: Readonly<{ nodes: readonly LayoutNode[]; onConfirm: (commit: LayoutCommit) => void }>) {
  const preview = React.useMemo(() => createLayoutPreview(nodes), [nodes]);
  return (
    <section aria-label="自动布局预览" className="workspace-layout-preview">
      <p>布局仅预览，确认后才写入节点位置。</p>
      <button onClick={() => onConfirm(confirmLayoutPreview(preview))} type="button">
        确认布局
      </button>
    </section>
  );
}
