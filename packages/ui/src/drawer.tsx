import React from "react";

export function Drawer({ side, children }: React.PropsWithChildren<{ side: "left" | "right" | "bottom" }>) {
  return (
    <aside data-side={side} className="cc-drawer">
      {children}
    </aside>
  );
}
