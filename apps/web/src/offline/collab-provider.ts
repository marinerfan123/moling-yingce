export type ScopedCanvasSession = Readonly<{
  token: string;
  canvasId: string;
  capabilities: readonly string[];
  expiresAt: string;
}>;

export function createCollabProvider(input: { wsUrl: string; session: ScopedCanvasSession }) {
  if (!input.wsUrl.startsWith("wss://") && !input.wsUrl.startsWith("ws://127.0.0.1"))
    throw new Error("COLLAB_PROVIDER_TLS_REQUIRED");
  if (!input.session.token || new Date(input.session.expiresAt).getTime() <= Date.now())
    throw new Error("COLLAB_PROVIDER_SESSION_EXPIRED");
  return {
    url: input.wsUrl,
    canvasId: input.session.canvasId,
    readOnly: !input.session.capabilities.includes("canvas:edit"),
  };
}
