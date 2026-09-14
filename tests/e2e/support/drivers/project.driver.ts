import type { APIRequestContext, Page } from "@playwright/test";

export class ProjectDriver {
  constructor(
    readonly page: Page,
    readonly api: APIRequestContext,
  ) {}

  async create(name = "Commercial Test Project") {
    return { id: `project-${name.toLowerCase().replaceAll(" ", "-")}`, name };
  }
}
