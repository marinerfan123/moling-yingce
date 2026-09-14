import type {
  ProviderOutputIngestClaim,
  ProviderOutputIngestReceiptStore,
  ProviderOutputIngestResult,
} from "./ingest-provider-output.js";

export type ProviderOutputIngestReceiptQueryPort = Readonly<{
  query<T extends Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<readonly T[]>;
}>;

type ClaimRow = Readonly<{
  state: "claimed" | "in_progress" | "completed";
  quarantine_key?: string;
  claim_token?: string;
  result_status?: ProviderOutputIngestResult["status"];
  result_bytes?: number;
  result_sha256?: string;
}>;

export class PostgresProviderOutputIngestReceiptStore implements ProviderOutputIngestReceiptStore {
  readonly kind = "durable" as const;

  constructor(private readonly db: ProviderOutputIngestReceiptQueryPort) {}

  async claim(instructionId: string): Promise<ProviderOutputIngestClaim> {
    const [row] = await this.db.query<ClaimRow>("select * from app.claim_provider_output_ingest($1)", [instructionId]);
    if (!row) throw new Error("PROVIDER_OUTPUT_INGEST_CLAIM_MISSING");
    if (row.state === "claimed") {
      if (!row.quarantine_key || !row.claim_token) throw new Error("PROVIDER_OUTPUT_INGEST_CLAIM_INVALID");
      return { state: "claimed", quarantineKey: row.quarantine_key, claimToken: row.claim_token };
    }
    if (row.state === "in_progress") return { state: "in_progress" };
    if (row.result_status === "quarantined" && row.result_bytes !== undefined && row.result_sha256)
      return {
        state: "completed",
        result: { status: "quarantined", instructionId, bytes: row.result_bytes, sha256: row.result_sha256 },
      };
    if (row.result_status === "refresh_required")
      return { state: "completed", result: { status: "refresh_required", instructionId } };
    throw new Error("PROVIDER_OUTPUT_INGEST_COMPLETION_INVALID");
  }

  async complete(instructionId: string, claimToken: string, result: ProviderOutputIngestResult): Promise<void> {
    await this.db.query("select app.complete_provider_output_ingest($1, $2, $3, $4, $5)", [
      instructionId,
      claimToken,
      result.status,
      result.status === "quarantined" ? result.bytes : null,
      result.status === "quarantined" ? result.sha256 : null,
    ]);
  }

  async fail(instructionId: string, claimToken: string): Promise<void> {
    await this.db.query("select app.fail_provider_output_ingest($1, $2)", [instructionId, claimToken]);
  }
}
