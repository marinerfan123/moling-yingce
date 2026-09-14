import React from "react";

export function IconButton(props: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  const { label, children, ...rest } = props;
  return (
    <button aria-label={label} title={label} {...rest}>
      {children}
    </button>
  );
}
