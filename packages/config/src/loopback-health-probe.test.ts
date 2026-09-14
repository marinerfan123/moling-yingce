import { afterEach, describe, expect, it } from "vitest";
import { createLoopbackHealthServer, listenOnLoopback, probeLoopbackHealth } from "./loopback-health-probe.js";

const servers: ReturnType<typeof createLoopbackHealthServer>[] = [];

afterEach(async () => {
  await Promise.all(servers.map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
  servers.length = 0;
});

describe("loopback health probe", () => {
  it("returns the shared health contract over 127.0.0.1", async () => {
    const server = createLoopbackHealthServer({
      service: "worker-generation",
      version: "test",
      readiness: () => "not_ready",
    });
    servers.push(server);
    const port = await listenOnLoopback(server);

    await expect(probeLoopbackHealth(port)).resolves.toEqual({
      status: "ok",
      service: "worker-generation",
      version: "test",
      readiness: "not_ready",
    });
  });
});
