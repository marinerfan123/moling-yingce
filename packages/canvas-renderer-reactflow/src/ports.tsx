import React from "react";

export type Port = Readonly<{ id: string; side: "input" | "output"; x: number; y: number }>;

export function stablePorts(width: number, height: number, inputCount: number, outputCount: number): Port[] {
  const inputs = Array.from({ length: inputCount }, (_, index) => ({
    id: `in-${index}`,
    side: "input" as const,
    x: 0,
    y: Math.round(((index + 1) * height) / (inputCount + 1)),
  }));
  const outputs = Array.from({ length: outputCount }, (_, index) => ({
    id: `out-${index}`,
    side: "output" as const,
    x: width,
    y: Math.round(((index + 1) * height) / (outputCount + 1)),
  }));
  return [...inputs, ...outputs];
}

export function Ports({ ports }: Readonly<{ ports: readonly Port[] }>) {
  return (
    <>
      {ports.map((port) => (
        <span
          key={port.id}
          data-port-id={port.id}
          data-side={port.side}
          style={{ width: 24, height: 24, left: port.x, top: port.y }}
        />
      ))}
    </>
  );
}
