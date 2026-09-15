import { createServer } from "node:http";
import { isS3ConditionalQuarantineSink } from "@comic-canvas/storage/safe-fetch-attestation";
import {
  InMemoryProviderOutputIngestReceiptStore,
  type SafeFetchQuarantineSink,
  type ProviderOutputIngestReceiptStore,
  type SafeFetchProxy,
} from "./processors/ingest-provider-output.js";
import { PostgresProviderOutputIngestReceiptStore } from "./processors/postgres-provider-output-ingest-receipts.js";
import { mediaProcessors, registerDefaultMediaProcessors } from "./processor-registry.js";

registerDefaultMediaProcessors();
export type MediaWorkerProductionDependencies = Readonly<{
  db?: object;
  queue?: object;
  safeFetch?: SafeFetchProxy;
  receipts?: ProviderOutputIngestReceiptStore;
  quarantineSink?: SafeFetchQuarantineSink;
  consumer?: { start(): Promise<void> | void };
  referenceOnly?: boolean;
}>;

export function assertMediaWorkerProductionDependencies(
  dependencies: MediaWorkerProductionDependencies,
): asserts dependencies is Required<MediaWorkerProductionDependencies> {
  if (
    !dependencies.db ||
    !dependencies.queue ||
    !dependencies.safeFetch ||
    !dependencies.receipts ||
    !dependencies.quarantineSink ||
    !dependencies.consumer ||
    typeof dependencies.safeFetch.fetch !== "function" ||
    !(dependencies.receipts instanceof PostgresProviderOutputIngestReceiptStore) ||
    dependencies.receipts instanceof InMemoryProviderOutputIngestReceiptStore ||
    !isS3ConditionalQuarantineSink(dependencies.quarantineSink) ||
    typeof dependencies.consumer.start !== "function"
  )
    throw new Error("MEDIA_WORKER_DEPENDENCIES_REQUIRED");
}

export function startMediaWorker(dependencies: MediaWorkerProductionDependencies = {}) {
  if (process.env["NODE_ENV"] === "production") {
    assertMediaWorkerProductionDependencies(dependencies);
    void dependencies.consumer.start();
  }
  const readiness = dependencies.referenceOnly ? "not_ready" : "ready";
  return createServer((_req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(buildMediaHealth(readiness)));
  }).listen(Number(process.env["HEALTH_PORT"] ?? 3105), "127.0.0.1");
}

export function buildMediaHealth(readiness: "ready" | "not_ready" = "ready") {
  return {
    status: "ok" as const,
    service: "worker-media",
    version: process.env["RELEASE_SHA"] ?? "test",
    readiness,
    processors: mediaProcessors().length,
    ffmpeg: "7.1.1",
    clamav: "signed-test-snapshot",
  };
}

if (process.env["COMIC_CANVAS_BOOT"] === "worker-media") {
  if (process.env["NODE_ENV"] === "production") {
    const { createProductionMediaDependencies } = await import("./production-bootstrap.js");
    startMediaWorker(createProductionMediaDependencies());
  } else startMediaWorker();
}
