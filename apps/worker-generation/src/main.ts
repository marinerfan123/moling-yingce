import { createServer } from "node:http";
import { generationAdapters } from "./adapter-registry.js";
import { GenerationConsumer } from "./generation-consumer.js";
import { JobProcessor } from "./job-processor.js";
import type { AttemptRepository } from "./attempt-service.js";
import { PostgresAttemptRepository } from "./postgres-attempt-repository.js";
import type { ModelProviderAdapter } from "./provider-contracts.js";

export function assertGenerationWorkerEnvironment(env: NodeJS.ProcessEnv = process.env) {
  if (env["NODE_ENV"] === "production" && env["COMIC_CANVAS_ENABLE_FAKE_PROVIDER"] === "true") {
    throw new Error("FAKE_PROVIDER_FORBIDDEN_IN_PRODUCTION");
  }
  return true;
}
export type GenerationWorkerProductionDependencies = Readonly<{
  db?: object;
  queue?: object;
  adapter?: ModelProviderAdapter;
  consumer?: { start(processor: JobProcessor): Promise<void> | void };
  attempts?: AttemptRepository;
}>;
export function assertGenerationWorkerProductionDependencies(
  dependencies: GenerationWorkerProductionDependencies,
): asserts dependencies is Required<GenerationWorkerProductionDependencies> {
  if (
    !dependencies.db ||
    !dependencies.queue ||
    !dependencies.adapter ||
    typeof dependencies.adapter.submit !== "function" ||
    !dependencies.consumer ||
    typeof dependencies.consumer.start !== "function"
  )
    throw new Error("GENERATION_WORKER_DEPENDENCIES_REQUIRED");
  if (!(dependencies.attempts instanceof PostgresAttemptRepository))
    throw new Error("GENERATION_WORKER_POSTGRES_ATTEMPT_REPOSITORY_REQUIRED");
}

export function composeGenerationWorkerRuntime(dependencies: GenerationWorkerProductionDependencies) {
  assertGenerationWorkerProductionDependencies(dependencies);
  const processor = new JobProcessor({ attempts: dependencies.attempts, adapter: dependencies.adapter });
  return Object.freeze({
    db: dependencies.db,
    queue: dependencies.queue,
    attempts: dependencies.attempts,
    adapter: dependencies.adapter,
    consumer: dependencies.consumer,
    processor,
  });
}

export function startGenerationWorker(dependencies: GenerationWorkerProductionDependencies = {}) {
  assertGenerationWorkerEnvironment();
  if (process.env["NODE_ENV"] === "production") {
    const runtime = composeGenerationWorkerRuntime(dependencies);
    void runtime.consumer.start(runtime.processor);
  }
  return createServer((_req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(buildGenerationHealth()));
  }).listen(Number(process.env["HEALTH_PORT"] ?? 3104), "127.0.0.1");
}

export function buildGenerationHealth(readiness: "ready" | "not_ready" = "ready") {
  return {
    status: "ok" as const,
    service: "worker-generation",
    version: process.env["RELEASE_SHA"] ?? "test",
    readiness,
    adapters: generationAdapters().length,
  };
}

export function createGenerationConsumer() {
  return new GenerationConsumer();
}

export function createJobProcessor(options: ConstructorParameters<typeof JobProcessor>[0] = {}) {
  return new JobProcessor(options);
}

if (process.env["COMIC_CANVAS_BOOT"] === "worker-generation") {
  startGenerationWorker();
}
