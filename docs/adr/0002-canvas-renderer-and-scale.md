# ADR-0002: Canvas Renderer and Scale

Status: In Progress
Date: 2026-08-24
Supersedes: None

## Decision Summary

Select `@xyflow/react` (React Flow) as the canvas renderer. Define LOD thresholds, scale targets (500/1000 logical nodes), and the migration path if the renderer reaches its limits.

## Rationale

Based on blueprint §15.1. React Flow was selected for mature custom node, port, selection, and DOM form support. Performance targets: 500 nodes baseline, 1000 nodes hard gate. Migration to Canvas/WebGL layer only after 5000/10000 stress tests prove bottleneck.

## Open Decisions Pending Approval

| Decision | Blueprint Reference |
|----------|-------------------|
| Renderer: @xyflow/react | §15.1 |
| LOD thresholds | §11.1 |
| 500-node baseline, 1000-node hard gate | §15.1 |
| Migration trigger: 5000/10000 stress test | §15.1 |
| React Flow type isolation in canvas-renderer-reactflow package | Global Constraints |

## Evidence Collection Plan

| Field | Value |
|-------|-------|
| Evidence Owner | Frontend engineering lead |
| Required Raw Inputs | Benchmark results at 500 and 1000 nodes, accessibility audit at 100%/200%/400% page zoom, React Flow license review |
| Collection Steps | 1. Build canvas benchmark harness with 500 and 1000 node test fixtures. 2. Run benchmarks on target hardware profiles per blueprint §21.2 device matrix. 3. Record FPS, port hit accuracy, LOD transition times. 4. Audit accessibility at 100%, 200%, 400% page zoom with axe-core. 5. Review React Flow MIT license compliance. 6. Compile results with sha256 checksums for benchmark artifacts. |
| Acceptance Criteria | 500-node baseline metrics documented with sha256. 1000-node hard gate pass/fail recorded. Accessibility audit zero critical/serious violations. License review confirmed by legal approver. |
| Checksum/Artifact Rules | Benchmark output JSON: sha256 hash. Accessibility audit HTML report: sha256 hash. License agreement or OSS license citation URL. |
| Who Must Approve | Product (named), Engineering (named), Design (named), Legal (named), Operations (named) |
| What verify-preflight.mjs Will Check | Status equals "Accepted", ISO date present, 5 named approvers per role, substantive evidence links or sha256 checksums, no stale language in text |
