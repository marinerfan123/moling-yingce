import type { APIRequestContext, Page } from "@playwright/test";

export class GenerationDriver {
  constructor(
    readonly page: Page,
    readonly api: APIRequestContext,
  ) {}

  async requestImage(prompt = "cinematic comic frame") {
    return { jobId: "job-image-1", prompt };
  }
}
