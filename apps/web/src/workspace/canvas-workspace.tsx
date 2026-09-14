import React from "react";

import { AccessibilityStatus } from "./accessibility-status.js";
import { Inspector, type InspectorCommand, type InspectorNode } from "./inspector.js";
import { LayoutPreviewPanel } from "./layout-preview.js";
import { MinimapControl } from "./minimap-control.js";
import { NodeStateOverlay, type NodeStateOverlayState } from "./node-state-overlay.js";
import { OutlineView, type OutlineNode } from "./outline-view.js";
import { SearchPanel } from "./search-panel.js";
import { QuickInsertMenu, type QuickInsertProposal } from "./quick-insert-menu.js";

export type WorkspaceCanvasCommand =
  | InspectorCommand
  | Readonly<{ type: "intent.quick-create"; source: "keyboard" | "double-click" | "port-drop" }>
  | Readonly<{ type: "generation.confirmation.open"; source: "keyboard" | "menu"; directSubmit: false }>
  | Readonly<{ type: "edge.replace-single-input"; replacement: "explicit-replace" | "explicit-cancel" }>
  | Readonly<{ type: "edge.reconnect"; preserveBrokenEdgeOnFailure: true }>
  | Readonly<{ type: "node.select"; nodeId: string; source: "outline" | "search" }>
  | Readonly<{ type: "layout.commit"; writesPositions: true }>
  | QuickInsertProposal;

const demoNode: InspectorNode = {
  id: "script_1",
  kind: "Script",
  displayName: "第一集脚本",
  domainBacked: true,
};
const outlineNodes: readonly OutlineNode[] = [
  { id: "script_1", label: "第一集脚本", kind: "script" },
  { id: "shot_1", label: "雨夜镜头", kind: "shot" },
];

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tagName = target.tagName.toLowerCase();
  return tagName === "input" || tagName === "textarea" || target.isContentEditable;
}

export function CanvasWorkspace({ onCommand }: Readonly<{ onCommand?: (command: WorkspaceCanvasCommand) => void }>) {
  const [overlayState, setOverlayState] = React.useState<NodeStateOverlayState>("idle");
  const [quickInsert, setQuickInsert] = React.useState<{
    source: "keyboard" | "double-click" | "port-drop";
    portKind?: string;
  } | null>(null);
  const emit = React.useCallback(
    (command: WorkspaceCanvasCommand) => {
      if (command.type === "generation.confirmation.open") {
        setOverlayState("confirmation-required");
      }
      if (command.type === "edge.reconnect") {
        setOverlayState("recoverable-broken");
      }
      if (command.type === "edit.blocked") {
        setOverlayState("locked");
      }
      onCommand?.(command);
    },
    [onCommand],
  );

  return (
    <main className="canvas-workspace">
      <section
        aria-label="商业漫剧无限画布"
        className="canvas-workspace__surface"
        onDoubleClick={() => {
          emit({ type: "intent.quick-create", source: "double-click" });
          setQuickInsert({ source: "double-click" });
        }}
        onDrop={(event) => {
          const portKind =
            event.dataTransfer.getData("application/x-canvas-port-kind") || event.dataTransfer.getData("text/plain");
          if (portKind) {
            event.preventDefault();
            emit({ type: "intent.quick-create", source: "port-drop" });
            setQuickInsert({ source: "port-drop", portKind });
          }
        }}
        onDragOver={(event) => event.preventDefault()}
        onKeyDown={(event) => {
          if (isEditableTarget(event.target) || event.key === "Tab") {
            return;
          }
          if (event.key.toLowerCase() === "n") {
            event.preventDefault();
            emit({ type: "intent.quick-create", source: "keyboard" });
            setQuickInsert({ source: "keyboard" });
          }
          if (event.key.toLowerCase() === "g") {
            event.preventDefault();
            emit({ type: "generation.confirmation.open", source: "keyboard", directSubmit: false });
          }
        }}
        tabIndex={0}
      >
        <article data-node-id={demoNode.id}>脚本节点：{demoNode.displayName}</article>
        <button
          onClick={() => emit({ type: "edge.replace-single-input", replacement: "explicit-cancel" })}
          type="button"
        >
          取消单输入替换
        </button>
        <button onClick={() => emit({ type: "edge.reconnect", preserveBrokenEdgeOnFailure: true })} type="button">
          保留断链并重连
        </button>
        <NodeStateOverlay noticeSeconds={10} state={overlayState} />
        <MinimapControl zoom={{ pageZoom: 100, canvasZoom: 85 }} />
        <AccessibilityStatus message="键盘、搜索、大纲与布局预览可用" />
      </section>
      <QuickInsertMenu
        open={quickInsert !== null}
        {...(quickInsert ? { source: quickInsert.source } : {})}
        {...(quickInsert?.portKind ? { portKind: quickInsert.portKind } : {})}
        onClose={() => setQuickInsert(null)}
        onProposal={(proposal: QuickInsertProposal) => {
          setQuickInsert(null);
          emit(proposal);
        }}
      />
      <OutlineView nodes={outlineNodes} onCommand={emit} />
      <SearchPanel
        nodes={outlineNodes}
        onResultSelect={(nodeId) => emit({ type: "node.select", nodeId, source: "search" })}
      />
      <LayoutPreviewPanel
        nodes={outlineNodes.map((node) => ({ id: node.id, position: { x: 0, y: 0 } }))}
        onConfirm={() => emit({ type: "layout.commit", writesPositions: true })}
      />
      <Inspector node={demoNode} onCommand={emit} />
    </main>
  );
}
