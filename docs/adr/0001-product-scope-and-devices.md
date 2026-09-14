# ADR-0001: Product Scope and Devices

Status: In Progress
Date: 2026-08-24
Supersedes: None

## Decision Summary

Freeze MVP primary persona, route/capability mode rules, `N` quick-create / Tab focus behavior, and default `captionMode=burn-in+sidecar` with SRT always delivered.

## Rationale

Based on blueprint sections 3, 4, 10, and 14. All decisions below are pre-filled from the blueprint; they require human approval before becoming Accepted.

## Open Decisions Pending Approval

| Decision | Blueprint Reference | Blueprint Default |
|----------|-------------------|------------------|
| MVP primary persona | §3.1 | Independent comic creators + 3-10 person studios |
| Route/capability mode rules | §6.3 | Canvas / Storyboard / Timeline as top-level modes |
| `N` quick-create behavior | §11.1 | Opens node creation menu on canvas surface focus |
| Tab focus behavior | §11.1 | Tab/Shift+Tab reserved for focus navigation only |
| captionMode default | §12.4 | `burn-in+sidecar`, SRT always delivered |
| Desktop-first, mobile review | §3.3 / §4.4 | Desktop for full creation; mobile for view/comment/approve |

## Evidence Collection Plan

| Field | Value |
|-------|-------|
| Evidence Owner | Product lead + UX researcher |
| Required Raw Inputs | 12+ user interview transcripts, prototype test session recordings, design review notes |
| Collection Steps | 1. Recruit 12 participants per usability-protocol.md cohorts. 2. Conduct structured interviews with screen capture. 3. Build low-fidelity prototype for `N` key and Tab behavior. 4. Run prototype tests, record completion rates. 5. Collect design review sign-off. 6. Compile findings into this ADR. |
| Acceptance Criteria | All 5 approver roles provide named identities and written acceptance. Interview evidence cross-references user-interview-evidence.md with sha256 checksums. Prototype core completion >=90% per prototype-rounds-evidence.md. |
| Checksum/Artifact Rules | Interview raw notes: sha256 hash stored in user-interview-evidence.md. Prototype session recordings: sha256 hash stored in prototype-rounds-evidence.md. Design review minutes: sha256 hash appended to this ADR. |
| Who Must Approve | Product (named), Engineering (named), Design (named), Legal (named), Operations (named) |
| What verify-preflight.mjs Will Check | Status equals "Accepted", ISO date present, 5 named approvers per role with real identities, substantive evidence links or sha256 checksums, no stale language in text |
