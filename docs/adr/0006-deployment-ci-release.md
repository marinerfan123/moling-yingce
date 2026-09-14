# ADR-0006: Deployment, CI, and Release

Status: In Progress
Date: 2026-08-24
Supersedes: None

## Decision Summary

Accept the blueprint-default Kubernetes 1.36/Kustomize deployment target or record equivalent platform evidence. Freeze deployment regions, image digests, binary checksums, Compose profiles, egress implementation, Gateway API controller, cert-manager configuration, LB policy, WebSocket/SSE timeouts, k6 thresholds, browser matrix, SBOM/provenance formats, RPO/RTO, release owners, and rollback criteria.

## Rationale

Based on blueprint §15.1, §15.2, and Global Constraints. Kubernetes deployment with digest-pinned images ensures reproducible releases. ADR-bound controller versions prevent drift between environments.

## Evidence Collection Plan

| Field | Value |
|-------|-------|
| Evidence Owner | DevOps engineer + Operations lead |
| Required Raw Inputs | Managed K8s platform support matrix, image digest ledger, FFmpeg 7.1.1 binary checksum, k6 1.0.0 binary checksum, Gateway API controller installation proof, WebSocket upgrade test results, SSE configuration test results, rendered Kustomize overlays, network policy enforcement test results |
| Collection Steps | 1. Evaluate managed K8s platforms (EKS, GKE, AKS), compare support for K8s 1.36.x. 2. Provision test cluster. 3. Install and validate Gateway API controller, record version + digest + GatewayClass. 4. Build and pin all base/runtime image digests. 5. Download FFmpeg 7.1.1 and k6 1.0.0 binaries, compute sha256 checksums. 6. Configure and test WebSocket /collab keepalive <=20s, gateway idle timeout >=120s. 7. Configure SSE heartbeat 15s, immediate flush, stream timeout disabled or >=15m. 8. Render staging and production Kustomize overlays with digest-only images. 9. Run network policy enforcement tests. 10. Determine deployment regions, obtain legal review for data residency. |
| Acceptance Criteria | K8s 1.36.x patch version frozen with platform support proof. All image digests recorded. FFmpeg and k6 checksums verified. WebSocket/SSE policies meet frozen thresholds. Network policies enforce all ingress/egress boundaries. Regions approved by product and legal. |
| Checksum/Artifact Rules | Image digest ledger JSON: sha256 hash. FFmpeg binary: sha256 hash. k6 binary: sha256 hash. Rendered overlay YAML per environment: sha256 hash. |
| Who Must Approve | Product (named), Engineering (named), Design (named), Legal (named), Operations (named) |
| What verify-preflight.mjs Will Check | Status equals "Accepted", ISO date present, 5 named approvers per role, substantive evidence links or sha256 checksums, no stale indicators |
