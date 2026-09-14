import React from "react";

export type ApprovalGatePolicyPreviewProps = Readonly<{
  rightsReady: boolean;
  moderationReady: boolean;
  disclosureReady: boolean;
  labelText: "本内容包含AI生成元素";
  placement: "top-left" | "top-right" | "bottom-left" | "bottom-right";
}>;

export function ApprovalGatePolicyPreview({
  rightsReady,
  moderationReady,
  disclosureReady,
  labelText,
  placement,
}: ApprovalGatePolicyPreviewProps) {
  const allow = rightsReady && moderationReady && disclosureReady;
  return (
    <section aria-label="approval-gate-policy">
      <h2>发布门禁</h2>
      <ul>
        <li>权利：{rightsReady ? "完成" : "缺失"}</li>
        <li>审核：{moderationReady ? "完成" : "缺失"}</li>
        <li>AI披露：{disclosureReady ? "完成" : "强制需要"}</li>
      </ul>
      <div data-testid="ai-disclosure-overlay" data-placement={placement}>
        {labelText}
      </div>
      <button disabled={!allow}>允许付费生成/导出</button>
    </section>
  );
}
