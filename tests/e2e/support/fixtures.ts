import { test as base, expect } from "@playwright/test";

import { BiblesDriver } from "./drivers/bibles.driver.js";
import { CanvasDriver } from "./drivers/canvas.driver.js";
import { ExportDriver } from "./drivers/export.driver.js";
import { GenerationDriver } from "./drivers/generation.driver.js";
import { ProjectDriver } from "./drivers/project.driver.js";
import { StoryDriver } from "./drivers/story.driver.js";
import { StoryboardDriver } from "./drivers/storyboard.driver.js";
import { TimelineDriver } from "./drivers/timeline.driver.js";

type ComicFixtures = {
  project: ProjectDriver;
  canvas: CanvasDriver;
  story: StoryDriver;
  bibles: BiblesDriver;
  generation: GenerationDriver;
  storyboard: StoryboardDriver;
  timeline: TimelineDriver;
  exportFlow: ExportDriver;
};

export const test = base.extend<ComicFixtures>({
  project: async ({ page, request }, use) => use(new ProjectDriver(page, request)),
  canvas: async ({ page }, use) => use(new CanvasDriver(page)),
  story: async ({ page }, use) => use(new StoryDriver(page)),
  bibles: async ({ page }, use) => use(new BiblesDriver(page)),
  generation: async ({ page, request }, use) => use(new GenerationDriver(page, request)),
  storyboard: async ({ page }, use) => use(new StoryboardDriver(page)),
  timeline: async ({ page }, use) => use(new TimelineDriver(page)),
  exportFlow: async ({ page, request }, use) => use(new ExportDriver(page, request)),
});

export { expect };
export { BiblesDriver, CanvasDriver, ExportDriver, GenerationDriver, ProjectDriver, StoryDriver, StoryboardDriver, TimelineDriver };
