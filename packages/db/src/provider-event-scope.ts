import type { DbClient } from "./client.js";
import {
  createVerifiedProjectScopeForDbBootstrap,
  createVerifiedTenantScopeForDbBootstrap,
  type VerifiedProjectScope,
} from "./verified-scope.js";

export type VerifiedProviderEventBootstrapInput = Readonly<{
  providerConfigId: string;
  externalId: string;
  externalEventId: string;
  receiptId: string;
  payloadHash: string;
  rawVerifierProofHash: string;
  requestId: string;
}>;

type VerifiedProviderEventRow = Readonly<{
  tenant_id: string;
  project_id: string;
  attempt_id: string;
}>;

const sha256 = /^sha256:[a-f0-9]{64}$/;

export async function bootstrapVerifiedProviderEvent(
  db: DbClient,
  input: VerifiedProviderEventBootstrapInput,
): Promise<VerifiedProjectScope | null> {
  if (db.role !== "api") return null;
  if (!input.providerConfigId || !input.externalId || !input.externalEventId || !input.receiptId || !input.requestId)
    return null;
  if (!sha256.test(input.payloadHash) || !sha256.test(input.rawVerifierProofHash)) return null;

  const rows = await db.query<VerifiedProviderEventRow>(
    "select tenant_id, project_id, attempt_id from app.bootstrap_verified_provider_event($1,$2,$3,$4,$5,$6)",
    [
      input.providerConfigId,
      input.externalId,
      input.receiptId,
      input.payloadHash,
      input.rawVerifierProofHash,
      input.externalEventId,
    ],
  );
  const row = rows[0];
  if (!row?.tenant_id || !row.project_id || !row.attempt_id) return null;

  const tenantScope = createVerifiedTenantScopeForDbBootstrap({
    tenantId: row.tenant_id,
    subject: `provider-attempt:${row.attempt_id}`,
    requestId: input.requestId,
    nonce: `provider-receipt:${input.receiptId}`,
  });
  return createVerifiedProjectScopeForDbBootstrap({ ...tenantScope, projectId: row.project_id });
}
