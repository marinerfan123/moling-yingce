/* @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CanvasWorkspace } from "./canvas-workspace.js";
import { QuickInsertMenu, proposeQuickInsert } from "./quick-insert-menu.js";

afterEach(() => cleanup());

describe("quick insert", () => {
  it("uses the same proposal shape for menu and every entry source", () => {
    expect(proposeQuickInsert("keyboard", "Shot")).toEqual({
      type: "quick-insert.proposed",
      source: "keyboard",
      nodeKind: "Shot",
      templateId: "vertical-comic",
      requiresConfirmation: true,
      createsJob: false,
    });
    expect(proposeQuickInsert("double-click")).toMatchObject({
      type: "quick-insert.proposed",
      source: "double-click",
      requiresConfirmation: true,
      createsJob: false,
    });
  });

  it("filters dropped port choices and confirms without creating a job", () => {
    const onProposal = vi.fn();
    render(<QuickInsertMenu open source="port-drop" portKind="audio" onProposal={onProposal} onClose={vi.fn()} />);
    expect(screen.getByText("配音")).toBeInTheDocument();
    expect(screen.queryByText("脚本")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("配音"));
    fireEvent.click(screen.getByRole("button", { name: "确认插入" }));
    expect(onProposal).toHaveBeenCalledWith(expect.objectContaining({ nodeKind: "Voice", createsJob: false }));
  });

  it("does not create from Tab and suppresses N in inputs", () => {
    const onCommand = vi.fn();
    render(<CanvasWorkspace onCommand={onCommand} />);
    const surface = screen.getByLabelText("商业漫剧无限画布");
    fireEvent.keyDown(surface, { key: "Tab" });
    const input = screen.getByLabelText("搜索节点");
    fireEvent.keyDown(input, { key: "N" });
    expect(onCommand).not.toHaveBeenCalledWith(expect.objectContaining({ type: "intent.quick-create" }));
  });
});
