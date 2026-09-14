# ADR-0005: Providers, Region, and Retention

Status: In Progress
Date: 2026-08-24
Supersedes: None

## Decision Summary

Record primary and evaluated backup providers for text, image, video, and TTS capabilities. Define region requirements, data-use policies, pricing tiers, concurrency limits, webhook identity scope, idempotent client tokens, and all four recovery results. Establish retention policies for assets, jobs, and audit records.

## Rationale

Based on blueprint §21.2 and Global Constraints. Multi-provider strategy with hard gates ensures no single point of failure for generation capabilities. Each provider must pass signed legal/data/recovery/cancel/billing contract gates plus numeric hard gates.

## Capability Selection Requirements

| Class | Requirement |
|-------|------------|
| Text | 100 representative requests, latency/success/cost/quality metrics, legal data-use review, recovery testing |
| Image | 100 representative requests, latency/success/cost/quality metrics, legal data-use review, recovery testing |
| Video | 100 representative requests, latency/success/cost/quality metrics, legal data-use review, recovery testing |
| TTS | 100 representative requests, latency/success/cost/quality metrics, legal data-use review, recovery testing |

## Evidence Collection Plan

| Field | Value |
|-------|-------|
| Evidence Owner | Provider integration engineer + Legal counsel |
| Required Raw Inputs | Provider API test accounts, 100 representative requests per class per candidate, latency/success/cost/quality measurements, legal data-use policy reviews, recovery path test results, cancel API classification |
| Collection Steps | 1. Register test accounts with candidate providers for each class. 2. Build automated benchmark harness per blueprint §21.2. 3. Execute 100 requests per class per provider, recording latency P50/P95/P99, success rate, actual cost, quality score. 4. Test all four recovery paths: success with output commit, timeout with reconciliation, cancel (supported vs unsupported), unknown result leading to reconciling state. 5. Engage legal review of each provider data use, training opt-out, and content rights policies. 6. Compile provider-scorecard.md with quantitative results. 7. Design provider-switching UI for design review. 8. Draft provider monitoring and failover runbook for operations review. |
| Acceptance Criteria | Each provider class has primary and backup with 100-request benchmark data, sha256 checksums, legal review sign-off, recovery test results. Weighted score ranks candidates; hard gate failures disqualify regardless of score. |
| Checksum/Artifact Rules | Benchmark output CSV per provider per class: sha256 hash. Legal review memos: sha256 hash. Recovery test logs: sha256 hash. Provider terms of service citation: direct URL to current page. |
| Who Must Approve | Product (named), Engineering (named), Design (named), Legal (named), Operations (named) |
| What verify-preflight.mjs Will Check | Status equals "Accepted", ISO date present, 5 named approvers per role, substantive evidence links or sha256 checksums, no stale indicators |
