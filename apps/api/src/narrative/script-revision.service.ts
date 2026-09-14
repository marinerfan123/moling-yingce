import { createHash } from "node:crypto";

export type Line = { id: string; speaker: string; text: string };
export type Shot = { id: string; description: string; lines: Line[] };
export type Beat = { id: string; summary: string; shots: Shot[] };
export type Scene = { id: string; title: string; beats: Beat[] };
export type ScriptAggregate = { scriptId: string; headRevisionId: string; sourceSha256: string; scenes: Scene[] };
export type ScriptCommand =
  | { type: "scene.rename"; operationId: string; sceneId: string; title: string }
  | { type: "line.edit"; operationId: string; lineId: string; text: string }
  | { type: "shot.describe"; operationId: string; shotId: string; description: string };

export type ScriptRevision = Readonly<{
  id: string;
  scriptId: string;
  parentRevisionId: string | null;
  canonicalSha256: string;
  sourceSha256: string;
  createdAt: string;
  operationId: string;
  aggregate: ScriptAggregate;
}>;

const hash = (value: unknown) => `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
const id = (prefix: string, seed: string) =>
  `${prefix}_${createHash("sha256").update(seed).digest("hex").slice(0, 16)}`;

export class ScriptRevisionService {
  createInitial(scriptId: string, source = "开场：主角准备创作第一集。") {
    const sourceSha256 = `sha256:${createHash("sha256").update(Buffer.from(source, "utf8")).digest("hex")}`;
    const revisionId = id("scriptrev", `${scriptId}:initial:${sourceSha256}`);
    const aggregate: ScriptAggregate = {
      scriptId,
      headRevisionId: revisionId,
      sourceSha256,
      scenes: [
        {
          id: id("scene", `${scriptId}:scene:1`),
          title: "开场",
          beats: [
            {
              id: id("beat", `${scriptId}:beat:1`),
              summary: "建立角色与目标",
              shots: [
                {
                  id: id("shot", `${scriptId}:shot:1`),
                  description: "角色站在无限画布前",
                  lines: [{ id: id("line", `${scriptId}:line:1`), speaker: "主角", text: "开始吧。" }],
                },
              ],
            },
          ],
        },
      ],
    };
    const revision = this.revision(scriptId, null, "op_initial01", aggregate, sourceSha256);
    revision.aggregate.headRevisionId = revision.id;
    return revision;
  }

  append(current: ScriptRevision, operationId: string, commands: readonly ScriptCommand[]) {
    const nextAggregate = structuredClone(current.aggregate);
    for (const command of commands) this.apply(nextAggregate, command);
    const revision = this.revision(current.scriptId, current.id, operationId, nextAggregate, current.sourceSha256);
    revision.aggregate.headRevisionId = revision.id;
    return revision;
  }

  restore(current: ScriptRevision, target: ScriptRevision, operationId: string) {
    const aggregate = structuredClone(target.aggregate);
    const revision = this.revision(current.scriptId, current.id, operationId, aggregate, target.sourceSha256);
    revision.aggregate.headRevisionId = revision.id;
    return revision;
  }

  conflict(baseRevisionId: string, headRevisionId: string, localOperationId: string) {
    return {
      status: 409 as const,
      reason: "SCRIPT_HEAD_CONFLICT" as const,
      baseRevisionId,
      headRevisionId,
      localOperationId,
    };
  }

  private revision(
    scriptId: string,
    parentRevisionId: string | null,
    operationId: string,
    aggregate: ScriptAggregate,
    sourceSha256: string,
  ): ScriptRevision {
    const canonicalSha256 = hash(aggregate);
    return {
      id: id("scriptrev", `${scriptId}:${parentRevisionId ?? "root"}:${operationId}:${canonicalSha256}`),
      scriptId,
      parentRevisionId,
      canonicalSha256,
      sourceSha256,
      createdAt: new Date().toISOString(),
      operationId,
      aggregate,
    };
  }

  private apply(aggregate: ScriptAggregate, command: ScriptCommand) {
    if (command.type === "scene.rename") {
      const scene = aggregate.scenes.find((item) => item.id === command.sceneId);
      if (!scene) throw new Error("SCENE_NOT_FOUND");
      scene.title = command.title;
      return;
    }
    for (const scene of aggregate.scenes) {
      for (const beat of scene.beats) {
        for (const shot of beat.shots) {
          if (command.type === "shot.describe" && shot.id === command.shotId) {
            shot.description = command.description;
            return;
          }
          const line = shot.lines.find((item) => command.type === "line.edit" && item.id === command.lineId);
          if (line && command.type === "line.edit") {
            line.text = command.text;
            return;
          }
        }
      }
    }
    throw new Error("SCRIPT_TARGET_NOT_FOUND");
  }
}
