/* @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CanvasSurface } from "./canvas-surface.js";
import { buildCanvasCommand, createRecoverableBrokenEdge, snapPoint, type CanvasCommand } from "./command-bridge.js";
import { copyNodesToClipboard } from "./clipboard.js";
import { createCanvasKeyboardHandler } from "./keyboard.js";
import { boxSelect, toggleSelection } from "./selection.js";

afterEach(() => cleanup());

describe("canvas command bridge", () => {
  it("keeps selection deterministic across click and right-to-left box selection", () => {
    const snapshot = {
      nodes: [
        { id: "script_1", kind: "script", position: { x: 0, y: 0 }, size: { width: 80, height: 80 } },
        { id: "shot_1", kind: "shot", position: { x: 120, y: 20 }, size: { width: 80, height: 80 } },
        { id: "voice_1", kind: "voice", position: { x: 260, y: 20 }, size: { width: 80, height: 80 } },
      ],
      edges: [],
    };

    expect(toggleSelection([], "script_1", false)).toEqual(["script_1"]);
    expect(toggleSelection(["script_1"], "shot_1", true)).toEqual(["script_1", "shot_1"]);
    expect(boxSelect(snapshot.nodes, { x: 230, y: 130 }, { x: 90, y: -10 })).toEqual(["shot_1"]);
  });

  it("emits explicit non destructive edit commands", () => {
    expect(buildCanvasCommand.connect("edge_1", "script_1", "out", "shot_1", "in")).toMatchObject({
      type: "edge.connect",
      edgeId: "edge_1",
      source: { nodeId: "script_1", portId: "out" },
      target: { nodeId: "shot_1", portId: "in" },
    });
    expect(buildCanvasCommand.replaceSingleInput("edge_2", "image_1", "reference", "image_2", "input")).toMatchObject({
      type: "edge.replace-single-input",
      replacement: "explicit-replace",
    });
    expect(buildCanvasCommand.cancelSingleInputReplacement("image_1", "reference")).toMatchObject({
      type: "edge.replace-single-input",
      replacement: "explicit-cancel",
    });
    expect(buildCanvasCommand.renameDomainBackedNode("node_1", "Episode API 名称")).toMatchObject({
      type: "node.rename-domain-backed",
      route: "project-api",
    });
    expect(snapPoint({ x: 13, y: 19 })).toEqual({ x: 16, y: 16 });
  });

  it("preserves recoverable broken edges instead of silently deleting upstream data", () => {
    expect(createRecoverableBrokenEdge("edge_old", "script_1", "shot_1", "delete-upstream")).toEqual({
      id: "broken_edge_old",
      source: "script_1",
      target: "shot_1",
      kind: "recoverable-broken",
      recoverable: true,
      reason: "delete-upstream",
      noticeSeconds: 10,
    });
  });

  it("copies config and references without duplicating domain-owned data", () => {
    const copied = copyNodesToClipboard([
      {
        id: "node_1",
        kind: "shot",
        position: { x: 15, y: 20 },
        config: { lens: "35mm" },
        domain: { projectId: "project_1", title: "Do not duplicate" },
        references: ["asset_1"],
      },
    ]);

    expect(copied.items).toHaveLength(1);
    expect(copied.items[0]).toMatchObject({
      sourceNodeId: "node_1",
      kind: "shot",
      position: { x: 16, y: 24 },
      config: { lens: "35mm" },
      references: ["asset_1"],
    });
    expect(copied.items[0]).not.toHaveProperty("domain");
  });

  it("scopes keyboard shortcuts to focused canvas and never treats Tab as create", () => {
    const emitted: CanvasCommand[] = [];
    const handler = createCanvasKeyboardHandler((command) => emitted.push(command), {
      isCanvasFocused: () => true,
      isTextInputFocused: () => false,
    });

    handler(new KeyboardEvent("keydown", { key: "n" }));
    handler(new KeyboardEvent("keydown", { key: "Tab" }));
    handler(new KeyboardEvent("keydown", { key: "Tab", shiftKey: true }));
    handler(new KeyboardEvent("keydown", { key: "g" }));

    expect(emitted.map((command) => command.type)).toEqual(["intent.quick-create", "generation.confirmation.open"]);
  });

  it("suppresses canvas letters while input or editor has focus", () => {
    const emitted: CanvasCommand[] = [];
    const handler = createCanvasKeyboardHandler((command) => emitted.push(command), {
      isCanvasFocused: () => true,
      isTextInputFocused: () => true,
    });

    handler(new KeyboardEvent("keydown", { key: "n" }));
    handler(new KeyboardEvent("keydown", { key: "g" }));

    expect(emitted).toEqual([]);
  });

  it("CanvasSurface emits the same command bridge events as pure keyboard handling", () => {
    const onCommand = vi.fn();
    render(
      <CanvasSurface
        onCommand={onCommand}
        snapshot={{
          nodes: [{ id: "script_1", kind: "script", position: { x: 0, y: 0 }, size: { width: 160, height: 120 } }],
          edges: [],
        }}
        viewport={{ x: 0, y: 0, width: 1000, height: 800, zoom: 1 }}
      />,
    );

    const surface = screen.getByLabelText("canvas-surface");
    surface.focus();
    fireEvent.keyDown(surface, { key: "n" });
    fireEvent.keyDown(surface, { key: "Tab" });

    expect(onCommand).toHaveBeenCalledTimes(1);
    expect(onCommand).toHaveBeenCalledWith({ type: "intent.quick-create", source: "keyboard" });
  });
});
