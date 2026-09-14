import "@testing-library/jest-dom/vitest";

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { WorkspaceShell } from "./workspace-shell.js";

describe("WorkspaceShell", () => {
  it("keeps edit mode across desktop zoom-like reflow inputs", () => {
    render(
      <WorkspaceShell
        route="/projects/p/episodes/e/canvas"
        capabilities={["canvas:edit"]}
        viewportWidth={390}
        viewportHeight={844}
      />,
    );
    expect(screen.getByText("画布编辑")).toBeInTheDocument();
    expect(screen.getByTestId("work-rect")).toHaveAttribute("data-width", "338");
  });

  it("resolves mobile review route without edit token", () => {
    render(
      <WorkspaceShell
        route="/projects/p/episodes/e/review"
        capabilities={["project:view"]}
        viewportWidth={390}
        viewportHeight={844}
      />,
    );
    expect(screen.getByText("审阅模式")).toBeInTheDocument();
  });
});
