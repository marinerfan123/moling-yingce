import type { Page } from "@playwright/test";

export class StoryboardDriver {
  constructor(readonly page: Page) {}

  async createFrame(sceneId = "scene-1") {
    return { id: `frame-${sceneId}`, sceneId };
  }
}
