import React from "react";

export type RightsRecordEditorProps = Readonly<{
  subjectLabel: string;
  canManageRights: boolean;
  territory: readonly string[];
  decision?: "approved" | "restricted" | "rejected" | "expired";
}>;

export function RightsRecordEditor({ subjectLabel, canManageRights, territory, decision }: RightsRecordEditorProps) {
  return (
    <section aria-label="rights-record-editor">
      <h2>权利记录</h2>
      <p>{subjectLabel}</p>
      <p>授权地区：{territory.join(", ")}</p>
      <button disabled={!canManageRights}>{decision ? "追加新版本" : "记录权利证据"}</button>
      {decision ? <span data-testid="rights-decision">{decision}</span> : <span>等待权利证据</span>}
    </section>
  );
}
