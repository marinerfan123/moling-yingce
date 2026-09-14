# Golden Project Manifest

Status: In Progress
Date: 2026-08-24

## Purpose

Define exactly three rights-cleared golden projects for end-to-end testing. Each project must have verifiable source provenance, license evidence, and sha256 checksums.

Source blueprint: docs/product/ai-comic-canvas-blueprint.md §21.3

## Evidence Collection Plan

| Field | Value |
|-------|-------|
| Evidence Owner | Test engineer + Legal counsel |
| Required Raw Inputs | Three rights-cleared source projects (Chinese comic scripts, character/art references, multi-scene production samples), verifiable licenses, sha256 checksums |
| Collection Steps | 1. Identify public domain or explicitly licensed comic content (CC0, CC-BY, or written permission). 2. Verify license permits testing use. 3. Download source files, compute sha256 checksums, record byte lengths. 4. Document provenance: source URL, license ID, rights owner. 5. Create expected output specifications: scene/shot/line counts, 1080x1920/25fps/audio/QC values. 6. Store source binaries as CI artifacts (not Git blobs). |
| Acceptance Criteria | Three projects with sha256 checksums, license evidence, source URLs, byte lengths, and expected output specs. Legal sign-off on license compliance. |
| Checksum/Artifact Rules | Each source file: sha256 hash recorded in this document and in tests/fixtures/golden/project-sources.json. Manifest file: sha256 hash. |
| Who Must Approve | Engineering (named), Legal (named) |
| What verify-preflight.mjs Will Check | No stale indicators. At least 3 project entries with sha256/path. Actual 64-character hex checksums present. Substantive evidence links. |
