export class EpisodeContentService {
  assertSingleScriptAggregate(episode: { scriptId: string }) {
    if (!episode.scriptId) throw new Error("EPISODE_SCRIPT_MISSING");
    return episode.scriptId;
  }
}
