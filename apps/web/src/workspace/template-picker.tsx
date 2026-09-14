import React from "react";

export type QuickInsertNodeKind =
  | "Script"
  | "Bibles"
  | "Shot"
  | "Image"
  | "Video"
  | "Voice"
  | "Timeline"
  | "Export"
  | "ReviewGate";
export type QuickInsertNode = Readonly<{
  id: string;
  kind: QuickInsertNodeKind;
  label: string;
  compatiblePortKinds: readonly string[];
}>;

export const verticalComicNodes: readonly QuickInsertNode[] = Object.freeze([
  { id: "script", kind: "Script", label: "脚本", compatiblePortKinds: ["script", "text"] },
  { id: "bibles", kind: "Bibles", label: "设定集", compatiblePortKinds: ["bibles", "text"] },
  { id: "shot", kind: "Shot", label: "分镜", compatiblePortKinds: ["shot", "text"] },
  { id: "image", kind: "Image", label: "图像", compatiblePortKinds: ["image", "visual"] },
  { id: "video", kind: "Video", label: "视频", compatiblePortKinds: ["video", "visual"] },
  { id: "voice", kind: "Voice", label: "配音", compatiblePortKinds: ["voice", "audio"] },
  { id: "timeline", kind: "Timeline", label: "时间线", compatiblePortKinds: ["timeline", "video", "audio"] },
  { id: "export", kind: "Export", label: "导出", compatiblePortKinds: ["export", "video"] },
  { id: "review-gate", kind: "ReviewGate", label: "审核门", compatiblePortKinds: ["review", "video"] },
]);

export function compatibleTemplateNodes(portKind: string | undefined, nodes = verticalComicNodes): QuickInsertNode[] {
  if (!portKind) return [...nodes];
  return nodes.filter((node) => node.compatiblePortKinds.includes(portKind));
}

export function TemplatePicker({
  nodes = verticalComicNodes,
  portKind,
  onSelect,
}: Readonly<{ nodes?: readonly QuickInsertNode[]; portKind?: string; onSelect: (node: QuickInsertNode) => void }>) {
  const choices = compatibleTemplateNodes(portKind, nodes);
  return (
    <section aria-label="竖屏漫剧模板" data-testid="template-picker">
      <h2>竖屏漫剧模板</h2>
      <ul>
        {choices.map((node) => (
          <li key={node.id}>
            <button type="button" onClick={() => onSelect(node)}>
              {node.label}
            </button>
          </li>
        ))}
      </ul>
      {choices.length === 0 ? <p role="status">没有兼容节点</p> : null}
    </section>
  );
}
