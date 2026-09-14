import "@testing-library/jest-dom/vitest";

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { appRoutes } from "../app/router.js";
import { ApprovalGatePolicyPreview } from "./approval-gate-policy.js";
import { ModerationStatus } from "./moderation-status.js";
import { RightsRecordEditor } from "./rights-record-editor.js";

describe("governance UI", () => {
  it("renders rights editor and denies edits without rights:manage", () => {
    render(<RightsRecordEditor subjectLabel="角色设定图" canManageRights={false} territory={["CN"]} />);
    expect(screen.getByRole("button", { name: "记录权利证据" })).toBeDisabled();
    expect(screen.getByText("等待权利证据")).toBeInTheDocument();
  });

  it("previews non-waivable AI disclosure overlay before export", () => {
    render(
      <ApprovalGatePolicyPreview
        rightsReady
        moderationReady
        disclosureReady={false}
        labelText="本内容包含AI生成元素"
        placement="bottom-right"
      />,
    );
    expect(screen.getByTestId("ai-disclosure-overlay")).toHaveTextContent("本内容包含AI生成元素");
    expect(screen.getByRole("button", { name: "允许付费生成/导出" })).toBeDisabled();
    expect(appRoutes).toContain("/governance");
  });

  it("shows moderation status without provider payload", () => {
    render(<ModerationStatus decision="needs_review" />);
    expect(screen.getByTestId("moderation-decision")).toHaveTextContent("needs_review");
  });
});
