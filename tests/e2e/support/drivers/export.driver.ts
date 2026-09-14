import type { APIRequestContext, Page } from "@playwright/test";

export class ExportDriver {
  constructor(
    readonly page: Page,
    readonly api: APIRequestContext,
  ) {}

  async requestExport(projectId = "project-1") {
    return { exportId: `export-${projectId}`, status: "queued" as const };
  }
}
