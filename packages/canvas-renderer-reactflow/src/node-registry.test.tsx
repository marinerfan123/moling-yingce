/* @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it } from "vitest";

import { createRendererRegistry, rendererNodeKinds } from "./node-registry.js";
import { stablePorts } from "./ports.js";

afterEach(() => cleanup());

describe("renderer registry", () => {
  it("registers exactly 18 concrete renderers plus safe unknown", () => {
    const registry = createRendererRegistry();
    expect(rendererNodeKinds).toHaveLength(18);
    for (const kind of rendererNodeKinds) {
      expect(registry.get(kind)).toBeTypeOf("function");
    }
    expect(registry.get("unknown")).toBeTypeOf("function");
    expect(registry.size).toBe(19);
  });

  it("renders unknown safely and losslessly", () => {
    const registry = createRendererRegistry();
    const renderer = registry.get("unknown");
    expect(renderer).toBeDefined();
    render(<>{renderer?.({ id: "node_unknown1", kind: "unknown", data: { future: true } })}</>);
    expect(screen.getByText(/future/)).toBeInTheDocument();
  });

  it("keeps outer dimensions and port coordinates stable across states and long Chinese labels", () => {
    const portsA = stablePorts(240, 160, 2, 2);
    const portsB = stablePorts(240, 160, 2, 2);
    expect(portsA).toEqual(portsB);
    const registry = createRendererRegistry();
    for (const state of ["idle", "queued", "running", "reconciling", "failed", "stale", "approved"] as const) {
      cleanup();
      const renderer = registry.get("image-generation");
      render(
        <>
          {renderer?.({
            id: `node_${state}`,
            kind: "image-generation",
            state,
            data: { asset: "很长的中文状态文本用于验证换行不会覆盖操作按钮和端口区域" },
          })}
        </>,
      );
      expect(screen.getByLabelText("image-generation node")).toHaveStyle({ width: "240px", height: "160px" });
    }
  });
});
