import React from "react";
import {
  TemplatePicker,
  type QuickInsertNode,
  type QuickInsertNodeKind,
  verticalComicNodes,
} from "./template-picker.js";

export type QuickInsertSource = "keyboard" | "double-click" | "port-drop";
export type QuickInsertProposal = Readonly<{
  type: "quick-insert.proposed";
  source: QuickInsertSource;
  nodeKind?: QuickInsertNodeKind;
  templateId: "vertical-comic";
  requiresConfirmation: true;
  createsJob: false;
}>;

export function QuickInsertMenu({
  open,
  source = "keyboard",
  portKind,
  onProposal,
  onClose,
}: Readonly<{
  open: boolean;
  source?: QuickInsertSource;
  portKind?: string;
  onProposal: (proposal: QuickInsertProposal) => void;
  onClose: () => void;
}>) {
  const [pending, setPending] = React.useState<QuickInsertNode | "template" | null>(null);
  if (!open) return null;
  const propose = (node?: QuickInsertNode) =>
    onProposal({
      type: "quick-insert.proposed",
      source,
      ...(node ? { nodeKind: node.kind } : {}),
      templateId: "vertical-comic",
      requiresConfirmation: true,
      createsJob: false,
    });
  return (
    <div aria-label="快捷插入" className="quick-insert-menu" data-testid="quick-insert-menu" role="dialog">
      <button aria-label="关闭快捷插入" onClick={onClose} type="button">
        关闭
      </button>
      <TemplatePicker
        nodes={verticalComicNodes}
        {...(portKind ? { portKind } : {})}
        onSelect={(node) => setPending(node)}
      />
      {!portKind ? (
        <button type="button" onClick={() => setPending("template")}>
          插入竖屏漫剧模板
        </button>
      ) : null}
      {pending ? (
        <div aria-label="确认快捷插入" role="alertdialog">
          <p>确认插入{pending === "template" ? "竖屏漫剧模板" : pending.label}？</p>
          <button type="button" onClick={() => propose(pending === "template" ? undefined : pending)}>
            确认插入
          </button>
          <button type="button" onClick={() => setPending(null)}>
            取消
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function proposeQuickInsert(source: QuickInsertSource, nodeKind?: QuickInsertNodeKind): QuickInsertProposal {
  return {
    type: "quick-insert.proposed",
    source,
    ...(nodeKind ? { nodeKind } : {}),
    templateId: "vertical-comic",
    requiresConfirmation: true,
    createsJob: false,
  };
}
