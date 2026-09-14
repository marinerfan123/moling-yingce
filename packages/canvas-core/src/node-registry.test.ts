import { describe, expect, it } from "vitest";
import { createNodeRegistry, missingNodeKinds, nodeKinds } from "./node-registry.js";

describe("node registry", () => {
  it("registers every NodeKind and keeps unknown as read-only fallback", () => {
    const registry = createNodeRegistry();
    expect(missingNodeKinds(registry)).toEqual([]);
    expect(registry.definitions.filter((definition) => definition.kind !== "unknown")).toHaveLength(18);
    expect(registry.get("unknown")?.readOnly).toBe(true);
    for (const kind of nodeKinds) {
      const definition = registry.get(kind);
      expect(definition?.defaultSize.width).toBeGreaterThanOrEqual(40);
      expect(definition?.migrate({ keep: true })).toEqual({ keep: true });
    }
  });
});
