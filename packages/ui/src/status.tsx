import React from "react";

export function Status({
  tone,
  children,
}: React.PropsWithChildren<{ tone: "neutral" | "success" | "warning" | "danger" }>) {
  return (
    <span role="status" data-tone={tone}>
      {children}
    </span>
  );
}
