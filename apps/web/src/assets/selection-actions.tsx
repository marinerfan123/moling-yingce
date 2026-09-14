import React from "react";

import type { CurrentSelectionPointer, SelectionRecord } from "@comic-canvas/contracts";
import { selectionPointerMatchesRecord } from "@comic-canvas/contracts";

export function SelectionActions({
  record,
  pointer,
  onSelect,
}: Readonly<{
  record: SelectionRecord;
  pointer?: CurrentSelectionPointer;
  onSelect?: (record: SelectionRecord) => void;
}>) {
  const isCurrent = pointer ? selectionPointerMatchesRecord(pointer, record) : false;
  return (
    <section aria-label="候选素材选择" className="selection-actions">
      <p data-testid="selection-output">{record.assetVersionId}</p>
      <p data-testid="selection-approval">{record.approvalState}</p>
      <button type="button" disabled={isCurrent || record.outputState !== "ready"} onClick={() => onSelect?.(record)}>
        设为当前候选
      </button>
    </section>
  );
}
