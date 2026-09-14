import React from "react";

export function Tooltip({ label, children }: React.PropsWithChildren<{ label: string }>) {
  return (
    <span data-tooltip={label} title={label}>
      {children}
    </span>
  );
}
