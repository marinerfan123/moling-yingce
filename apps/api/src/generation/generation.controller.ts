import { BillingService } from "../billing/billing.service.js";
import {
  GenerationService,
  type GenerationCreateInput,
  type GenerationEstimateInput,
  type GenerationPrincipal,
} from "./generation.service.js";
import { JobCancellationService } from "./job-cancellation.service.js";

export class GenerationController {
  constructor(
    private readonly generation = new GenerationService({ billing: new BillingService() }),
    private readonly cancellation = new JobCancellationService(generation),
  ) {}

  estimate(principal: GenerationPrincipal, body: GenerationEstimateInput) {
    return this.generation.estimate(principal, body);
  }

  createJob(principal: GenerationPrincipal, body: GenerationCreateInput) {
    return this.generation.createJob(principal, body);
  }

  cancelJob(principal: GenerationPrincipal, projectId: string, jobId: string, body: { operationKey: string }) {
    return this.cancellation.cancel(principal, { projectId, jobId, operationKey: body.operationKey });
  }
}
