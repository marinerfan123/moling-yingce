import React from "react";

export function ModerationStatus({
  decision,
}: Readonly<{ decision: "approved" | "needs_review" | "rejected" | "missing" }>) {
  const label = decision === "missing" ? "等待安全审核" : `审核结果：${decision}`;
  return (
    <section aria-label="moderation-status">
      <h2>内容安全</h2>
      <span data-testid="moderation-decision">{label}</span>
    </section>
  );
}
