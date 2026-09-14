import { describe, expect, it } from "vitest";

import { resolveWorkspaceMode } from "./workspace-mode.js";

describe("workspace mode", () => {
  it("does not let width or zoom silently change edit/review authority", () => {
    expect(resolveWorkspaceMode("/projects/p/episodes/e/canvas", ["canvas:edit"])).toBe("edit");
    expect(resolveWorkspaceMode("/projects/p/episodes/e/review", ["canvas:edit"])).toBe("review");
    expect(resolveWorkspaceMode("/projects/p/episodes/e/canvas", ["project:view"])).toBe("review");
  });
});
