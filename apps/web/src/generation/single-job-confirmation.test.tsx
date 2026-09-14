/* @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { GenerationEstimate } from "@comic-canvas/contracts";
import { SingleJobConfirmation } from "./single-job-confirmation.js";

afterEach(() => cleanup());

const estimate: GenerationEstimate = {
  tenantId: "tenant_12345678",
  projectId: "project_12345678",
  sourceNodeId: "node_12345678",
  providerKey: "fake",
  modelKey: "image.alpha",
  capability: "image",
  inputSnapshotHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  configSnapshotHash: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  currency: "CNY",
  estimatedMicros: "230000",
  lines: [{ label: "image", micros: "230000" }],
  retentionDays: 30,
  cancellation: { state: "requested", billingTerms: "排队中取消不计费，运行后以供应商回执为准" },
};

describe("single job confirmation", () => {
  it("shows input, model, price, retention and cancellation terms before confirm", () => {
    const onConfirm = vi.fn();
    render(
      <SingleJobConfirmation
        estimate={estimate}
        diff={{
          input: ["画布输入 hash 变化"],
          model: ["模型 image.beta -> image.alpha"],
          price: ["价格 +0.23 CNY"],
        }}
        onConfirm={onConfirm}
      />,
    );

    expect(screen.getByTestId("input-diff")).toHaveTextContent("画布输入 hash 变化");
    expect(screen.getByTestId("model-diff")).toHaveTextContent("image.alpha");
    expect(screen.getByTestId("price-diff")).toHaveTextContent("价格");
    expect(screen.getByTestId("estimate-total")).toHaveTextContent("CNY 0.2300");
    expect(screen.getByText("30 天")).toBeInTheDocument();
    expect(screen.getByText("排队中取消不计费，运行后以供应商回执为准")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "确认生成" })).toBeDisabled();
  });

  it("separates estimate from confirm and never calls a driver shortcut", () => {
    const onEstimate = vi.fn();
    const onConfirm = vi.fn();
    render(
      <SingleJobConfirmation
        estimate={estimate}
        diff={{ input: [], model: [], price: [] }}
        onEstimate={onEstimate}
        onConfirm={onConfirm}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "重新估算" }));
    expect(onEstimate).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "确认生成" }));
    expect(onConfirm).toHaveBeenCalledWith(estimate);
  });
});
