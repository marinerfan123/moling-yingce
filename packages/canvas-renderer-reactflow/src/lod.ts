export type LodLevel = "dot" | "summary" | "detail";

export function resolveLod(zoom: number): LodLevel {
  if (zoom < 0.15) return "dot";
  if (zoom < 0.45) return "summary";
  return "detail";
}

export function projectionBudget(zoom: number) {
  return resolveLod(zoom) === "detail" ? 300 : 400;
}
