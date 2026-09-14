import { describe, expect, it } from "vitest";

import { RoomCoordinator } from "../src/room-coordinator.js";

describe("two replica owner routing", () => {
  it("routes both replicas to the current owner and increments epoch on takeover", () => {
    const coordinator = new RoomCoordinator();
    const first = coordinator.acquire("canvas_12345678", "pod-a", 1_000);
    expect(coordinator.acquire("canvas_12345678", "pod-b", 2_000)).toEqual(first);
    expect(coordinator.routeToOwner("canvas_12345678")).toBe("pod-a");
    const takeover = coordinator.acquire("canvas_12345678", "pod-b", 40_000);
    expect(takeover).toMatchObject({ ownerPodId: "pod-b", roomEpoch: 2 });
  });
});
