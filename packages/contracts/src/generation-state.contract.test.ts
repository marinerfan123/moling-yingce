import { describe, expect, it } from "vitest";

import {
  GENERATION_JOB_STATES,
  GenerationCancellationStateSchema,
  NONTERMINAL_JOB_STATES,
  TERMINAL_JOB_STATES,
  isGenerationJobTerminal,
} from "./generation.js";

describe("generation job state contract", () => {
  it("keeps terminal and nonterminal state sets disjoint and exhaustive", () => {
    const terminal = new Set<string>(TERMINAL_JOB_STATES);
    const nonterminal = new Set<string>(NONTERMINAL_JOB_STATES);

    expect(TERMINAL_JOB_STATES.every((state) => !nonterminal.has(state))).toBe(true);
    expect(NONTERMINAL_JOB_STATES.every((state) => !terminal.has(state))).toBe(true);
    expect([...TERMINAL_JOB_STATES, ...NONTERMINAL_JOB_STATES].sort()).toEqual([...GENERATION_JOB_STATES].sort());
  });

  it("uses the terminal set as the exhaustive predicate source", () => {
    for (const state of GENERATION_JOB_STATES) {
      expect(isGenerationJobTerminal(state)).toBe(TERMINAL_JOB_STATES.includes(state as never));
    }
  });

  it("keeps provider cancellation orthogonal to job execution state", () => {
    expect(GenerationCancellationStateSchema.options).toEqual([
      "none",
      "requested",
      "acknowledged",
      "unsupported",
      "unknown",
    ]);
  });
});
