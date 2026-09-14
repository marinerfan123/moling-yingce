# Engineering Readiness

Status: In Progress
Date: 2026-08-24

## Purpose

Verify that all required engineering infrastructure is available and configured before development begins.

Source blueprint: docs/product/ai-comic-canvas-blueprint.md §21.7

## Evidence Collection Plan

| Field | Value |
|-------|-------|
| Evidence Owner | DevOps engineer |
| Required Raw Inputs | Provisioned PostgreSQL 16+ with PITR, provisioned Redis 7+, provisioned S3-compatible storage with versioning, configured OIDC provider, provisioned KMS keys, CI/CD pipeline, staging environment |
| Collection Steps | 1. Provision PostgreSQL 16+ with PITR and backup configuration. 2. Provision Redis 7+ instance for BullMQ. 3. Provision S3-compatible storage with versioning enabled. 4. Configure Keycloak OIDC provider for development. 5. Provision KMS keys for encryption. 6. Set up CI/CD pipeline with lint, test, build stages. 7. Deploy staging environment with all services. 8. Verify backup and recovery procedures. 9. Document ownership for each component. 10. Record infrastructure URLs and configuration hashes. |
| Acceptance Criteria | All infrastructure components provisioned and accessible. Backup/recovery tested. CI/CD pipeline passing. Staging environment healthy. Named owners documented. |
| Checksum/Artifact Rules | Infrastructure configuration files: sha256 hash. CI/CD pipeline definition: sha256 hash. Staging deployment manifest: sha256 hash. |
| Who Must Approve | Engineering (named), Operations (named) |
| What verify-preflight.mjs Will Check | No stale language in text. Engineering keywords present. All checklist items show provisioned state. Substantive evidence links or checksums present. |

## Public Engineering Baseline Sources

These sources support the commercial architecture choices. They do not prove that our own infrastructure is provisioned, backed up, or operated.

| Component | Public source | Why it matters | Remaining real evidence gap |
|---|---|---|---|
| PostgreSQL 16+ PITR | https://www.postgresql.org/docs/16/continuous-archiving.html | Official docs describe WAL archiving and point-in-time recovery mechanics | Need provisioned database, PITR enabled, backup/restore test artifact, owner |
| Redis 7+ persistence | https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/ | Official docs describe RDB/AOF persistence and durability tradeoffs | Need production Redis choice, persistence/backup policy, BullMQ failover test |
| S3-compatible object versioning | https://docs.min.io/aistor/administration/objects-and-versioning/versioning/ | MinIO docs cover object versioning for S3-compatible storage | Need bucket versioning enabled, lifecycle policy, immutable asset restore test |
| OIDC / Keycloak | https://www.keycloak.org/docs/latest/server_admin/index.html | Official Keycloak docs support OIDC administration baseline | Need realm export, client config, signing keys, login/refresh/logout tests |
| Kubernetes/Gateway deployment target | https://kubernetes.io/docs/home/ and https://gateway-api.sigs.k8s.io/ | Public docs support the planned Kubernetes/Gateway architecture | Need selected managed platform, controller digest, certificate issuer and rendered manifests |
