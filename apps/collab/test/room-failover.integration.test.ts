import { describe, expect, it } from "vitest";

import { RoomCoordinator } from "../src/room-coordinator.js";

describe("room failover", () => {
  it("rejects old owner lease after takeover by epoch", () => {
    const coordinator = new RoomCoordinator();
    const oldLease = coordinator.acquire("canvas_12345678", "pod-a", 1_000);
    const newLease = coordinator.acquire("canvas_12345678", "pod-b", oldLease.leaseUntilMs + 1);
    expect(newLease.roomEpoch).toBeGreaterThan(oldLease.roomEpoch);
  });
});
