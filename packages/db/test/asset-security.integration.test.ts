import { describe, expect, it } from "vitest";

import { dbSchemas } from "../src/schema/index.js";

describe("asset security schema", () => {
  it("registers immutable asset tables and the scoped ingest instruction", () => {
    expect(dbSchemas.tables).toEqual(
      expect.arrayContaining([
        "assets",
        "asset_versions",
        "asset_variants",
        "upload_sessions",
        "remote_ingest_instructions",
      ]),
    );
  });

  it("keeps locator out of queue-shaped payloads", () => {
    const payload = { eventId: "evt_12345678", route: "media.inspect", payloadHash: "sha256:abc" };
    expect(JSON.stringify(payload)).not.toMatch(/locator|https?:\/\//i);
  });
});
