import { S3Client } from "@aws-sdk/client-s3";
import { createS3ConditionalQuarantineSink } from "@comic-canvas/storage/safe-fetch-attestation";

import { PostgresProviderOutputIngestReceiptStore } from "./processors/postgres-provider-output-ingest-receipts.js";
import type { MediaWorkerProductionDependencies } from "./main.js";
import type { SafeFetchProxy } from "./processors/ingest-provider-output.js";

export function createProductionMediaDependencies(
  environment: NodeJS.ProcessEnv = process.env,
): MediaWorkerProductionDependencies & { readonly referenceOnly: true } {
  const endpoint = environment["S3_ENDPOINT"];
  const bucket = environment["S3_BUCKET"];
  const accessKeyId = environment["S3_ACCESS_KEY_ID"];
  const secretAccessKey = environment["S3_SECRET_ACCESS_KEY"];
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) throw new Error("MEDIA_STORAGE_CONFIGURATION_REQUIRED");

  const client = new S3Client({
    endpoint,
    region: "us-east-1",
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey },
  });
  const db = createReferenceDbClient("media-worker");
  return {
    db,
    queue: { kind: "reference" },
    safeFetch: createDisabledReferenceSafeFetch(),
    receipts: new PostgresProviderOutputIngestReceiptStore(db),
    quarantineSink: createS3ConditionalQuarantineSink({ client, bucket }),
    consumer: { start: () => undefined },
    referenceOnly: true,
  };
}

function createReferenceDbClient(role: "media-worker") {
  return {
    role,
    async query<T extends Record<string, unknown>>(_sql: string, _params?: readonly unknown[]) {
      return [] as readonly T[];
    },
  };
}

function createDisabledReferenceSafeFetch(): SafeFetchProxy {
  return {
    fetch: async () => ({ allow: false as const, reason: "SAFE_FETCH_REFERENCE_RUNTIME_DISABLED" }),
  };
}
