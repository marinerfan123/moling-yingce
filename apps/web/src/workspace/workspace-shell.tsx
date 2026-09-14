import React from "react";

import { CanvasWorkspace } from "./canvas-workspace.js";
import { computeWorkRect } from "./work-rect.js";
import { resolveWorkspaceMode } from "./workspace-mode.js";

export function WorkspaceShell({
  route,
  capabilities,
  viewportWidth,
  viewportHeight,
}: Readonly<{ route: string; capabilities: readonly string[]; viewportWidth: number; viewportHeight: number }>) {
  const mode = resolveWorkspaceMode(route, capabilities);
  const workRect = computeWorkRect({
    viewportWidth,
    viewportHeight,
    leftDockWidth: viewportWidth >= 1440 ? 280 : 0,
    rightDockWidth: viewportWidth >= 1280 ? 320 : 0,
  });
  return (
    <main className="workspace-shell" data-mode={mode}>
      <header className="workspace-shell__top">Comic Canvas</header>
      <nav className="workspace-shell__rail" aria-label="工具栏">
        工具
      </nav>
      <section
        className="workspace-shell__main"
        data-testid="work-rect"
        data-width={workRect.width}
        data-height={workRect.height}
      >
        {mode === "edit" ? (
          <>
            <span>画布编辑</span>
            <CanvasWorkspace />
          </>
        ) : (
          "审阅模式"
        )}
      </section>
    </main>
  );
}
