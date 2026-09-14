import type { Page } from "@playwright/test";

export class BiblesDriver {
  constructor(readonly page: Page) {}

  async createCharacter(name = "Lead") {
    return { id: `character-${name.toLowerCase()}`, name };
  }
}
