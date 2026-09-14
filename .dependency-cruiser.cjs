module.exports = {
  forbidden: [
    {
      name: "react-flow-isolated",
      severity: "error",
      from: { pathNot: "^packages/canvas-renderer-reactflow" },
      to: { path: "@xyflow/react" },
    },
    {
      name: "no-test-kit-in-production",
      severity: "error",
      from: { pathNot: "(test|spec|bootstrap)\\.tsx?$" },
      to: { path: "@comic-canvas/test-kit" },
    },
  ],
  options: { tsPreCompilationDeps: true, doNotFollow: { path: "node_modules" } },
};
