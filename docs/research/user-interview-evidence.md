# User Interview Evidence

Status: In Progress
Date: 2026-08-24

## Purpose

Document completed user interviews for MVP persona validation and journey coverage. Requires at least 12 participants spanning novice creators, experienced AI-video operators, and director/producer/review roles, with at least 6 qualifying as primary persona.

Source blueprint: docs/product/ai-comic-canvas-blueprint.md §21.1, §3.1

## Evidence Collection Plan

| Field | Value |
|-------|-------|
| Evidence Owner | UX researcher + Product lead |
| Required Raw Inputs | 12+ recruited participants, signed consent forms, interview recordings, raw notes with sha256 checksums, persona-journey coverage matrix data |
| Collection Steps | 1. Recruit participants matching blueprint §3.1 cohorts. 2. Obtain informed consent with data handling documentation. 3. Conduct structured interviews per usability protocol. 4. Record notes, compute sha256 checksums, document consent basis. 5. Classify each participant by cohort and primary persona qualification. 6. Fill persona-journey coverage matrix with eligible/completed counts and finding-to-decision mapping. 7. Store pseudonymized participant IDs (P-01 through P-12+). |
| Acceptance Criteria | 12+ participants documented with pseudonymized IDs. 6+ primary persona qualifiers. Complete persona-journey coverage matrix. sha256 checksums for all raw notes. |
| Checksum/Artifact Rules | Raw notes per participant: sha256 hash. Consent forms: sha256 hash. Coverage matrix spreadsheet: sha256 hash. |
| Who Must Approve | Product (named), Design (named) |
| What verify-preflight.mjs Will Check | No stale indicators. 12+ participant entries. 6+ primary persona qualifiers. Persona-journey matrix with data rows. Substantive evidence links or checksums. |
