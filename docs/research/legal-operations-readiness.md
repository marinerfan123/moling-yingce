# Legal and Operations Readiness

Status: In Progress
Date: 2026-08-24

## Purpose

Verify legal and operational readiness before accepting users or processing real content.

Source blueprint: docs/product/ai-comic-canvas-blueprint.md §21.8

## Evidence Collection Plan

| Field | Value |
|-------|-------|
| Evidence Owner | Legal counsel + Operations lead |
| Required Raw Inputs | Drafted privacy policy, terms of service, content rights declaration, AI labeling policy, complaint/takedown procedure, data retention policy, provider outage runbook, misbilling procedure, incident response plan |
| Collection Steps | 1. Draft privacy policy with legal counsel covering data handling and user rights. 2. Draft terms of service covering user obligations, limitations, and IP rights. 3. Define content rights declaration for AI-generated content. 4. Define AI content labeling policy per regional requirements. 5. Draft complaint and takedown procedure with response SLA. 6. Define input training opt-out default policy. 7. Write provider outage runbook with escalation paths. 8. Draft misbilling detection and refund process. 9. Define data retention periods per jurisdiction. 10. Write incident response workflow. 11. Legal review and sign-off on all documents. |
| Acceptance Criteria | All legal documents drafted and reviewed. All operations runbooks written. Legal sign-off on privacy, terms, retention, AI labeling. Operations sign-off on outage, misbilling, incident runbooks. |
| Checksum/Artifact Rules | Each legal document: sha256 hash. Each operations runbook: sha256 hash. |
| Who Must Approve | Legal (named), Operations (named), Product (named) |
| What verify-preflight.mjs Will Check | No stale language in text. Legal keywords present. All checklist items show drafted state. Substantive evidence links or checksums present. |
