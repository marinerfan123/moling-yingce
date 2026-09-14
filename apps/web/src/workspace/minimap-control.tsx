import React from "react";

export type ZoomMatrix = Readonly<{
  pageZoom: 100 | 200 | 400;
  canvasZoom: 5 | 15 | 45 | 85 | 100 | 400;
}>;

export function resolveReflowWidth(viewportWidth: number, pageZoom: ZoomMatrix["pageZoom"]): number {
  if (pageZoom === 400) {
    return Math.min(viewportWidth, 320);
  }
  if (pageZoom === 200) {
    return Math.min(viewportWidth, 640);
  }
  return viewportWidth;
}

export function MinimapControl({ zoom }: Readonly<{ zoom: ZoomMatrix }>) {
  return (
    <aside aria-label="小地图" className="workspace-minimap">
      页面缩放 {zoom.pageZoom}% / 画布缩放 {zoom.canvasZoom}%
    </aside>
  );
}
