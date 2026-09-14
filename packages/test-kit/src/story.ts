import type { TestStoryParseProposal } from "./protocols.js";

export function storyProposalFixture(input: { scenes: number; characters: number }): TestStoryParseProposal {
  return {
    scenes: Array.from({ length: input.scenes }, (_, index) => ({
      id: `scene-${index + 1}`,
      summary: `Scene ${index + 1} summary`,
    })),
    characters: Array.from({ length: input.characters }, (_, index) => ({
      id: `character-${index + 1}`,
      name: `Character ${index + 1}`,
    })),
  };
}
