import React from "react";

export type AccessibilityEvent = Readonly<{ atMs: number; message: string }>;

export function aggregateLiveRegion(events: readonly AccessibilityEvent[], minIntervalMs = 2000): string[] {
  const accepted: string[] = [];
  let lastAt = Number.NEGATIVE_INFINITY;
  for (const event of events) {
    if (event.atMs - lastAt >= minIntervalMs) {
      accepted.push(event.message);
      lastAt = event.atMs;
    }
  }
  return accepted;
}

export function AccessibilityStatus({ message }: Readonly<{ message: string }>) {
  return (
    <div aria-live="polite" className="workspace-accessibility-status" role="status">
      {message}
    </div>
  );
}
