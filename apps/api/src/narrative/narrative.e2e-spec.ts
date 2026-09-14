import { describe, expect, it } from "vitest";

import { apiModules } from "../app.module.js";
import { ScriptsService } from "./scripts.service.js";

describe("narrative script lifecycle", () => {
  it("reads, saves, lists and restores immutable script revisions", () => {
    const service = new ScriptsService();
    const initial = service.createScript("script_12345678");
    const lineId = initial.scenes[0]?.beats[0]?.shots[0]?.lines[0]?.id ?? "";
    const saved = service.save({
      scriptId: "script_12345678",
      expectedHeadRevisionId: initial.headRevisionId,
      operationId: "op_12345678",
      commands: [{ type: "line.edit", operationId: "op_22345678", lineId, text: "我们开始商业化制作。" }],
    });
    expect("status" in saved).toBe(false);
    const revisions = service.listRevisions("script_12345678");
    expect(revisions).toHaveLength(2);
    expect(revisions[0]?.aggregate.scenes[0]?.beats[0]?.shots[0]?.lines[0]?.id).toBe(lineId);
    const restored = service.restore({
      scriptId: "script_12345678",
      expectedHeadRevisionId: revisions.at(-1)?.id ?? "",
      restoreRevisionId: revisions[0]?.id ?? "",
      operationId: "op_32345678",
    });
    expect("status" in restored).toBe(false);
    expect(service.listRevisions("script_12345678")).toHaveLength(3);
    expect(apiModules).toContain("NarrativeModule");
  });

  it("returns deterministic 409 data on stale expected head with no new revision", () => {
    const service = new ScriptsService();
    const initial = service.createScript("script_87654321");
    const first = service.save({
      scriptId: "script_87654321",
      expectedHeadRevisionId: initial.headRevisionId,
      operationId: "op_12345678",
      commands: [
        { type: "scene.rename", operationId: "op_22345678", sceneId: initial.scenes[0]?.id ?? "", title: "新开场" },
      ],
    });
    expect("status" in first).toBe(false);
    const stale = service.save({
      scriptId: "script_87654321",
      expectedHeadRevisionId: initial.headRevisionId,
      operationId: "op_32345678",
      commands: [
        { type: "scene.rename", operationId: "op_42345678", sceneId: initial.scenes[0]?.id ?? "", title: "冲突标题" },
      ],
    });
    expect(stale).toMatchObject({ status: 409, reason: "SCRIPT_HEAD_CONFLICT" });
    expect(service.listRevisions("script_87654321")).toHaveLength(2);
  });
});
