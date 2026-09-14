# Provider Scorecard

Status: In Progress
Date: 2026-08-24

## Purpose

Evaluate and compare provider candidates for text, image, video, and TTS capabilities. Each candidate must pass its signed legal/data/recovery/cancel/billing contract gate and the blueprint §21.2 numeric hard gate before being accepted as primary or backup.

Source blueprint: docs/product/ai-comic-canvas-blueprint.md §21.2, §15.1

## Evidence Collection Plan

| Field | Value |
|-------|-------|
| Evidence Owner | Provider integration engineer |
| Required Raw Inputs | Provider API test accounts, 100 representative requests per capability class per candidate, latency/success/cost/quality metrics, legal data-use reviews, recovery path test results |
| Collection Steps | 1. Register test accounts with candidate providers. 2. Build automated benchmark harness for 100 requests per capability per candidate. 3. Run benchmarks: record latency P50/P95/P99, success rate, actual cost vs quoted, quality score. 4. Test all four recovery paths per provider: success with output commit, timeout with reconciliation, cancel (supported vs unsupported), unknown result to reconciling state. 5. Engage legal review of each provider data-use policy, training opt-out, content rights. 6. Compile quantitative results into this document with sha256 checksums. |
| Acceptance Criteria | Four capability classes each have primary and backup provider with 100-request benchmark data. Recovery testing covers all four paths. Legal review complete for each provider. sha256 checksums for all benchmark artifacts. |
| Checksum/Artifact Rules | Benchmark CSV per provider per class: sha256 hash. Recovery test logs: sha256 hash. Legal review memos: sha256 hash. |
| Who Must Approve | Product (named), Engineering (named), Design (named), Legal (named), Operations (named) |
| What verify-preflight.mjs Will Check | No stale language in text. Provider classes show accepted/pass evidence with 100-request coverage and artifact checksums. Recovery section contains actual test results. Substantive evidence links or sha256 checksums present. |

## Public Evidence Notes

These sources are only candidate-provider research. They do not replace the required 100-request benchmark artifacts, legal review, billing proof, or recovery/cancel tests.

| Capability | Candidate source | Public evidence | Remaining real evidence gap |
|---|---|---|---|
| Text / structured script parsing | Alibaba Cloud Model Studio Qwen pricing | Official pricing page documents pay-as-you-go model API billing and Qwen text model token pricing: https://www.alibabacloud.com/help/en/model-studio/model-pricing | Need account-region decision, 100 representative script-parse requests, latency/success/cost logs, recovery tests, legal/data-use review |
| Image generation | Alibaba Cloud Model Studio Wanx / Stability AI / OpenAI Images | Alibaba lists Wanx image output prices; Stability lists credit pricing for Stable Image services; OpenAI documents image API pricing and safety/data-use notes: https://www.alibabacloud.com/help/en/model-studio/model-pricing, https://platform.stability.ai/pricing, https://openai.com/index/image-generation-api/ | Need 100 image requests per candidate, quality rubric, character consistency test, rights/data review, failure billing evidence |
| Video generation | MiniMax Video API / Runway API / Alibaba Cloud Wan | MiniMax documents video package units and model deductions; Runway documents credits per second and output durations; Alibaba Model Studio lists Wan video price ranges on the model landing page: https://platform.minimax.io/docs/guides/pricing-video, https://docs.dev.runwayml.com/usage/billing/, https://modelstudio.alibabacloud.com/?source_channel=wanhackathon | Need 100 video requests per candidate, duration/resolution constraints, cancel/recovery semantics, bill reconciliation |
| TTS | ElevenLabs API | Official API pricing page documents TTS pricing per 1K characters, model families, languages, and usage metering: https://elevenlabs.io/pricing/api | Need Chinese dialogue quality test, 100 TTS requests, voice rights review, pronunciation lineage, billing/recovery tests |

## Agnes API Probe Evidence

Probe date: 2026-08-24

API base: https://api.agnes-ai.cn/v1

Credential handling: one user-provided test key was read from the local attachment at runtime. The key was not written into the repository and is not recorded here.

| Probe | Result | Evidence |
|---|---|---|
| `GET /models` | PASS | Returned 7 available model IDs: `agnes-2.0-flash`, `agnes-2.5-flash`, `agnes-2.5-pro`, `agnes-2.5-pro-alpha`, `agnes-image-2.1-flash`, `agnes-video-2.5`, `agnes-video-v2.0` |
| Text smoke, `POST /chat/completions`, model `agnes-2.5-flash` | PASS | Returned exact JSON content `{"ok":true,"capability":"text"}` with usage `prompt_tokens=300`, `completion_tokens=10`, `total_tokens=310` |

Capability status after probe:

| Capability | Agnes model candidate | Status | Remaining hard-gate work |
|---|---|---|---|
| Text / script parsing | `agnes-2.5-flash`, `agnes-2.0-flash` | Smoke PASS | 100 representative script parsing requests, schema-following score, latency/cost artifact, recovery/cancel semantics |
| Image generation | `agnes-image-2.1-flash` | Listed by `/models`; no generation request run | 100 image requests, character consistency rubric, output moderation, billing and failure recovery artifact |
| Video generation | `agnes-video-v2.0`, `agnes-video-2.5` | Listed by `/models`; no generation request run | 100 video requests, duration/resolution constraints, queue/cancel/recovery artifact, cost reconciliation |
| TTS | None listed by `/models` | Unavailable from Agnes probe | Select alternate TTS provider or obtain Agnes TTS model documentation |

This probe is not sufficient for Task 00 PASS. It is a smoke test only; the required 100-request benchmark and signed provider/legal gates remain open.
