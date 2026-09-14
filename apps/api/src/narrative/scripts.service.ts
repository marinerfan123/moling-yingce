import { ScriptRevisionService, type ScriptCommand, type ScriptRevision } from "./script-revision.service.js";

export class ScriptsService {
  readonly #revisions = new Map<string, ScriptRevision[]>();

  constructor(private readonly revisionService = new ScriptRevisionService()) {}

  createScript(scriptId: string, source?: string) {
    const revision = this.revisionService.createInitial(scriptId, source);
    this.#revisions.set(scriptId, [revision]);
    return revision.aggregate;
  }

  read(scriptId: string) {
    return this.head(scriptId).aggregate;
  }

  listRevisions(scriptId: string) {
    return [...(this.#revisions.get(scriptId) ?? [])];
  }

  save(input: {
    scriptId: string;
    expectedHeadRevisionId: string;
    operationId: string;
    commands: readonly ScriptCommand[];
  }) {
    const current = this.head(input.scriptId);
    if (current.id !== input.expectedHeadRevisionId) {
      return this.revisionService.conflict(input.expectedHeadRevisionId, current.id, input.operationId);
    }
    const revision = this.revisionService.append(current, input.operationId, input.commands);
    this.#revisions.set(input.scriptId, [...this.listRevisions(input.scriptId), revision]);
    return revision.aggregate;
  }

  restore(input: { scriptId: string; expectedHeadRevisionId: string; restoreRevisionId: string; operationId: string }) {
    const current = this.head(input.scriptId);
    if (current.id !== input.expectedHeadRevisionId) {
      return this.revisionService.conflict(input.expectedHeadRevisionId, current.id, input.operationId);
    }
    const target = this.listRevisions(input.scriptId).find((revision) => revision.id === input.restoreRevisionId);
    if (!target) throw new Error("SCRIPT_REVISION_NOT_FOUND");
    const revision = this.revisionService.restore(current, target, input.operationId);
    this.#revisions.set(input.scriptId, [...this.listRevisions(input.scriptId), revision]);
    return revision.aggregate;
  }

  private head(scriptId: string) {
    const revisions = this.#revisions.get(scriptId);
    const revision = revisions?.at(-1);
    if (!revision) throw new Error("SCRIPT_NOT_FOUND");
    return revision;
  }
}
