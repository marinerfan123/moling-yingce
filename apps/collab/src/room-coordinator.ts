export type RoomLease = Readonly<{ canvasId: string; ownerPodId: string; roomEpoch: number; leaseUntilMs: number }>;

export class RoomCoordinator {
  readonly #leases = new Map<string, RoomLease>();

  acquire(canvasId: string, ownerPodId: string, nowMs = Date.now()) {
    const current = this.#leases.get(canvasId);
    if (current && current.leaseUntilMs > nowMs && current.ownerPodId !== ownerPodId) return current;
    const lease = {
      canvasId,
      ownerPodId,
      roomEpoch: (current?.roomEpoch ?? 0) + (current?.ownerPodId === ownerPodId ? 0 : 1),
      leaseUntilMs: nowMs + 30_000,
    };
    this.#leases.set(canvasId, lease);
    return lease;
  }

  routeToOwner(canvasId: string) {
    const lease = this.#leases.get(canvasId);
    if (!lease) throw new Error("ROOM_OWNER_MISSING");
    return lease.ownerPodId;
  }
}
