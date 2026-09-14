export type WorkLayout = Readonly<{
  viewportWidth: number;
  viewportHeight: number;
  topBarHeight?: number;
  toolRailWidth?: number;
  leftDockWidth?: number;
  rightDockWidth?: number;
  collapsedComposerHeight?: number;
}>;

export type Rect = Readonly<{ x: number; y: number; width: number; height: number }>;

export function computeWorkRect(layout: WorkLayout): Rect {
  const topBarHeight = layout.topBarHeight ?? 52;
  const toolRailWidth = layout.toolRailWidth ?? 52;
  const leftDockWidth = layout.leftDockWidth ?? 0;
  const rightDockWidth = layout.rightDockWidth ?? 0;
  const collapsedComposerHeight = layout.collapsedComposerHeight ?? 56;
  const x = toolRailWidth + leftDockWidth;
  return {
    x,
    y: topBarHeight,
    width: Math.max(0, layout.viewportWidth - x - rightDockWidth),
    height: Math.max(0, layout.viewportHeight - topBarHeight - collapsedComposerHeight),
  };
}

export function canInteractWithCanvasAndDock(rect: Rect) {
  return rect.width >= 640 && rect.height >= 480;
}

export function composerMetrics(rect: Rect, layout: Pick<WorkLayout, "viewportHeight" | "topBarHeight">) {
  const topBarHeight = layout.topBarHeight ?? 52;
  return {
    width: Math.min(840, Math.max(0, rect.width - 32)),
    expandedMaxHeight: Math.max(
      0,
      Math.min(360, layout.viewportHeight * 0.4, layout.viewportHeight - topBarHeight - 480 - 32),
    ),
    fullScreen: rect.height < 160,
  };
}
