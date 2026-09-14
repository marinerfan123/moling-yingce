# Brand and Font License Evidence

Status: In Progress
Date: 2026-08-24

## Purpose

Document the final working brand name, logo source, and all Chinese/UI/export font licenses with checksums. No brand or font may be used in production without verified license evidence.

Source blueprint: docs/product/ai-comic-canvas-blueprint.md §21.6

## Evidence Collection Plan

| Field | Value |
|-------|-------|
| Evidence Owner | Design lead + Legal counsel |
| Required Raw Inputs | Brand name decision from product team, logo design files, font selections, purchased or verified free-use font licenses, font binary downloads |
| Collection Steps | 1. Product team confirms working brand name. 2. Design team selects UI and export fonts for Chinese and English. 3. Procure or verify free-use licenses for all fonts. 4. Download font binaries, compute sha256 checksums. 5. Document all license evidence with source URLs. 6. Legal review of font license terms for commercial use. |
| Acceptance Criteria | Brand name confirmed with source. All fonts have verifiable commercial-use licenses. Font binaries have sha256 checksums. Legal sign-off on license compliance. |
| Checksum/Artifact Rules | Font binary per font: sha256 hash. License document per font: sha256 hash. Logo source file: sha256 hash. |
| Who Must Approve | Design (named), Legal (named), Product (named) |
| What verify-preflight.mjs Will Check | No stale indicators. Brand decision documented with substantive content. Font license evidence with real checksums or source links. Substantive evidence links present. |

## Public Font License Candidates

These are public candidates for UI/export typography. They do not replace final brand approval, downloaded font binary checksums, or legal sign-off.

| Candidate | Public source | License evidence | Remaining real evidence gap |
|---|---|---|---|
| Source Han Sans / 思源黑体 | Adobe GitHub repository: https://github.com/adobe-fonts/source-han-sans | Repository license states SIL Open Font License 1.1: https://github.com/adobe-fonts/source-han-sans/blob/master/LICENSE.txt | Need chosen font subset, downloaded release artifact, sha256, embedding/export decision, legal sign-off |
| Noto Sans SC | Google Fonts page: https://fonts.google.com/noto/specimen/Noto%2BSans%2BSC | Noto fonts are published under SIL Open Font License 1.1 in public Noto documentation: https://fuchsia.googlesource.com/third_party/github.com/googlefonts/noto-fonts/%2B/refs/heads/upstream/noto-sans-gf/README.md | Need exact binary source, sha256, UI/export rendering proof, legal sign-off |
| HarmonyOS Sans | Huawei developer page: https://developer.huawei.com/consumer/cn/doc/doccenter-ux-design/font-0000001828772001 | OpenHarmony font license is public: https://github.com/openharmony/global_system_resources/blob/master/LICENSE_Fonts | Need legal review because license terms differ from OFL and restrict modification/standalone redistribution |
