import React from "react";

export function Button(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { children, className, ...rest } = props;
  return (
    <button className={["cc-button", className].filter(Boolean).join(" ")} {...rest}>
      {children}
    </button>
  );
}
