import React from "react";

import type { GenerationJob } from "@comic-canvas/contracts";
import { isGenerationJobTerminal } from "@comic-canvas/contracts";

export function SingleJobResult({ job }: Readonly<{ job: GenerationJob }>) {
  return (
    <section aria-label="生成结果" className="single-job-result">
      <h2>生成结果</h2>
      <p data-testid="job-state">{job.state}</p>
      <p data-testid="job-terminal">{isGenerationJobTerminal(job.state) ? "terminal" : "active"}</p>
      {job.outputAssetVersionId ? <p data-testid="output-version">{job.outputAssetVersionId}</p> : null}
    </section>
  );
}
