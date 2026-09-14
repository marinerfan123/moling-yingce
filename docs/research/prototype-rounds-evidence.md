# Prototype Rounds Evidence

Status: In Progress
Date: 2026-08-24

## Purpose

Document two rounds of low-fidelity prototype testing over the required flows. Measure per-task completion rates and verify core task completion is at or above ninety percent.

Source blueprint: docs/product/ai-comic-canvas-blueprint.md §21.5

## Evidence Collection Plan

| Field | Value |
|-------|-------|
| Evidence Owner | UX researcher + Frontend engineer |
| Required Raw Inputs | Two low-fidelity prototypes, test participants, session recordings, per-task completion data, core completion percentage |
| Collection Steps | 1. Build Round 1 prototype: core canvas interactions (node creation, connection, selection, drag). 2. Recruit 3+ test participants. 3. Conduct Round 1 tests, record per-task completion numerator/denominator. 4. Iterate on prototype based on findings. 5. Build Round 2 prototype: script import, batch generation, candidate selection, timeline. 6. Recruit 3+ test participants. 7. Conduct Round 2 tests. 8. Calculate core task completion percentage. 9. Store session recordings with sha256 checksums. |
| Acceptance Criteria | Two rounds completed. Core task completion at or above ninety percent. Per-task data recorded. sha256 checksums for session recordings. |
| Checksum/Artifact Rules | Session recordings per round: sha256 hash. Completion data spreadsheet: sha256 hash. Prototype build artifacts: sha256 hash. |
| Who Must Approve | Product (named), Design (named) |
| What verify-preflight.mjs Will Check | No stale indicators. Two rounds documented. Core completion percentage of at least ninety percent present. Substantive evidence links or checksums. |
