import React from "react";

export function Dialog({ title, children, open = true }: React.PropsWithChildren<{ title: string; open?: boolean }>) {
  if (!open) return null;
  return (
    <section role="dialog" aria-modal="true" aria-label={title}>
      <h2>{title}</h2>
      {children}
    </section>
  );
}
