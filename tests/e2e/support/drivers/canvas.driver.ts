import type { Page } from "@playwright/test";

export class CanvasDriver {
  constructor(readonly page: Page) {}

  async open(projectId: string) {
    await this.page.goto(`/projects/${projectId}/canvas`);
  }

  async addNode(kind: string) {
    return { id: `node-${kind}`, kind };
  }
}
