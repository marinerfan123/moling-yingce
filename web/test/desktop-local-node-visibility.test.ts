import { describe, expect, test } from "bun:test";

import {
    clearCanvasStateForUser,
    filterCanvasProjectForUser,
    isDesktopLocalGenerationTask,
    isDesktopLocalCanvasNode,
    visibleCanvasConnectionsForUser,
    visibleCanvasNodesForUser,
} from "../src/lib/desktop-local-tools";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "../src/types/canvas";

function node(id: string, type: CanvasNodeData["type"], metadata?: CanvasNodeData["metadata"]): CanvasNodeData {
    return { id, type, title: id, position: { x: 0, y: 0 }, width: 220, height: 160, metadata };
}

describe("desktop local canvas visibility", () => {
    test("ordinary users cannot see local nodes or ComfyUI config nodes", () => {
        const nodes = [
            node("image", CanvasNodeType.Image),
            node("conversion", CanvasNodeType.MediaConversion),
            node("portrait", "portrait-clearance"),
            node("comfy", CanvasNodeType.Config, { workflowProvider: "comfyui" }),
            node("legacy-comfy", CanvasNodeType.Config, { comfyBridgeWorkflowId: "workflow-1" }),
            node("runninghub", CanvasNodeType.Config, { workflowProvider: "runninghub" }),
        ];

        expect(nodes.filter(isDesktopLocalCanvasNode).map((item) => item.id)).toEqual(["conversion", "portrait", "comfy", "legacy-comfy"]);
        expect(visibleCanvasNodesForUser(nodes, false).map((item) => item.id)).toEqual(["image", "runninghub"]);
        expect(visibleCanvasNodesForUser(nodes, true)).toBe(nodes);
    });

    test("Dreamina task metadata is treated as local content", () => {
        const nodes = [
            node("dreamina-provider", CanvasNodeType.Image, { taskProvider: "dreamina-cli" }),
            node("dreamina-model", CanvasNodeType.Image, { model: "local:dreamina-cli:seedance2.5" }),
            node("dreamina-id", CanvasNodeType.Image, { taskId: "dreamina:0123456789abcdef" }),
            node("online", CanvasNodeType.Image, { taskProvider: "runninghub" }),
        ];

        expect(nodes.filter(isDesktopLocalCanvasNode).map((item) => item.id)).toEqual(["dreamina-provider", "dreamina-model", "dreamina-id"]);
        expect(isDesktopLocalGenerationTask({ id: "task-1", provider: "dreamina-cli", model: "seedance" })).toBe(true);
        expect(isDesktopLocalGenerationTask({ id: "dreamina:0123456789abcdef", provider: "backend", model: "seedance" })).toBe(true);
        expect(isDesktopLocalGenerationTask({ id: "task-1", provider: "backend", model: "local:dreamina-cli:seedance" })).toBe(true);
        expect(isDesktopLocalGenerationTask({ id: "task-1", provider: "backend", model: "seedance" })).toBe(false);
    });

    test("ordinary-user connections exclude edges touching hidden nodes", () => {
        const nodes = [
            node("image", CanvasNodeType.Image),
            node("text", CanvasNodeType.Text),
            node("conversion", CanvasNodeType.MediaConversion),
        ];
        const connections: CanvasConnection[] = [
            { id: "visible", fromNodeId: "image", toNodeId: "text" },
            { id: "local-target", fromNodeId: "image", toNodeId: "conversion" },
            { id: "local-source", fromNodeId: "conversion", toNodeId: "text" },
        ];

        expect(visibleCanvasConnectionsForUser(nodes, connections, false).map((item) => item.id)).toEqual(["visible"]);
        expect(visibleCanvasConnectionsForUser(nodes, connections, true)).toBe(connections);
    });

    test("ordinary-user clear keeps local history and local-only connections", () => {
        const nodes = [
            node("image", CanvasNodeType.Image),
            node("conversion", CanvasNodeType.MediaConversion),
            node("portrait", "portrait-clearance"),
        ];
        const connections: CanvasConnection[] = [
            { id: "visible-local", fromNodeId: "image", toNodeId: "conversion" },
            { id: "local-only", fromNodeId: "conversion", toNodeId: "portrait" },
        ];

        expect(clearCanvasStateForUser(nodes, connections, false)).toEqual({
            nodes: [nodes[1], nodes[2]],
            connections: [{ id: "local-only", fromNodeId: "conversion", toNodeId: "portrait" }],
        });
        expect(clearCanvasStateForUser(nodes, connections, true)).toEqual({ nodes: [], connections: [] });
    });

    test("ordinary-user project views remove local nodes without mutating the source", () => {
        const local = node("conversion", CanvasNodeType.MediaConversion);
        const visible = { ...node("image", CanvasNodeType.Image), parentId: "conversion" };
        const project = { id: "project", nodes: [local, visible], connections: [{ id: "edge", fromNodeId: "conversion", toNodeId: "image" }] };

        expect(filterCanvasProjectForUser(project, false)).toEqual({ id: "project", nodes: [{ ...visible, parentId: undefined }], connections: [] });
        expect(project.nodes).toEqual([local, visible]);
        expect(filterCanvasProjectForUser(project, true)).toBe(project);
    });
});
