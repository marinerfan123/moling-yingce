import type { LocalUser } from "@/stores/use-user-store";
import type { CanvasConnection, CanvasNodeData } from "@/types/canvas";

export const DESKTOP_LOCAL_PLUGIN_IDS = [
    "eagle-asset-connector",
    "portrait-clearance",
    "media-conversion",
    "comfyui-workflow-provider",
] as const;

export function isDesktopLocalPluginId(pluginId: string) {
    return (DESKTOP_LOCAL_PLUGIN_IDS as readonly string[]).includes(pluginId);
}

export function canUseDesktopLocalTools(user: Pick<LocalUser, "role" | "status"> | null | undefined, deploymentEnabled: boolean) {
    return deploymentEnabled && user?.role === "admin" && user.status === "active";
}

export const DESKTOP_LOCAL_NODE_TYPES = ["media-conversion", "portrait-clearance"] as const;
export const DESKTOP_LOCAL_WORKFLOW_PROVIDERS = ["comfyui"] as const;

const LOCAL_DREAMINA_TASK_ID_PREFIX = "dreamina:";
const LOCAL_DREAMINA_MODEL_PREFIX = "local:dreamina-cli:";

export function isDesktopLocalNodeType(nodeType: string) {
    return (DESKTOP_LOCAL_NODE_TYPES as readonly string[]).includes(nodeType);
}

export function isDesktopLocalWorkflowProvider(provider: string | undefined) {
    return provider !== undefined && (DESKTOP_LOCAL_WORKFLOW_PROVIDERS as readonly string[]).includes(provider);
}

/**
 * Persisted local-tool nodes are hidden from ordinary users without mutating
 * the canvas. This also covers old ComfyUI config nodes created before the
 * admin-only policy was introduced.
 */
export function isDesktopLocalCanvasNode(node: Pick<CanvasNodeData, "type" | "metadata">) {
    if (isDesktopLocalNodeType(node.type)) return true;
    const pluginId = node.metadata?.pluginId;
    if (typeof pluginId === "string" && isDesktopLocalPluginId(pluginId)) return true;
    if (isDesktopLocalWorkflowProvider(node.metadata?.workflowProvider) || Boolean(node.metadata?.comfyBridgeWorkflowId?.trim())) return true;
    if (node.metadata?.taskProvider === "dreamina-cli") return true;
    if (node.metadata?.taskId?.trim().startsWith(LOCAL_DREAMINA_TASK_ID_PREFIX)) return true;
    return node.metadata?.model?.trim().startsWith(LOCAL_DREAMINA_MODEL_PREFIX) ?? false;
}

export function isDesktopLocalGenerationTask(task: Pick<{ id: string; provider?: string; model?: string }, "id" | "provider" | "model">) {
    return task.provider === "dreamina-cli" || task.id.startsWith(LOCAL_DREAMINA_TASK_ID_PREFIX) || task.model?.trim().startsWith(LOCAL_DREAMINA_MODEL_PREFIX) === true;
}

export function visibleCanvasNodesForUser(nodes: CanvasNodeData[], allowDesktopLocalTools: boolean) {
    return allowDesktopLocalTools ? nodes : nodes.filter((node) => !isDesktopLocalCanvasNode(node));
}

export function visibleCanvasConnectionsForUser(nodes: CanvasNodeData[], connections: CanvasConnection[], allowDesktopLocalTools: boolean) {
    if (allowDesktopLocalTools) return connections;
    const visibleNodeIds = new Set(visibleCanvasNodesForUser(nodes, false).map((node) => node.id));
    return connections.filter((connection) => visibleNodeIds.has(connection.fromNodeId) && visibleNodeIds.has(connection.toNodeId));
}

export function clearCanvasStateForUser(nodes: CanvasNodeData[], connections: CanvasConnection[], allowDesktopLocalTools: boolean) {
    if (allowDesktopLocalTools) return { nodes: [], connections: [] };
    const visibleNodeIds = new Set(visibleCanvasNodesForUser(nodes, false).map((node) => node.id));
    return {
        nodes: nodes.filter((node) => !visibleNodeIds.has(node.id)),
        connections: connections.filter((connection) => !visibleNodeIds.has(connection.fromNodeId) && !visibleNodeIds.has(connection.toNodeId)),
    };
}

export function filterCanvasProjectForUser<T extends { nodes: CanvasNodeData[]; connections: CanvasConnection[] }>(project: T, allowDesktopLocalTools: boolean): T {
    if (allowDesktopLocalTools) return project;
    const nodes = visibleCanvasNodesForUser(project.nodes, false);
    const visibleNodeIds = new Set(nodes.map((node) => node.id));
    return {
        ...project,
        nodes: nodes.map((node) => node.parentId && !visibleNodeIds.has(node.parentId) ? { ...node, parentId: undefined } : node),
        connections: project.connections.filter((connection) => visibleNodeIds.has(connection.fromNodeId) && visibleNodeIds.has(connection.toNodeId)),
    };
}
