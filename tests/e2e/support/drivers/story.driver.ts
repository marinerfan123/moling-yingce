import type { Page } from "@playwright/test";

export class StoryDriver {
  constructor(readonly page: Page) {}

  async draftEpisode(title = "Episode 1") {
    return { title, scenes: 3 };
  }
}
