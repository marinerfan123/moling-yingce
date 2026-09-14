import { createVerifiedProjectScopeForDbBootstrap, createVerifiedTenantScopeForDbBootstrap } from "./verified-scope.js";

export async function bootstrapCanvasScope(input: {
  canvasId: string;
  tenantId: string;
  projectId: string;
  subject: string;
  sessionRevision: number;
  expectedSessionRevision: number;
  requestId: string;
}) {
  if (input.sessionRevision !== input.expectedSessionRevision) throw new Error("CANVAS_SESSION_REVISION_STALE");
  if (!input.canvasId.startsWith("canvas_")) throw new Error("CANVAS_SCOPE_INVALID_CANVAS");
  const tenantScope = createVerifiedTenantScopeForDbBootstrap({
    tenantId: input.tenantId,
    subject: input.subject,
    requestId: input.requestId,
    nonce: `canvas:${input.canvasId}`,
  });
  return createVerifiedProjectScopeForDbBootstrap({ ...tenantScope, projectId: input.projectId });
}
