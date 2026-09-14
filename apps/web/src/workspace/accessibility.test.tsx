/* @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AccessibilityStatus, aggregateLiveRegion } from "./accessibility-status.js";
import { confirmLayoutPreview, createLayoutPreview } from "./layout-preview.js";
import { resolveReflowWidth } from "./minimap-control.js";
import { OutlineView } from "./outline-view.js";
import { filterWorkspaceNodes, SearchPanel } from "./search-panel.js";

afterEach(() => cleanup());

const nodes = [
  { id: "script_1", label: "第一集脚本", kind: "script" },
  { id: "shot_1", label: "雨夜镜头", kind: "shot" },
] as const;

describe("workspace accessibility matrix", () => {
  it("separates page zoom reflow from canvas zoom", () => {
    expect(resolveReflowWidth(1440, 100)).toBe(1440);
    expect(resolveReflowWidth(1440, 200)).toBe(640);
    expect(resolveReflowWidth(1440, 400)).toBe(320);
  });

  it("supports Chinese search without creating drag-only operations", () => {
    expect(filterWorkspaceNodes(nodes, "雨夜")).toEqual([nodes[1]]);
    const select = vi.fn();
    render(<SearchPanel nodes={nodes} onResultSelect={select} />);
    fireEvent.change(screen.getByLabelText("搜索节点"), { target: { value: "脚本" } });
    fireEvent.click(screen.getByText("第一集脚本"));
    expect(select).toHaveBeenCalledWith("script_1");
  });

  it("outline keyboard N creates through command path while Tab only moves focus", () => {
    const onCommand = vi.fn();
    render(<OutlineView nodes={nodes} onCommand={onCommand} />);
    const outline = screen.getByLabelText("画布大纲");

    fireEvent.keyDown(outline, { key: "Tab" });
    fireEvent.keyDown(outline, { key: "N" });
    fireEvent.click(screen.getByLabelText("选择 雨夜镜头"));

    expect(onCommand).toHaveBeenCalledTimes(2);
    expect(onCommand).toHaveBeenNthCalledWith(1, { type: "intent.quick-create", source: "keyboard" });
    expect(onCommand).toHaveBeenNthCalledWith(2, { type: "node.select", nodeId: "shot_1", source: "outline" });
  });

  it("layout is preview-only until explicit confirmation writes positions", () => {
    const preview = createLayoutPreview([
      { id: "script_1", position: { x: 0, y: 0 } },
      { id: "shot_1", position: { x: 0, y: 0 } },
    ]);
    expect(preview).toMatchObject({ status: "preview", writesPositions: false });
    expect(confirmLayoutPreview(preview)).toMatchObject({ status: "committed", writesPositions: true });
  });

  it("aggregates aria-live announcements no more than once every two seconds", () => {
    expect(
      aggregateLiveRegion([
        { atMs: 0, message: "已选择脚本" },
        { atMs: 500, message: "已选择镜头" },
        { atMs: 2100, message: "已连接节点" },
      ]),
    ).toEqual(["已选择脚本", "已连接节点"]);
    render(<AccessibilityStatus message="已连接节点" />);
    expect(screen.getByRole("status")).toHaveTextContent("已连接节点");
  });
});
