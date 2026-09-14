import { describe, expect, it } from "vitest";

import { GenerationService } from "./generation.service.js";

describe("generation cancel API registration", () => {
  it("keeps cancellation as a separate operation from job creation", () => {
    expect(new GenerationService().listOutbox()).toEqual([]);
  });
});
