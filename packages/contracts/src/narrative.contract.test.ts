import { describe, expect, it } from "vitest";

import { SaveScriptRequestSchema, ScriptAggregateSchema, ScriptConflictSchema, ScriptRevisionSchema } from "./index.js";

const sha = `sha256:${"b".repeat(64)}`;
const aggregate = {
  scriptId: "script_12345678",
  headRevisionId: "scriptrev_12345678",
  sourceSha256: sha,
  scenes: [
    {
      id: "scene_12345678",
      title: "开场",
      beats: [
        {
          id: "beat_12345678",
          summary: "主角进入画面",
          shots: [
            { id: "shot_12345678", description: "近景", lines: [{ id: "line_12345678", speaker: "A", text: "走吧" }] },
          ],
        },
      ],
    },
  ],
};

describe("narrative contracts", () => {
  it("preserves stable scene/beat/shot/line identities in aggregate revisions", () => {
    const parsed = ScriptAggregateSchema.parse(aggregate);
    expect(parsed.scenes[0]?.beats[0]?.shots[0]?.lines[0]?.id).toBe("line_12345678");
    expect(
      ScriptRevisionSchema.parse({
        id: "scriptrev_87654321",
        scriptId: parsed.scriptId,
        parentRevisionId: parsed.headRevisionId,
        canonicalSha256: sha,
        sourceSha256: sha,
        createdAt: new Date().toISOString(),
        operationId: "op_12345678",
        aggregate: { ...parsed, headRevisionId: "scriptrev_87654321" },
      }).parentRevisionId,
    ).toBe("scriptrev_12345678");
  });

  it("requires expected head and operation id for every save batch", () => {
    expect(
      SaveScriptRequestSchema.parse({
        expectedHeadRevisionId: "scriptrev_12345678",
        operationId: "op_12345678",
        commands: [{ type: "line.edit", operationId: "op_22345678", lineId: "line_12345678", text: "继续走" }],
      }),
    ).toMatchObject({ operationId: "op_12345678" });
    expect(() => SaveScriptRequestSchema.parse({ commands: [] })).toThrow();
  });

  it("models stale-head conflicts without partial writes", () => {
    expect(
      ScriptConflictSchema.parse({
        status: 409,
        reason: "SCRIPT_HEAD_CONFLICT",
        baseRevisionId: "scriptrev_12345678",
        headRevisionId: "scriptrev_87654321",
        localOperationId: "op_12345678",
      }),
    ).toMatchObject({ status: 409 });
  });
});
