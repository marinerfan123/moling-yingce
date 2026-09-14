import type { EpisodeArchiveBlocker } from "../projects/episode-lifecycle.registry.js";
import type { GenerationJobState } from "./generation.service.js";

const NONTERMINAL_JOB_STATES = ["pending", "queued", "dispatching", "running", "reconciling"] as const;

export class GenerationArchiveBlocker {
  blockerFor(job: Readonly<{ jobId: string; state: GenerationJobState }>): EpisodeArchiveBlocker {
    return {
      id: `generation:${job.jobId}`,
      kind: "generation-job",
      ref: job.jobId,
      terminal: !NONTERMINAL_JOB_STATES.includes(job.state as never),
    };
  }

  coversEveryNonterminalState() {
    return [...NONTERMINAL_JOB_STATES];
  }
}
