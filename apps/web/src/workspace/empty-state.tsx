import React from "react";

export function EmptyState({ message }: Readonly<{ message: string }>) {
  return <p role="status">{message}</p>;
}
