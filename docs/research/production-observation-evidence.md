# Production Observation Evidence

Status: In Progress
Date: 2026-08-24

## Purpose

Document at least 3 real AI-assisted comic/video production projects observed end-to-end. Capture tools used, elapsed time, active time, failures, rework cycles, and actual costs.

Source blueprint: docs/product/ai-comic-canvas-blueprint.md §21.4

## Evidence Collection Plan

| Field | Value |
|-------|-------|
| Evidence Owner | Product lead + Operations engineer |
| Required Raw Inputs | Access to 3 real production teams or projects, observation schedule, tool logs, cost receipts, time tracking data |
| Collection Steps | 1. Identify production teams willing to share their workflow data. 2. Obtain permission for observation and data collection. 3. Observe full production cycles or access existing project records. 4. Record: tools used (names and versions), elapsed time, active time, failure count and types, rework cycles, actual costs. 5. Verify data accuracy with project owners. 6. Store observation records with sha256 checksums. |
| Acceptance Criteria | 3+ projects with complete data: tools, elapsed/active time, failures, rework, costs. All data verified by project owners. sha256 checksums for observation records. |
| Checksum/Artifact Rules | Observation notes per project: sha256 hash. Cost receipts or invoices: sha256 hash. Tool logs: sha256 hash. |
| Who Must Approve | Product (named), Operations (named) |
| What verify-preflight.mjs Will Check | No stale indicators. 3+ observation entries with real cost/time/tool data. Substantive evidence links or checksums. |

## Public Competitive Workflow Sources

These sources show competitor workflow patterns only. They cannot replace observing our own users or recording three real production projects.

| Source | Evidence level | Observed public capability | Product implication |
|---|---|---|---|
| LibTV official homepage: https://www.liblib.tv/ | B: official public page | Public page exposes new canvas creation, LibTV Agent, Seedance/MiniMax model promotion, director stage, and frame-by-frame reference-video analysis | Confirms that canvas-first AI video workflow, model aggregation, director tooling, and frame analysis are competitor-visible capabilities |
| LibTV Skill page: https://www.liblib.tv/skill | B: official public page | Public categories include short comic drama, film, commercial advertising, creative/social media, and music MV | Confirms Skill/template taxonomy should cover more than short comic drama |
| Public walkthrough linked in blueprint: https://zhuanlan.zhihu.com/p/2019489463273801042 | C: third-party public walkthrough | Describes script/storyboard workflow patterns from an external operator perspective | Useful for task discovery, but not a substitute for our own measured production observations |
