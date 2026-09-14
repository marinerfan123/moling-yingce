# ADR-0003: State Authority and Projection

Status: In Progress
Date: 2026-08-24
Supersedes: None

## Decision Summary

PostgreSQL owns domain/permission/task/ledger/review state. Yjs owns node positions, edges, Frames, and generation/auxiliary node configuration. Domain references are authoritative in `ReferenceBinding`; Yjs reference edges are read-only projections with `bindingId`. Cross-store consistency uses explicit, recoverable projection protocol with `documentEpoch`/`projectionSeq` ordering.

## Rationale

Based on blueprint §7, §15.4, §15.5. Separation prevents dual-write conflicts and ensures business-critical state (permissions, billing, approvals) is transactionally consistent while collaborative canvas edits remain offline-capable.

## Open Decisions Pending Approval

| Decision | Blueprint Reference |
|----------|-------------------|
| PostgreSQL as domain authority | §15.3 |
| Yjs as canvas document authority | §15.3 |
| ReferenceBinding as reference authority | Global Constraints |
| Projection protocol with documentEpoch/projectionSeq | §15.4 |
| Collab dual-replica with roomEpoch fencing | Global Constraints |
| Yjs schema migration strategy | §15.5 |
| y-indexeddb offline cache with 24h intent expiry | §15.5 |

## Evidence Collection Plan

| Field | Value |
|-------|-------|
| Evidence Owner | Backend + Collab engineering leads |
| Required Raw Inputs | Projection protocol test results, dual-Collab replica failover test results, offline cache expiry validation, schema migration repeatability tests |
| Collection Steps | 1. Implement projection protocol tests per blueprint §15.4 covering epoch mismatch, seq gap, crash recovery. 2. Deploy dual-Collab replicas, inject failover, verify update/projection no-loss and no-duplicate. 3. Validate y-indexeddb offline cache behavior across Chrome/Firefox/Safari. 4. Run schema migration repeatability across 3+ versions. 5. Document "Syncing" UI states for design review. |
| Acceptance Criteria | All projection tests pass. Dual-replica failover zero data loss. Offline cache recovers within SLA. Schema migrations deterministic and repeatable. Design approver accepts sync UI states. |
| Checksum/Artifact Rules | Test output artifacts: sha256 hash per test suite. Failover test recording: sha256 hash. Migration log files: sha256 hash. |
| Who Must Approve | Product (named), Engineering (named), Design (named), Legal (named), Operations (named) |
| What verify-preflight.mjs Will Check | Status equals "Accepted", ISO date present, 5 named approvers per role, substantive evidence links or sha256 checksums, no stale language in text |
