import type { Page } from "@playwright/test";

export class TimelineDriver {
  constructor(readonly page: Page) {}

  async addClip(assetId = "asset-1") {
    return { id: `clip-${assetId}`, assetId, fps: 25 };
  }
}
