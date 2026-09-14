import React from "react";

import { projectVisibleGraph, type RendererSnapshot } from "./projection.js";
import type { Viewport } from "./coordinates.js";
import { createCanvasKeyboardHandler } from "./keyboard.js";
import type { CanvasCommand } from "./command-bridge.js";

export type CanvasSurfaceProps = Readonly<{
  snapshot: RendererSnapshot;
  viewport: Viewport & { width: number; height: number };
  selectedNodeIds?: readonly string[];
  onCommand?: (command: CanvasCommand) => void;
}>;

function hasTextInputFocus(activeElement: Element | null): boolean {
  if (!activeElement) {
    return false;
  }
  const tagName = activeElement.tagName.toLowerCase();
  return tagName === "input" || tagName === "textarea" || activeElement.getAttribute("contenteditable") === "true";
}

export function CanvasSurface({ snapshot, viewport, selectedNodeIds = [], onCommand }: CanvasSurfaceProps) {
  const surfaceRef = React.useRef<HTMLElement | null>(null);
  const projected = projectVisibleGraph(snapshot, viewport, viewport.zoom);
  const keyboardHandler = React.useMemo(
    () =>
      createCanvasKeyboardHandler((command) => onCommand?.(command), {
        isCanvasFocused: () => surfaceRef.current === globalThis.document?.activeElement,
        isTextInputFocused: () => hasTextInputFocus(globalThis.document?.activeElement ?? null),
      }),
    [onCommand],
  );

  return (
    <section
      ref={surfaceRef}
      aria-label="canvas-surface"
      data-lod={projected.lod}
      data-visible-nodes={projected.nodes.length}
      onKeyDown={keyboardHandler}
      tabIndex={0}
    >
      {projected.nodes.map((node) => (
        <div key={node.id} data-node-id={node.id} data-selected={selectedNodeIds.includes(node.id) || undefined}>
          {node.kind}
        </div>
      ))}
    </section>
  );
}
