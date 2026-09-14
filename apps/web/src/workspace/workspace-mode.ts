export type WorkspaceMode = "edit" | "review";

export function resolveWorkspaceMode(route: string, capabilities: readonly string[]): WorkspaceMode {
  if (route.includes("/review")) return "review";
  if (!capabilities.includes("canvas:edit")) return "review";
  return "edit";
}
