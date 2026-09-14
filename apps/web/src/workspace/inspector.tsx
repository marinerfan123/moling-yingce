import React from "react";

export type InspectorNode = Readonly<{
  id: string;
  kind: string;
  displayName: string;
  domainBacked: boolean;
  locked?: boolean;
}>;

export type InspectorCommand =
  | Readonly<{ type: "node.rename-domain-backed"; nodeId: string; name: string; route: "project-api" }>
  | Readonly<{ type: "edit.blocked"; reason: "locked"; nodeId: string }>;

export function Inspector({
  node,
  onCommand,
}: Readonly<{ node?: InspectorNode; onCommand: (command: InspectorCommand) => void }>) {
  const [name, setName] = React.useState(node?.displayName ?? "");
  React.useEffect(() => setName(node?.displayName ?? ""), [node?.displayName]);

  if (!node) {
    return (
      <aside aria-label="检查器" className="workspace-inspector">
        选择一个节点查看参数
      </aside>
    );
  }

  return (
    <aside aria-label="检查器" className="workspace-inspector">
      <h2>{node.kind}</h2>
      <label>
        名称
        <input aria-label="节点名称" onChange={(event) => setName(event.currentTarget.value)} value={name} />
      </label>
      <button
        onClick={() =>
          node.locked
            ? onCommand({ type: "edit.blocked", reason: "locked", nodeId: node.id })
            : onCommand({ type: "node.rename-domain-backed", nodeId: node.id, name, route: "project-api" })
        }
        type="button"
      >
        通过项目 API 重命名
      </button>
      {node.domainBacked ? <p>域数据不写入 Yjs，仅保存位置和配置。</p> : null}
    </aside>
  );
}
