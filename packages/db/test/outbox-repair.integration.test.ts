import { describe, expect, it } from "vitest";
import { requeueOutbox } from "../src/outbox-repair.js";

describe("outbox repair", () => {
  it("requires event id, expected attempt and reason", () => {
    expect(requeueOutbox({ eventId: "event-1", expectedAttempt: 2, reason: "root cause fixed" })).toMatchObject({
      dryRun: true,
    });
    expect(() => requeueOutbox({ eventId: "", expectedAttempt: 2, reason: "x" })).toThrow(/EVENT_ID/);
    expect(() => requeueOutbox({ eventId: "event-1", expectedAttempt: 2, reason: "" })).toThrow(/REASON/);
  });
});
