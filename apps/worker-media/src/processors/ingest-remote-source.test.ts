import { describe, expect, it } from "vitest";
import { ingestRemoteSource } from "./ingest-remote-source.js";
describe("remote ingest", () => {
  it("redacts locator diagnostics and replays idempotently", () => {
    const values = new Map<string, unknown>();
    const markerStore = {
      get: (e: string, s: string) => values.get(`${e}:${s}`),
      mark: (e: string, s: string, v: unknown) => {
        values.set(`${e}:${s}`, v);
        return { inserted: true, value: v };
      },
      has: () => false,
    };
    const input = { instructionId: "ingest_12345678", locator: "https://example.com/private.mp4", maxBytes: 10 };
    const a = ingestRemoteSource(input, { eventId: "evt_1", markerStore });
    const b = ingestRemoteSource(input, { eventId: "evt_1", markerStore });
    expect(a).toEqual(b);
    expect(JSON.stringify(a)).not.toContain("https://");
  });
});
