export type EpisodeArchiveBlocker = Readonly<{
  id: string;
  kind: string;
  ref: string;
  terminal: boolean;
}>;

export type EpisodeCopyContributorResult = Readonly<{
  contributor: string;
  oldToNewIdMap: Readonly<Record<string, string>>;
}>;

export type EpisodeCopyContributor = Readonly<{
  name: string;
  copy(input: { operationId: string; remap: Readonly<Record<string, string>> }): EpisodeCopyContributorResult;
}>;

export class EpisodeLifecycleRegistry {
  readonly #contributors = new Map<string, EpisodeCopyContributor>();
  readonly #blockers = new Map<string, EpisodeArchiveBlocker[]>();

  registerCopyContributor(contributor: EpisodeCopyContributor) {
    this.#contributors.set(contributor.name, contributor);
  }

  requireContributor(name: string) {
    const contributor = this.#contributors.get(name);
    if (!contributor) throw new Error(`EPISODE_COPY_CONTRIBUTOR_MISSING ${name}`);
    return contributor;
  }

  addArchiveBlocker(episodeId: string, blocker: EpisodeArchiveBlocker) {
    const existing = this.#blockers.get(episodeId) ?? [];
    this.#blockers.set(episodeId, [...existing, blocker]);
  }

  assertCanArchive(episodeId: string) {
    const active = (this.#blockers.get(episodeId) ?? []).filter((blocker) => !blocker.terminal);
    if (active.length > 0)
      throw new Error(`EPISODE_ARCHIVE_BLOCKED ${active.map((blocker) => blocker.kind).join(",")}`);
    return true;
  }
}
