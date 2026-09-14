export type Bounds = Readonly<{ x: number; y: number; width: number; height: number }>;
export type IndexedNode = Readonly<{
  id: string;
  position: { x: number; y: number };
  size?: { width: number; height: number };
}>;

export function intersectsViewport(node: IndexedNode, viewport: Bounds, overscan = 800) {
  const width = node.size?.width ?? 240;
  const height = node.size?.height ?? 160;
  return (
    node.position.x + width >= viewport.x - overscan &&
    node.position.x <= viewport.x + viewport.width + overscan &&
    node.position.y + height >= viewport.y - overscan &&
    node.position.y <= viewport.y + viewport.height + overscan
  );
}
