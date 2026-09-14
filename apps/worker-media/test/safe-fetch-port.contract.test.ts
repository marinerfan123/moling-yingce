import { describe, expect, it } from "vitest";
import {
  createSafeFetchProxy,
  type RuntimeSafeFetchProxy as StorageSafeFetchProxy,
  type RuntimeSafeFetchRequest as StorageSafeFetchRequest,
} from "@comic-canvas/storage";
import {
  createS3ConditionalQuarantineSink,
  isS3ConditionalQuarantineSink,
} from "@comic-canvas/storage/safe-fetch-attestation";

import { assertMediaWorkerProductionDependencies } from "../src/main.js";
import type {
  ProviderOutputIngestReceiptStore,
  RuntimeSafeFetchRequest as MediaSafeFetchRequest,
  SafeFetchProxy as MediaSafeFetchProxy,
} from "../src/processors/ingest-provider-output.js";
import { InMemoryProviderOutputIngestReceiptStore } from "../src/processors/ingest-provider-output.js";
import { PostgresProviderOutputIngestReceiptStore } from "../src/processors/postgres-provider-output-ingest-receipts.js";

type Assert<T extends true> = T;
type Bidirectional<T, U> = [T] extends [U] ? ([U] extends [T] ? true : false) : false;
type RequestContractMatchesStorage = Assert<Bidirectional<MediaSafeFetchRequest, StorageSafeFetchRequest>>;
type ProxyContractAcceptsStorage = Assert<StorageSafeFetchProxy extends MediaSafeFetchProxy ? true : false>;
void (undefined as unknown as RequestContractMatchesStorage);
void (undefined as unknown as ProxyContractAcceptsStorage);

const quarantineSink = createS3ConditionalQuarantineSink({
  client: { send: async () => ({}) } as never,
  bucket: "quarantine-bucket",
});
const genericSink = {
  capability: "conditional-quarantine-v1" as const,
  open: async () => undefined,
  write: async () => undefined,
  complete: async () => ({
    quarantineKey: "quarantine/provider-output/ingest_12345678",
    bytes: 1,
    sha256: `sha256:${"a".repeat(64)}`,
  }),
  abort: async () => undefined,
};
const ForgedAdapter = class S3ConditionalQuarantineSink {};
const forgedSink = Object.assign(new ForgedAdapter(), genericSink, {
  productionAdapter: "S3ConditionalQuarantineSink" as const,
});
const lyingAttestor = { attestQuarantineSink: () => true };

function durableReceiptStore() {
  return new PostgresProviderOutputIngestReceiptStore({ query: async () => [] });
}

describe("media SafeFetch port", () => {
  it("accepts the storage runtime proxy in production composition", () => {
    const storageProxy = createSafeFetchProxy({
      resolve: async () => [{ address: "93.184.216.34", family: 4 as const }],
      request: async () => ({ status: 200, headers: {}, bytes: 1, sha256: `sha256:${"a".repeat(64)}` }),
    });
    const mediaProxy: MediaSafeFetchProxy = storageProxy;
    expect(typeof mediaProxy.fetch).toBe("function");
    expect(isS3ConditionalQuarantineSink(quarantineSink)).toBe(true);
    expect(isS3ConditionalQuarantineSink(genericSink)).toBe(false);
    expect(isS3ConditionalQuarantineSink(forgedSink)).toBe(false);
    expect(() =>
      assertMediaWorkerProductionDependencies({
        db: {},
        queue: {},
        safeFetch: storageProxy,
        receipts: durableReceiptStore(),
        quarantineSink,
        consumer: { start: () => undefined },
      }),
    ).not.toThrow();
    expect(() =>
      assertMediaWorkerProductionDependencies({
        db: {},
        queue: {},
        safeFetch: storageProxy,
        receipts: durableReceiptStore(),
        consumer: { start: () => undefined },
      }),
    ).toThrow("MEDIA_WORKER_DEPENDENCIES_REQUIRED");
    expect(() =>
      assertMediaWorkerProductionDependencies({
        db: {},
        queue: {},
        safeFetch: storageProxy,
        receipts: durableReceiptStore(),
        quarantineSink: genericSink,
        ...lyingAttestor,
        consumer: { start: () => undefined },
      }),
    ).toThrow("MEDIA_WORKER_DEPENDENCIES_REQUIRED");
    expect(() =>
      assertMediaWorkerProductionDependencies({
        db: {},
        queue: {},
        safeFetch: storageProxy,
        receipts: durableReceiptStore(),
        quarantineSink: genericSink,
        consumer: { start: () => undefined },
      }),
    ).toThrow("MEDIA_WORKER_DEPENDENCIES_REQUIRED");
    expect(() =>
      assertMediaWorkerProductionDependencies({
        db: {},
        queue: {},
        safeFetch: storageProxy,
        receipts: new InMemoryProviderOutputIngestReceiptStore(),
        quarantineSink,
        consumer: { start: () => undefined },
      }),
    ).toThrow("MEDIA_WORKER_DEPENDENCIES_REQUIRED");
    expect(() =>
      assertMediaWorkerProductionDependencies({
        db: {},
        queue: {},
        safeFetch: storageProxy,
        receipts: {
          kind: "durable",
          claim: async () => ({
            state: "claimed",
            quarantineKey: "quarantine/provider-output/ingest_12345678",
            claimToken: "duck-token",
          }),
          complete: async () => undefined,
          fail: async () => undefined,
        } satisfies ProviderOutputIngestReceiptStore,
        quarantineSink,
        consumer: { start: () => undefined },
      }),
    ).toThrow("MEDIA_WORKER_DEPENDENCIES_REQUIRED");
    expect(() =>
      assertMediaWorkerProductionDependencies({
        db: {},
        queue: {},
        safeFetch: storageProxy,
        receipts: durableReceiptStore(),
        quarantineSink: forgedSink,
        consumer: { start: () => undefined },
      }),
    ).toThrow("MEDIA_WORKER_DEPENDENCIES_REQUIRED");
  });
});
