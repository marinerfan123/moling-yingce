import { describe, expect, it } from "vitest";
import { bootstrapWorkEvent } from "../src/work-event-scope.js";

describe("work event scope", () => {
  it("bootstraps only from opaque event route and hash", async () => {
    await expect(bootstrapWorkEvent("event-1", "generation", "image.generate", "hash-1")).resolves.toMatchObject({
      subject: { eventId: "event-1", route: "image.generate", payloadHash: "hash-1" },
    });
    await expect(bootstrapWorkEvent("", "generation", "image.generate", "hash-1")).rejects.toThrow(/INVALID/);
  });
});
