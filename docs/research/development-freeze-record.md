# Development Freeze Record

Status: In Progress
Date: 2026-08-24

## Purpose

Record one row per delivery decision with gateId, finalDecision, evidenceLinksOrSha256, owner, requiredApproverRoles, approverIdentities, approvedAt, status, supersedes, and unresolvedBlockers. This is the sole gate into Task 01.

Source blueprint: docs/product/ai-comic-canvas-blueprint.md §20

## Required Columns

| Column | Description |
|--------|-------------|
| gateId | Gate identifier (G-01 through G-08) |
| finalDecision | Accepted or rejected decision with justification |
| evidenceLinksOrSha256 | Substantive evidence URLs or 64-character hex sha256 checksums |
| owner | Named person responsible for this gate |
| requiredApproverRoles | Comma-separated list of approver role names |
| approverIdentities | Named individuals who approved (not placeholder text) |
| approvedAt | ISO 8601 date when approval was recorded |
| status | Current state of the gate |
| supersedes | Prior gate ID if this replaces a previous decision |
| unresolvedBlockers | List of open blockers or "none" if gate can proceed |

## Collection Plan for Each Gate

| Gate | Decision | Evidence Owner | Raw Inputs Needed | Collection Steps | Who Approves |
|------|----------|---------------|-------------------|------------------|--------------|
| G-01: User interviews | 12+ interviews completed, 6+ primary persona, persona-journey matrix filled | UX researcher + Product lead | 12+ recruited participants, signed consent forms, interview recordings, raw notes with sha256 checksums | 1. Recruit per blueprint §3.1 cohorts. 2. Obtain informed consent. 3. Conduct structured interviews with screen capture. 4. Record notes and compute sha256 checksums. 5. Classify by cohort and primary persona. 6. Fill persona-journey coverage matrix. 7. Store pseudonymized participant IDs P-01 through P-12+. | Product (named), Design (named) |
| G-02: Production observation | 3+ real projects observed with tool/cost/time/failure data | Product lead + Operations engineer | Access to 3 real production teams, observation schedule, tool logs, cost receipts, time tracking | 1. Identify teams willing to share workflow data. 2. Obtain observation permission. 3. Observe full production cycles or access existing records. 4. Record tools, elapsed time, active time, failure count, rework cycles, costs. 5. Verify accuracy with project owners. | Product (named), Operations (named) |
| G-03: Prototype testing | 2 rounds completed, core task completion at or above 90% | UX researcher + Frontend engineer | Two low-fidelity prototypes, test participants, session recordings, completion data | 1. Build Round 1: canvas interactions (node creation, connection, selection, drag). 2. Recruit 3+ participants and run tests. 3. Record per-task completion. 4. Iterate on findings. 5. Build Round 2: script import, batch generation, candidate selection, timeline. 6. Recruit 3+ participants and run tests. 7. Calculate core completion percentage. | Product (named), Design (named) |
| G-04: Provider scorecard | 4 capability classes each have primary and backup with 100-request benchmark data | Provider integration engineer + Legal counsel | Provider API test accounts, 100 requests per class per candidate, latency/success/cost/quality metrics, legal data-use reviews, recovery path test results | 1. Register test accounts with candidate providers. 2. Build automated benchmark harness. 3. Execute 100 requests per class per provider, record latency P50/P95/P99, success rate, actual cost, quality score. 4. Test all four recovery paths: success with output commit, timeout with reconciliation, cancel, unknown result. 5. Legal review of data-use, training opt-out, content rights. 6. Compile results with sha256 checksums. | Product (named), Engineering (named), Legal (named), Operations (named) |
| G-05: Brand and font | Brand name confirmed, fonts licensed with checksums | Design lead + Legal counsel | Brand name decision, logo design files, font selections, licenses, font binary downloads | 1. Product team confirms brand name. 2. Design team selects UI and export fonts. 3. Procure or verify free-use licenses. 4. Download binaries, compute sha256 checksums. 5. Legal review for commercial use. | Design (named), Legal (named), Product (named) |
| G-06: Golden projects | 3 rights-cleared projects with sha256 checksums and expected output specs | Test engineer + Legal counsel | 3 rights-cleared source projects, verifiable licenses, sha256 checksums | 1. Identify public domain or explicitly licensed content (CC0, CC-BY, or written permission). 2. Verify license permits testing use. 3. Download sources, compute sha256, record byte lengths. 4. Document provenance: source URL, license ID, rights owner. 5. Create expected output specs: scene/shot/line counts, 1080x1920/25fps/audio/QC values. | Engineering (named), Legal (named) |
| G-07: Engineering readiness | All infrastructure provisioned, backup tested, CI passing, staging healthy | DevOps engineer | Provisioned PostgreSQL 16+ with PITR, Redis 7+, S3-compatible storage with versioning, OIDC provider, KMS keys, CI/CD pipeline, staging environment | 1. Provision PostgreSQL 16+ with PITR and backup config. 2. Provision Redis 7+ for BullMQ. 3. Provision S3-compatible storage with versioning. 4. Configure Keycloak OIDC for development. 5. Provision KMS keys. 6. Set up CI/CD with lint/test/build. 7. Deploy staging environment. 8. Verify backup and recovery. 9. Document ownership. | Engineering (named), Operations (named) |
| G-08: Legal and operations | All legal documents drafted, runbooks written, sign-offs obtained | Legal counsel + Operations lead | Drafted privacy policy, terms of service, content rights declaration, AI labeling policy, complaint/takedown procedure, data retention policy, provider outage runbook, misbilling procedure, incident response plan | 1. Draft privacy policy with legal counsel. 2. Draft terms of service. 3. Define content rights declaration. 4. Define AI content labeling policy. 5. Draft complaint and takedown procedure. 6. Define input training opt-out default. 7. Write provider outage runbook. 8. Draft misbilling detection and refund process. 9. Define retention periods per jurisdiction. 10. Write incident response workflow. 11. Legal review and sign-off. | Legal (named), Operations (named), Product (named) |

## Checksum and Artifact Rules

- Each ADR approval record: sha256 hash
- Freeze record itself: sha256 hash after finalization
- All evidence artifacts referenced in evidenceLinksOrSha256 column must be verifiable via URL or sha256 checksum
- Legal documents: sha256 hash stored with document
- Operations runbooks: sha256 hash stored with runbook

## What verify-preflight.mjs Will Check

No stale language in text. All required columns present (gateId, finalDecision, evidenceLinksOrSha256, requiredApproverRoles, approverIdentities, approvedAt, supersedes, unresolvedBlockers). No rows with non-accepted status. Named approvers. Substantive evidence links or checksums.
