# Usability Protocol

Status: In Progress
Date: 2026-08-24

## Purpose

Define and execute usability testing of the comic canvas MVP. Tests measure task completion rates, error rates, and time-to-task across five core user journeys from the blueprint.

Source blueprint: docs/product/ai-comic-canvas-blueprint.md §21.1, §9

## Evidence Collection Plan

| Field | Value |
|-------|-------|
| Evidence Owner | UX researcher |
| Required Raw Inputs | 12+ recruited participants across cohorts, screen recordings, raw session notes, measured completion rates |
| Collection Steps | 1. Recruit participants: 4 novice creators, 4 experienced AI-video operators, 4 director/producer/review roles. At least 6 must match primary persona. 2. Obtain informed consent with data handling documentation. 3. Build low-fidelity prototype covering five journeys: script-to-first-cut, single-shot refinement, batch recovery, review rework, script edit. 4. Conduct test sessions with screen capture. 5. Record per-task completion (numerator/denominator), error rates, time to completion. 6. Compute core task completion percentage. 7. Store raw notes with sha256 checksums. |
| Acceptance Criteria | Core task completion >=90%. All cohort minimums met. At least 6 primary persona participants. sha256 checksums for all raw notes. |
| Checksum/Artifact Rules | Raw session notes per participant: sha256 hash. Screen recordings: sha256 hash. Completion rate calculation spreadsheet: sha256 hash. |
| Who Must Approve | Product (named), Design (named) |
| What verify-preflight.mjs Will Check | No stale indicators. Measured completion rates with numeric percentages. Substantive evidence links or checksums. |
