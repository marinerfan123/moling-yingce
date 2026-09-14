# ADR-0004: Jobs, Cost, and Orchestration

Status: In Progress
Date: 2026-08-24
Supersedes: None

## Decision Summary

Job/Attempt/Batch are the canonical generation terms. System recovery adds Attempt; user regeneration adds Job. Single Job has no `partial`; only Batch has `pausing/paused/canceling/partial`. Job cancellation is an orthogonal dimension (`none/requested/acknowledged/unsupported/unknown`). Outbox pattern for reliable delivery with consumer receipts. Dead-letter is never `terminal`.

## Rationale

Based on blueprint §7.2, §7.3, §13. Immutable Job/Attempt model enables accurate billing, recovery, and audit. Orthogonal states prevent premature failure decisions and cost discrepancies.

## Open Decisions Pending Approval

| Decision | Blueprint Reference |
|----------|-------------------|
| Job/Attempt/Batch terminology | §7.3 |
| Orthogonal state dimensions | §7.2 |
| Outbox + consumer receipt pattern | Global Constraints |
| Dead-letter is not terminal | Global Constraints |
| UsageReservation + UsageLedger billing model | §16.2 |
| BullMQ + Redis for MVP orchestration | §15.1 |

## Evidence Collection Plan

| Field | Value |
|-------|-------|
| Evidence Owner | Backend + Worker engineering leads |
| Required Raw Inputs | State machine completeness test results, outbox delivery correctness tests, dead-letter requeue audit validation, billing reconciliation tests, end-to-end batch lifecycle tests |
| Collection Steps | 1. Implement state machine tests covering all transitions per blueprint §7.2. 2. Build outbox delivery test with crash injection points. 3. Create billing reconciliation test suite covering reservation to ledger and cancellation refund. 4. Write dead-letter requeue audit trail validation. 5. Create end-to-end batch lifecycle test with partial failure scenarios. 6. Design task queue UI for design review. 7. Draft operations runbooks for queue failure scenarios. |
| Acceptance Criteria | All state transitions covered and passing. Outbox delivery: zero message loss across crash boundaries. Billing reconciliation: no discrepancies. Batch partial failure: successful items retained, failed items categorizable. Task UI approved by design lead. |
| Checksum/Artifact Rules | Test output artifacts: sha256 hash. Operations runbooks: sha256 hash. UI design screenshots: sha256 hash. |
| Who Must Approve | Product (named), Engineering (named), Design (named), Legal (named), Operations (named) |
| What verify-preflight.mjs Will Check | Status equals "Accepted", ISO date present, 5 named approvers per role, substantive evidence links or sha256 checksums, no stale language in text |
