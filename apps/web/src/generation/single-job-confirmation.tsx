import React, { useMemo, useState } from "react";

import type { GenerationEstimate } from "@comic-canvas/contracts";

export type GenerationDiff = Readonly<{
  input: readonly string[];
  model: readonly string[];
  price: readonly string[];
}>;

export type SingleJobConfirmationProps = Readonly<{
  estimate: GenerationEstimate;
  diff: GenerationDiff;
  onEstimate?: () => void;
  onConfirm?: (estimate: GenerationEstimate) => void;
}>;

export function SingleJobConfirmation({ estimate, diff, onEstimate, onConfirm }: SingleJobConfirmationProps) {
  const [estimated, setEstimated] = useState(false);
  const hasDiff = diff.input.length + diff.model.length + diff.price.length > 0;
  const totalLabel = useMemo(
    () => `${estimate.currency} ${(Number(estimate.estimatedMicros) / 1_000_000).toFixed(4)}`,
    [estimate.currency, estimate.estimatedMicros],
  );

  return (
    <section aria-label="单次生成确认" className="single-job-confirmation">
      <header>
        <h2>生成确认</h2>
        <p data-testid="model-choice">
          {estimate.providerKey} / {estimate.modelKey}
        </p>
      </header>
      <div aria-label="输入变化" data-testid="input-diff">
        {diff.input.map((item) => (
          <p key={item}>{item}</p>
        ))}
      </div>
      <div aria-label="模型变化" data-testid="model-diff">
        {diff.model.map((item) => (
          <p key={item}>{item}</p>
        ))}
      </div>
      <div aria-label="价格变化" data-testid="price-diff">
        {diff.price.map((item) => (
          <p key={item}>{item}</p>
        ))}
      </div>
      <dl>
        <dt>费用</dt>
        <dd data-testid="estimate-total">{totalLabel}</dd>
        <dt>素材保留</dt>
        <dd>{estimate.retentionDays} 天</dd>
        <dt>取消计费</dt>
        <dd>{estimate.cancellation.billingTerms}</dd>
      </dl>
      <button
        type="button"
        onClick={() => {
          setEstimated(true);
          onEstimate?.();
        }}
      >
        重新估算
      </button>
      <button type="button" disabled={!estimated || hasDiff} onClick={() => onConfirm?.(estimate)}>
        确认生成
      </button>
      <p aria-live="polite" data-testid="confirmation-state">
        {hasDiff ? "变更后需要重新确认" : estimated ? "估算已确认" : "等待估算"}
      </p>
    </section>
  );
}
