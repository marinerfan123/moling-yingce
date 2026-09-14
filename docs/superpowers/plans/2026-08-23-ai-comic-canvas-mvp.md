# 漫剧无限画布 MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 从空仓库构建可邀请封测的桌面 Web 漫剧生产工具，打通已有剧本、设定、分镜、图片、视频、配音、显式时间线同步、项目快照、审阅和可复现成片导出。

**Architecture:** pnpm/Turborepo 管理 TypeScript Monorepo。React 与隔离的 React Flow renderer 负责工具界面，Yjs/Hocuspocus 负责画布文档和离线，NestJS/Fastify 模块化单体负责业务 API，PostgreSQL 是业务权威数据源，独立 Outbox Dispatcher 经 Redis/BullMQ 驱动 Generation/Media Worker，S3 兼容存储保存不可变资产；画布只表达生产依赖，Timeline 独占播放顺序。

**Tech Stack:** Node.js 24、pnpm 10、TypeScript strict、React 19、Vite、TanStack Router/Query、React Flow、Zustand、Yjs/Hocuspocus、NestJS/Fastify、Zod、Drizzle ORM、PostgreSQL 16+、Redis 7+、BullMQ、S3/MinIO、FFmpeg 7、ClamAV、Docker/Compose、Kubernetes/Kustomize、Vitest、fast-check、Testcontainers、Playwright、k6、OpenTelemetry。

## Global Constraints

- 产品与验收唯一基线是 `docs/product/ai-comic-canvas-blueprint.md`；Task 00 的 ADR 未签署前不得开始 Task 01。
- MVP 只接收已有 UTF-8 TXT/Markdown 剧本；小说/梗概改编、局部重绘、首尾帧、口型、平板画布编辑、实时多人 UI 和通用 Agent 工作流不进入本计划。
- 画布保存生产依赖，Timeline 保存播放顺序；任何 Storyboard 变化只生成显式同步 diff。
- PostgreSQL 拥有领域/权限/任务/账本/审核状态；Yjs 拥有节点位置、边、Frame 和生成/辅助节点配置。
- 领域引用以 `ReferenceBinding` 为权威；Yjs reference edge 是带 `bindingId` 的只读投影。
- 所有生成结果不可变；Selection、Approval、引用跟随、画布编辑锁和 ApprovalGate 是正交状态。
- 上游变化只写 stale invalidation；未重新鉴权、预检、估价并确认前不生成、不预留费用。
- Job/Attempt/Batch 是唯一生成术语；系统恢复新增 Attempt，用户重新生成新增 Job。
- 单 Job 没有 `partial`；Batch 才有 `pausing/paused/canceling/partial`。Job cancellation 是 `none/requested/acknowledged/unsupported/unknown` 正交维度，只有 provider poll/webhook 终态证据才能把 Job 标为 `canceled`。
- 所有写 API 持久化 `Idempotency-Key`；所有异步投递使用 Outbox、consumer receipt 和稳定 event ID。
- Outbox broker ACK 只记录 `published`，下游 effect receipt 才记录 `terminal`；claim 必须有 lease/过期 reclaim/退避/dead-letter，reconciler 必须重投已 published 但 Redis job 丢失且无下游 receipt 的事件。
- Dead-letter 永远不等同 `terminal`；必须保留 payload/hash/attempt/receipt 证据，并通过 audited CAS `requeue_outbox(eventId,expectedAttempt,reason)` 修复。`canvas-projection` 的缺失 N 未修复前 N+1、marker finalization 和 snapshot drain 必须保持阻塞。
- 供应商提交结果不确定时进入 `reconciling`；没有可证明恢复能力时禁止自动重提。
- 所有租户表启用并强制 RLS；迁移 owner 与 API、Collab、Dispatcher、Generation Worker、Media Worker 五个 `NOINHERIT NOBYPASSRLS` runtime roles 分离；租户引用使用复合外键且 `tenant_id` 不可更新。
- FORCE RLS scope 不得直接来自 HTTP body、BullMQ payload 或 webhook payload；HTTP/Canvas session、`bootstrap_canvas_scope`、`bootstrap_work_event` 和验签后的 `bootstrap_verified_provider_event` 是唯一入口。专用 `comic_security_owner` 只能是 NOLOGIN/NOINHERIT/BYPASSRLS 的窄 SECURITY DEFINER owner，五个 runtime role 必须 NOBYPASSRLS。
- 租户级和项目级 scope 分别是构造器不公开的 `VerifiedTenantScope` / `VerifiedProjectScope`；首个 Project 创建/列表只接受前者，所有 Project-scoped repository 只接受后者，二者都只能由受信 bootstrap 返回。禁止裸 `tenantId/projectId`；除 `packages/db/src/tenant-context.ts` 外的 TypeScript 直接执行 `SET LOCAL app.*` 一律静态失败。
- BullMQ envelope 只能携带 opaque `eventId/route/payloadHash`；Consumer 必须从数据库 bootstrap scope 并验证 payload hash。Provider webhook 必须先按原始字节验签，再从 Attempt bootstrap tenant/project，payload 自报 scope 永不可信。
- Collab 生产形态至少两个副本；Redis lease 只做 owner discovery，PostgreSQL `roomEpoch` 做 durable fencing。任意 Pod 收到投影或 `flushRead` 都必须 owner-route，双副本 failover 测试是 Task 13 硬门。
- TypeScript 开启 `strict`、`noUncheckedIndexedAccess`、`exactOptionalPropertyTypes`、`useUnknownInCatchVariables` 和 `noImplicitOverride`；业务代码禁止 `any`。
- React Flow import 只允许出现在 `packages/canvas-renderer-reactflow`；用 dependency-cruiser 作为 CI 边界门禁。
- 每个任务按 RED -> GREEN -> 相邻回归 -> commit 执行；Expected FAIL 必须来自目标行为，不能来自缺 manifest、fixture、注册或依赖。Task 50 是唯一双提交例外：Step 3 先提交并冻结应用/测试/工作流候选，Step 5 只提交针对该候选生成的签署证据与 attestation，二者不得 squash 或改写候选 SHA。
- 每条 Step 2/4 测试命令必须命中本 Task `Files` 已创建或先前 Task 已创建的可发现测试文件；禁止依赖模糊 grep/filter 或 `--passWithNoTests`。Step 5 的 `git add` 必须覆盖本 Task 的全部 Create/Modify 路径，由静态 verifier 对照 Files 清单检查；Task 50 的 verifier 改为合并检查 Step 3 候选提交与 Step 5 docs-only attestation 两个显式 `git add`，并验证两组路径不重叠。
- 新增依赖必须修改所属 `package.json`、运行 `pnpm install --lockfile-only` 并提交 `pnpm-lock.yaml`；清单版本禁止 `latest`。
- 新增依赖的本地 GREEN 顺序固定为 `pnpm install --lockfile-only` 校验 lockfile，再执行 `pnpm install --frozen-lockfile` 物化依赖后运行测试；不能让增量 node_modules 掩盖未声明直接依赖。
- 所有文档命令以 PowerShell、bash 和 CI shell 均可执行为准：本地二进制统一 `pnpm exec <bin>`，跨步骤值写入 JSON artifact 并由 Node script 读取；禁止裸 `cross-env`、POSIX-only `VAR=$(...)` 或依赖当前 shell 的环境变量串联。
- 每个新增/修改 HTTP controller 都必须生成 Nest OpenAPI document 并通过“路由、能力、request/response Zod schema”一致性测试；Task 48 只汇总验证，不首次发明 OpenAPI。
- 每个 migration task 的 Step 1 必须先创建该编号的 comment-only、可被 runner 加载的合法 migration，并写目标 schema introspection test；Step 2 的 RED 必须因目标表/约束/策略缺失失败，不能因文件不存在、语法错误或无测试失败。Step 3 在同一编号内替换 comment-only 内容；该 migration 在本任务 GREEN 前不得进入共享环境。
- Task 27 的 `vertical-slice.spec.ts` 是进入 Task 28-50 的硬门：项目/原文/Scene/Shot/Fake 图片/quarantine+审核+代理/节点缩略图/Selection/项目 SSE/刷新离线/第二客户端只读必须全程通过真实 Web UI、HTTP 与 WebSocket；Playwright API 只允许种故障和查询断言，不能代替用户动作。
- Task 13 引入 `withProjectWriteFence` 后，所有已有项目域写入必须在 Task 13 内回填，所有后续 Project/Episode/Canvas/asset/Job/Selection/Timeline/review/share/export/retention 写入及 projectionSeq 分配必须在 shared fence 中执行；Task 41 的快照/恢复独占同一 fence。任何任务漏用都由 project-fence integration test 和 Task 48 静态 verifier 阻断。
- 每个 Project-scoped HTTP/WS/SSE/upload/signed-URL/Worker command test 除角色 capability 正反例和跨 tenant 外，必须包含“同 tenant、有效 principal、无该 Project membership”的拒绝；禁止用 tenant membership 代替 Project authorization。
- 计划中的版本是已知兼容基线：Node `24.5.0`、pnpm `10.15.0`、TypeScript `5.9.2`、Turbo `2.5.6`、Vitest `3.2.4`、Playwright `1.55.0`、React `19.1.1`、Vite `7.1.3`、NestJS `11.1.6`、Zod `4.1.1`、Drizzle `0.44.5`、BullMQ `5.58.2`、Yjs `13.6.27`、Hocuspocus `3.2.3`、React Flow `12.8.4`。ADR-0006 只允许因安全公告或不可安装而整体升级并重新跑全部门禁。

---

## 0. 文件结构与职责

```text
apps/
  web/                       React 工具界面、路由和离线入口
  api/                       NestJS/Fastify 业务 API 与 SSE
  collab/                    Hocuspocus、Yjs durable revision 与投影消费
  worker-generation/         独立 Dispatcher entrypoint；模型提交、恢复、轮询、Webhook 与费用结算
  worker-media/              quarantine、代理、static-motion 与最终合成
packages/
  contracts/                 Zod DTO、事件、稳定 ID 与业务类型
  canvas-core/               renderer 无关图模型、命令、端口和校验
  canvas-renderer-reactflow/ React Flow surface、node/edge renderer 与 LOD
  canvas-collab-yjs/         Yjs 命令投影、migration、origin 与 UndoManager
  db/                        Drizzle schema、增量迁移、RLS 与 tenant context
  provider-sdk/              模型能力、请求、状态、计费和恢复契约
  queue/                     BullMQ、Outbox dispatcher 和 consumer receipt
  storage/                   S3 multipart、quarantine、签名 URL 与 opaque key
  observability/             日志、trace、metric 与脱敏
  ui/                        令牌、可访问基础组件与 Lucide 图标封装
  config/                    环境变量和共享工具配置
  test-kit/                  fixture、容器、fake provider 与故障注入
tests/
  e2e/support/               Playwright fixture 与页面驱动器
  e2e/specs/                 跨应用验收
  performance/               画布基准与 k6 场景
  fixtures/                  权利清晰的黄金剧本、媒体、字体和 checksum
infra/docker/                本地依赖、数据库角色和镜像
infra/deploy/kubernetes/     六个应用工作负载、egress/观测基础设施、预发/生产 overlay 与网络策略
docs/adr/                    已签署架构决策
docs/research/               用户、供应商、黄金样例与可用性证据
docs/runbooks/               故障、恢复、删除、供应商和发布手册
scripts/                     preflight、workspace、schema 与 release 校验
```

## 1. 固定注册点与迁移顺序

每个任务的 **Integration Gate** 必须对下列注册点写明 `Modify` 或 `N/A（原因）`；只有创建这些文件的 Task 01 使用 `Create`。不能让模块、Worker processor、页面、节点或契约只存在于文件系统中：

| ID | 注册点 |
|---|---|
| `C` | `packages/contracts/src/index.ts` |
| `D` | `packages/db/src/schema/index.ts` |
| `A` | `apps/api/src/app.module.ts` |
| `W` | `apps/web/src/app/router.tsx` |
| `R` | `packages/canvas-renderer-reactflow/src/node-registry.tsx` 与 `src/index.ts` |
| `G` | `apps/worker-generation/src/adapter-registry.ts` 与 `src/main.ts` |
| `M` | `apps/worker-media/src/main.ts` |
| `T` | `packages/test-kit/src/index.ts` |
| `Q` | `packages/queue/src/index.ts` |

数据库迁移只能向前新增，合并后不得修改：

```text
0001_identity.sql              0008_billing.sql
0002_idempotency_audit.sql     0009_generation.sql
0003_projects.sql              0010_generation_batches.sql
0004_rights_moderation.sql     0011_narrative.sql
0005_canvas_collab.sql         0012_bibles.sql
0006_assets_uploads.sql        0013_asset_selection.sql
0007_model_catalog.sql         0014_audio.sql
0015_timeline_content.sql      0018_share_sessions.sql
0016_project_snapshots.sql     0019_exports.sql
0017_reviews.sql               0020_retention_appeals.sql
```

每个 migration task 固定验证：空库 migrate、上一个 release schema upgrade、runtime non-owner 的无 tenant/跨 tenant 拒绝、schema typecheck。数据库命令统一为 `pnpm --filter @comic-canvas/db test:migration -- <migration>`。

## 2. Workspace 清单基线

Task 01 在任何 RED test 之前创建全部 workspace manifest、typecheck/build tsconfig、真实入口、固定注册点、非空 bootstrap test 与 script。内部包统一 `@comic-canvas/*`，`type=module`，公开入口 `./src/index.ts`；`build` 必须写入可部署的 `dist/`，`typecheck` 才使用 `--noEmit`，`test` 禁止 `--passWithNoTests`。外部依赖固定如下：

| Workspace | Production dependencies |
|---|---|
| `apps/web` | `react@19.1.1`, `react-dom@19.1.1`, `@tanstack/react-router@1.131.2`, `@tanstack/react-query@5.85.5`, `zustand@5.0.8`, `yjs@13.6.27`, `y-indexeddb@9.0.12`, `@hocuspocus/provider@3.2.3`, `oidc-client-ts@3.3.0` |
| `apps/api` | `@nestjs/common@11.1.6`, `@nestjs/core@11.1.6`, `@nestjs/platform-fastify@11.1.6`, `@nestjs/swagger@11.2.0`, `fastify@5.5.0`, `reflect-metadata@0.2.2`, `rxjs@7.8.2`, `jose@6.1.0` |
| `apps/collab` | `@hocuspocus/server@3.2.3`, `yjs@13.6.27`, `jose@6.1.0` |
| `apps/worker-generation` | `bullmq@5.58.2`, `ioredis@5.7.0` |
| `apps/worker-media` | `bullmq@5.58.2`, `ioredis@5.7.0`, `execa@9.6.0` |
| `packages/contracts`, `canvas-core`, `config`, `provider-sdk` | `zod@4.1.1` |
| `packages/canvas-renderer-reactflow` | `react@19.1.1`, `@xyflow/react@12.8.4` |
| `packages/canvas-collab-yjs` | `yjs@13.6.27` |
| `packages/db` | `drizzle-orm@0.44.5`, `pg@8.16.3` |
| `packages/queue` | `bullmq@5.58.2`, `ioredis@5.7.0` |
| `packages/storage` | `@aws-sdk/client-s3@3.864.0`, `@aws-sdk/s3-request-presigner@3.864.0` |
| `packages/ui` | `react@19.1.1`, `@radix-ui/react-dialog@1.1.15`, `@radix-ui/react-tooltip@1.2.8`, `lucide-react@0.541.0` |
| `packages/observability` | `@opentelemetry/api@1.9.0`, `pino@9.9.0` |
| `packages/test-kit` | `fast-check@4.2.0`, `testcontainers@11.5.1`, `yjs@13.6.27`, `pg@8.16.3` |

根 devDependencies 固定 `typescript@5.9.2`、`turbo@2.5.6`、`vite@7.1.3`、`vitest@3.2.4`、`@playwright/test@1.55.0`、`eslint@9.34.0`、`prettier@3.6.2`、`dependency-cruiser@16.10.4`、`cross-env@10.0.0`、`@types/node@24.3.0`、`@types/react@19.1.10`、`@types/react-dom@19.1.7`。API devDependencies 固定 `@nestjs/testing@11.1.6`、`supertest@7.1.4`、`@types/supertest@6.0.3`；Web/UI/renderer devDependencies 固定 `@testing-library/react@16.3.0`、`@testing-library/user-event@14.6.1`、`@testing-library/jest-dom@6.8.0`、`jsdom@26.1.0`；DB/Test Kit devDependencies 固定 `@types/pg@8.15.5`。FFmpeg/ffprobe 固定 `7.1.1` container image digest，k6 固定 `1.0.0` binary checksum，均记录在 ADR-0006。

直接内部依赖固定为下表；未列出的边禁止出现，测试专用依赖放 devDependencies，`verify:workspaces` 同时检查 import 与 manifest 声明，不接受传递依赖碰巧可用：

| Workspace | Direct `@comic-canvas/*` dependencies |
|---|---|
| `apps/web` | `contracts`, `canvas-core`, `canvas-renderer-reactflow`, `canvas-collab-yjs`, `ui`, `config`, `observability` |
| `apps/api` | `contracts`, `db`, `queue`, `storage`, `config`, `observability` |
| `apps/collab` | `contracts`, `canvas-collab-yjs`, `db`, `queue`, `config`, `observability` |
| `apps/worker-generation` | `contracts`, `db`, `provider-sdk`, `queue`, `storage`, `config`, `observability` |
| `apps/worker-media` | `contracts`, `db`, `queue`, `storage`, `config`, `observability` |
| `packages/canvas-core` | `contracts` |
| `packages/canvas-renderer-reactflow` | `contracts`, `canvas-core`, `ui` |
| `packages/canvas-collab-yjs` | `contracts`, `canvas-core` |
| `packages/db` | `contracts`, `config` |
| `packages/provider-sdk` | `contracts`, `storage`, `config` |
| `packages/queue` | `contracts`, `db`, `config` |
| `packages/storage` | `contracts`, `config` |
| `packages/observability` | `config` |
| `packages/test-kit` | `contracts`, `canvas-core`, `canvas-collab-yjs`, `db`, `provider-sdk`, `queue`, `storage` |
| `packages/contracts`, `packages/ui`, `packages/config` | none |

测试代码允许的反向内部依赖单独固定如下，且只能放在对应 manifest 的 `devDependencies`；未列出的 workspace 不得 import `@comic-canvas/test-kit`，从而避免低层包形成测试循环：

| Test consumer | Allowed test-only dependency |
|---|---|
| `apps/web`, `apps/api`, `apps/collab`, `apps/worker-generation`, `apps/worker-media` | `@comic-canvas/test-kit` |
| `packages/canvas-renderer-reactflow`, `packages/ui`, `packages/observability` | `@comic-canvas/test-kit` |

`verify:workspaces` 分别校验 production dependency 图和这张 test-only allowlist；运行时代码、build output 和 production image 均不得解析到 `test-kit`。Collab 对 JWT/JWKS 的运行时 import 必须由自身 manifest 直接声明 `jose`，不能借用 API 的依赖。

---

## Wave A：前置与工程底座

### Task 00: 决策冻结与真实证据包

**Files:**
- Create: `docs/adr/0001-product-scope-and-devices.md`
- Create: `docs/adr/0002-canvas-renderer-and-scale.md`
- Create: `docs/adr/0003-state-authority-and-projection.md`
- Create: `docs/adr/0004-jobs-cost-and-orchestration.md`
- Create: `docs/adr/0005-providers-region-and-retention.md`
- Create: `docs/adr/0006-deployment-ci-release.md`
- Create: `docs/research/provider-scorecard.md`
- Create: `docs/research/golden-project-manifest.md`
- Create: `docs/research/usability-protocol.md`
- Create: `docs/research/user-interview-evidence.md`
- Create: `docs/research/production-observation-evidence.md`
- Create: `docs/research/prototype-rounds-evidence.md`
- Create: `docs/research/brand-font-license-evidence.md`
- Create: `docs/research/engineering-readiness.md`
- Create: `docs/research/legal-operations-readiness.md`
- Create: `docs/research/development-freeze-record.md`
- Create: `scripts/verify-preflight.mjs`

**Interfaces:** Produces six accepted ADRs, provider recovery evidence, three rights-cleared golden projects, completed 12-person interviews, three observed real productions, two measured prototype rounds, brand/font evidence, engineering and legal/operations readiness, fixed k6/QC/compatibility thresholds, the release approver list and one accepted development Freeze Record that is the sole gate into Task 01. Consumes blueprint sections 19 through 25.

**Integration Gate:** `C/D/A/W/R/G/M/T/Q` N/A；本任务只冻结证据与决策。

- [ ] **Step 1: Write the verifier and expected evidence schema**

`verify-preflight.mjs` reads all 16 evidence/ADR files above, requires `Status: Accepted` in every ADR, named Product/Engineering/Design/Legal/Operations approvers, ISO date, source links or artifact checksums, and rejects placeholder markers, protocol-only claims or an empty provider recovery field. Participant identities are pseudonymized, but role/cohort/session date/raw-note checksum and consent basis are mandatory. `development-freeze-record.md` must contain one row per decision with exact `gateId/finalDecision/evidenceLinksOrSha256/owner/requiredApproverRoles/approverIdentities/approvedAt/status/supersedes/unresolvedBlockers`; `status=blocked`、缺字段、过期 evidence 或未签署依赖都使整个 gate 失败。

- [ ] **Step 2: Run the preflight RED check**

Run: `node scripts/verify-preflight.mjs`<br>
Expected: FAIL listing exactly the 16 missing evidence files, including the Freeze Record.

- [ ] **Step 3: Produce measured decisions**

ADR-0005 records a primary and evaluated backup for text/image/video/TTS, 100 representative requests each, region/data-use/price/concurrency, webhook identity scope, idempotent client token or authoritative lookup evidence, all four recovery results and `unknown/unsupported -> reconciling`. Each capability must pass its signed legal/data/recovery/cancel/billing contract gate and the blueprint 21.2 text/image/video/TTS numeric hard gate; weighted score only ranks candidates and cannot rescue a hard-gate failure. ADR-0006 accepts the blueprint-default Kubernetes 1.36/Kustomize deployment target or records equivalent platform evidence before this plan is amended; against the chosen managed platform support matrix it freezes the latest supported 1.36.x patch, deployment regions, every base/runtime/scanner image digest, downloaded binary checksum, five application image names, Compose profiles, controlled/SafeFetch egress implementation, the installed Gateway API controller version/image digest plus exact GatewayClass/controllerName, cert-manager or managed certificate issuer/renewal mechanism, external LB policy, WebSocket/SSE controller policy and timeouts, k6 VUs/durations, browser matrix, SBOM/provenance formats, RPO/RTO, release owners and rollback criteria. It must prove `/collab` WebSocket upgrade with keepalive `<=20s` and gateway/LB idle timeout `>=120s` and greater than the owner lease; SSE response buffering/transform is off, heartbeat is 15s with immediate flush, and stream timeout is disabled or `>=15m`. The golden manifest lists exact relative paths, source URL, license evidence, SHA-256, rights owner, expected duration/QC and no synthetic scores. ADR-0001 freezes MVP primary persona, route/capability mode rules, `N` quick-create/Tab focus behavior and default `captionMode=burn-in+sidecar` with SRT always delivered.

Interview evidence includes at least 4 novice creators, 4 experienced AI-video operators and 4 director/producer/review roles, at least 6 qualifying primary-persona creators, and the complete persona x five-journey coverage matrix from blueprint 21.1 with eligible/completed counts, raw-note checksum and finding-to-decision mapping in every cell. Observation evidence covers at least 3 real projects end to end with tools, elapsed/active time, failures, rework and actual costs. Prototype evidence contains two rounds over the required low-fidelity flows, per-task numerator/denominator, raw session checksum and core task completion `>=90%`; a protocol without results fails. Brand/font evidence names final working brand decision, logo source and every Chinese/UI/export font license/checksum. Engineering readiness proves repository/CI/environments/PostgreSQL/Redis/S3/CDN/OIDC/KMS/TLS/PITR/object versioning/RPO-RTO owners. Legal/operations readiness signs input-training default, privacy/terms, rights declaration, AI label, complaint/takedown, retention and provider-outage/misbilling procedures. Finally populate the Freeze Record only from these verified artifacts; changing an accepted row requires an append-only superseding row and all affected approvals.

- [ ] **Step 4: Verify and hold the approval gate**

Run: `node scripts/verify-preflight.mjs`<br>
Expected: PASS with `16 evidence files; 6 accepted ADRs; 12 interviews; primary persona >=6; persona-journey cells complete; 3 observations; 2 prototype rounds; four provider classes hard-gated; core completion >=90%; freeze accepted; 0 placeholders`.

- [ ] **Step 5: Commit**

```bash
git add docs/adr docs/research scripts/verify-preflight.mjs
git commit -m "docs: freeze comic canvas delivery decisions"
```

---

### Task 01: 全量 Monorepo 清单与工具链

**Files:**
- Create: root `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`, `eslint.config.mjs`, `prettier.config.mjs`, `vitest.workspace.ts`, `playwright.config.ts`, `.dependency-cruiser.cjs`, `.editorconfig`, `.gitignore`, `.env.example`
- Create: `apps/web/package.json`, `apps/web/tsconfig.json`, `apps/web/src/index.ts`
- Create: `apps/web/tsconfig.build.json`, `apps/web/vite.config.ts`, `apps/web/src/main.tsx`, `apps/web/src/app/router.tsx`, `apps/web/src/bootstrap.test.ts`
- Create: `apps/api/package.json`, `apps/api/tsconfig.json`, `apps/api/src/index.ts`, `apps/api/src/app.module.ts`
- Create: `apps/api/tsconfig.build.json`, `apps/api/vitest.e2e.config.ts`, `apps/api/src/bootstrap.test.ts`
- Create: `apps/collab/package.json`, `apps/collab/tsconfig.json`, `apps/collab/src/index.ts`
- Create: `apps/collab/tsconfig.build.json`, `apps/collab/src/bootstrap.test.ts`
- Create: `apps/worker-generation/package.json`, `apps/worker-generation/tsconfig.json`, `apps/worker-generation/src/index.ts`
- Create: `apps/worker-generation/tsconfig.build.json`, `apps/worker-generation/src/main.ts`, `apps/worker-generation/src/adapter-registry.ts`, `apps/worker-generation/src/bootstrap.test.ts`
- Create: `apps/worker-media/package.json`, `apps/worker-media/tsconfig.json`, `apps/worker-media/src/index.ts`
- Create: `apps/worker-media/tsconfig.build.json`, `apps/worker-media/src/main.ts`, `apps/worker-media/src/processor-registry.ts`, `apps/worker-media/src/bootstrap.test.ts`
- Create: `packages/contracts/package.json`, `packages/contracts/tsconfig.json`, `packages/contracts/src/index.ts`
- Create: `packages/contracts/tsconfig.build.json`, `packages/contracts/src/bootstrap.test.ts`
- Create: `packages/canvas-core/package.json`, `packages/canvas-core/tsconfig.json`, `packages/canvas-core/src/index.ts`
- Create: `packages/canvas-core/tsconfig.build.json`, `packages/canvas-core/src/bootstrap.test.ts`
- Create: `packages/canvas-renderer-reactflow/package.json`, `packages/canvas-renderer-reactflow/tsconfig.json`, `packages/canvas-renderer-reactflow/src/index.ts`
- Create: `packages/canvas-renderer-reactflow/tsconfig.build.json`, `packages/canvas-renderer-reactflow/src/node-registry.tsx`, `packages/canvas-renderer-reactflow/src/bootstrap.test.ts`
- Create: `packages/canvas-collab-yjs/package.json`, `packages/canvas-collab-yjs/tsconfig.json`, `packages/canvas-collab-yjs/src/index.ts`
- Create: `packages/canvas-collab-yjs/tsconfig.build.json`, `packages/canvas-collab-yjs/src/bootstrap.test.ts`
- Create: `packages/db/package.json`, `packages/db/tsconfig.json`, `packages/db/src/index.ts`
- Create: `packages/db/tsconfig.build.json`, `packages/db/vitest.migration.config.ts`, `packages/db/src/schema/index.ts`, `packages/db/src/migrate.ts`, `packages/db/src/migrate.test.ts`, `packages/db/src/bootstrap.test.ts`
- Create: `packages/provider-sdk/package.json`, `packages/provider-sdk/tsconfig.json`, `packages/provider-sdk/src/index.ts`
- Create: `packages/provider-sdk/tsconfig.build.json`, `packages/provider-sdk/src/bootstrap.test.ts`
- Create: `packages/queue/package.json`, `packages/queue/tsconfig.json`, `packages/queue/src/index.ts`
- Create: `packages/queue/tsconfig.build.json`, `packages/queue/src/bootstrap.test.ts`
- Create: `packages/storage/package.json`, `packages/storage/tsconfig.json`, `packages/storage/src/index.ts`
- Create: `packages/storage/tsconfig.build.json`, `packages/storage/src/bootstrap.test.ts`
- Create: `packages/observability/package.json`, `packages/observability/tsconfig.json`, `packages/observability/src/index.ts`
- Create: `packages/observability/tsconfig.build.json`, `packages/observability/src/bootstrap.test.ts`
- Create: `packages/ui/package.json`, `packages/ui/tsconfig.json`, `packages/ui/src/index.ts`
- Create: `packages/ui/tsconfig.build.json`, `packages/ui/src/bootstrap.test.ts`
- Create: `packages/config/package.json`, `packages/config/tsconfig.json`, `packages/config/src/index.ts`
- Create: `packages/config/tsconfig.build.json`, `packages/config/src/bootstrap.test.ts`
- Create: `packages/test-kit/package.json`, `packages/test-kit/tsconfig.json`, `packages/test-kit/src/index.ts`
- Create: `packages/test-kit/tsconfig.build.json`, `packages/test-kit/src/bootstrap.test.ts`
- Create: `scripts/verify-workspaces.mjs`, `scripts/verify-fixed-points.mjs`
- Create: `pnpm-lock.yaml`

**Interfaces:** Produces a resolvable workspace graph; deployable `dist/` output; root scripts `dev`, `build`, `typecheck`, `format:check`, `lint`, `test`, `test:integration`, `test:e2e`, `verify:workspaces`, `verify:fixed-points`, `verify:boundaries`; API package `test:e2e`; DB package `migrate` and `test:migration`; and Generation Worker `test:staging` before any feature test is authored. `migrate.ts` applies contiguous immutable SQL under a PostgreSQL advisory lock and records filename/SHA-256/appliedAt/releaseSha in `schema_migrations`.

**Integration Gate:** `C/D/A/W/R/G/M/T/Q` Create typed, executable empty registries; every later task must use explicit Modify/N/A. No feature registration yet.

- [ ] **Step 1: Create every manifest and TypeScript config**

Use both dependency tables in section 2 exactly. Web `build` is `vite build`; every Node app/package `build` is `tsc -p tsconfig.build.json` with `rootDir/src`, `outDir/dist`, declarations for packages and runnable JS for apps; every `typecheck` is `tsc -p tsconfig.json --noEmit`. Every workspace `test` runs Vitest without `--passWithNoTests` and imports its real entry/registry in `bootstrap.test.ts`. Root `test:integration` uses `vitest.integration.ts`, root `test:e2e` uses Playwright, API `test:e2e` uses `vitest.e2e.config.ts`, DB `test:migration -- <file>` uses `vitest.migration.config.ts` plus the explicit target argument. The production `migrate` script refuses a gap, changed applied checksum, dirty transaction or second concurrent runner; an empty migration directory is a valid no-op in Task 01. Generation Worker `test:staging` uses `vitest.staging.config.ts` and excludes live cases unless `PROVIDER_SMOKE=1`.

- [ ] **Step 2: Install and materialize the lockfile**

Run: `corepack pnpm install --lockfile-only`<br>
Expected: exit 0; every external dependency resolves to the exact version in section 2 and `pnpm-lock.yaml` is created without relying on an existing `node_modules`.<br>
Run: `corepack pnpm install --frozen-lockfile`<br>
Expected: exit 0; the just-created lockfile is accepted unchanged and all declared dependencies are materialized.

- [ ] **Step 3: Add a workspace completeness verifier**

The verifier enumerates the 5 apps and 12 packages from section 0, asserts manifest/typecheck+build tsconfig/entrypoint/bootstrap test/scripts, exact external versions, the allowed direct internal-dependency table, no undeclared import, emitted build targets and no React Flow import outside the renderer package. Because Task 01 intentionally declares dependencies consumed by later tasks, unused-dependency rejection is deferred to Task 48 after the feature graph exists. `verify-fixed-points` imports `C/D/A/W/R/G/M/T/Q` and asserts each empty registry is callable instead of checking path existence only.

- [ ] **Step 4: Verify the toolchain**

Run: `pnpm verify:workspaces && pnpm verify:fixed-points && pnpm verify:boundaries && pnpm format:check && pnpm typecheck && pnpm lint && pnpm test && pnpm build`<br>
Expected: PASS; verifier reports `17 workspaces complete; 9 fixed points importable`, dependency-cruiser reports zero forbidden edges, Prettier reports zero drift, the empty production migrator no-ops safely and rejects a controlled concurrent/checksum fixture, 17 named bootstrap suites execute, typecheck/lint have 0 errors, and every workspace emits its expected deployable artifact under `dist/`.

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-workspace.yaml turbo.json tsconfig.base.json eslint.config.mjs prettier.config.mjs vitest.workspace.ts playwright.config.ts .dependency-cruiser.cjs .editorconfig .gitignore .env.example apps packages scripts/verify-workspaces.mjs scripts/verify-fixed-points.mjs pnpm-lock.yaml
git commit -m "chore: bootstrap complete comic canvas workspace"
```

---

### Task 02: Config、五个运行镜像、部署清单与健康检查

**Files:**
- Create: `packages/config/src/env.ts`, `packages/config/src/env.test.ts`
- Modify: `packages/config/src/index.ts`
- Modify: root `package.json`, `.env.example`
- Create: root `.dockerignore`
- Create: `infra/docker/compose.yml`, `infra/docker/postgres/init-roles.sql`, `infra/docker/nginx.conf`
- Create: `infra/docker/keycloak/realm.json`, `infra/docker/keycloak/clients.json`, `infra/docker/keycloak/test-users.json`, `infra/docker/keycloak/allowlist-seed.json`
- Create: `infra/docker/Dockerfile.web`, `infra/docker/Dockerfile.api`, `infra/docker/Dockerfile.collab`, `infra/docker/Dockerfile.worker-generation`, `infra/docker/Dockerfile.worker-media`
- Create: `infra/deploy/kubernetes/base/kustomization.yaml`, `infra/deploy/kubernetes/base/config.yaml`, `infra/deploy/kubernetes/base/web.yaml`, `infra/deploy/kubernetes/base/api.yaml`, `infra/deploy/kubernetes/base/collab.yaml`, `infra/deploy/kubernetes/base/dispatcher.yaml`, `infra/deploy/kubernetes/base/worker-generation.yaml`, `infra/deploy/kubernetes/base/worker-media.yaml`, `infra/deploy/kubernetes/base/migrator-job.yaml`, `infra/deploy/kubernetes/base/gateway.yaml`, `infra/deploy/kubernetes/base/gateway-controller-profile.json`, `infra/deploy/kubernetes/base/gateway-policies.yaml`, `infra/deploy/kubernetes/base/certificate.yaml`, `infra/deploy/kubernetes/base/internal-tls.yaml`, `infra/deploy/kubernetes/base/controlled-egress-gateway.yaml`, `infra/deploy/kubernetes/base/safe-fetch-egress-proxy.yaml`, `infra/deploy/kubernetes/base/network-policies.yaml`, `infra/deploy/kubernetes/base/network-policy-matrix.json`
- Create: `infra/deploy/kubernetes/overlays/staging/kustomization.yaml`, `infra/deploy/kubernetes/overlays/staging/patches.yaml`, `infra/deploy/kubernetes/overlays/production/kustomization.yaml`, `infra/deploy/kubernetes/overlays/production/patches.yaml`
- Create: `scripts/build-images.mjs`, `scripts/verify-images.mjs`, `scripts/render-deployment.mjs`, `scripts/seed-keycloak.mjs`, `scripts/verify-runtime-artifacts.test.mjs`, `scripts/verify-network-boundaries.test.mjs`
- Create: `packages/config/src/loopback-health-probe.ts`, `packages/config/src/loopback-health-probe.test.ts`
- Create: `apps/api/src/main.ts`, `apps/api/src/health.controller.ts`, `apps/api/test/health.e2e-spec.ts`
- Create: `apps/api/src/platform/http-boundary.ts`, `apps/api/src/platform/http-boundary.test.ts`
- Modify: `apps/api/src/app.module.ts`
- Create: `apps/collab/src/health.ts`, `apps/collab/src/health.test.ts`
- Create: `apps/collab/src/main.ts`
- Create: `apps/worker-generation/src/health.ts`, `apps/worker-generation/src/health.test.ts`
- Create: `apps/worker-generation/src/dispatcher-main.ts`
- Modify: `apps/worker-generation/src/main.ts`
- Create: `apps/worker-media/src/health.ts`, `apps/worker-media/src/health.test.ts`
- Modify: `apps/worker-media/src/main.ts`

**Interfaces:** Produces `loadEnv(source: NodeJS.ProcessEnv): AppEnv`; five OCI images for Web/API/Collab/Generation Worker/Media Worker; six least-privilege application workloads because the Generation image also exposes a separate `dispatcher-main` entrypoint; `GET /health -> {status:"ok", service:string, version:string, readiness:"ready"|"not_ready"}` for HTTP processes and the same contract on loopback health ports for Dispatcher/Workers; a shared exec-compatible loopback probe; Compose profiles `deps`, `app`, `test`, `release`; deterministic Keycloak realm/client/test-user/allowlist seeds; ADR-bound Gateway API controller/GatewayClass, certificate issuer/renewal resources, TLS Gateway/HTTPRoutes and internal mTLS identity; controller-specific `/collab` WebSocket and `/v1/projects/*/events` SSE policies; controlled FQDN egress gateway plus isolated SafeFetch proxy; a machine-readable per-process ingress/egress/credential matrix; Kubernetes 1.36 base plus staging/production overlays, with ADR-0006 freezing the managed platform's latest supported 1.36.x patch and all image digests; `build-images.mjs --sha <gitSha> --target test|production -> image-manifest.json`; and `render-deployment.mjs --environment staging|production --image-manifest <path> --out <path>` whose rendered workloads use digests only.

**Integration Gate:** `A/G/M` Modify: register `HealthController` and Generation/Media health bootstrap in their fixed main entrypoints; Collab/Dispatcher entrypoints also expose dependency-aware health outside the fixed-point catalog; `C/D/W/R/T/Q` N/A because this is process/config/deployment bootstrap.

- [ ] **Step 1: Write failing environment, health and runtime-artifact tests**

```ts
expect(() => loadEnv({ NODE_ENV: "test" })).toThrow(/DATABASE_URL/);
expect((await request(app.getHttpServer()).get("/health")).body)
  .toEqual({ status: "ok", service: "api", version: "test", readiness: "ready" });
```

The process tests require liveness without dependencies and readiness only after PostgreSQL/Redis/object-store checks appropriate to that role. `verify-runtime-artifacts.test.mjs` requires exactly five Dockerfiles, six declared application entrypoints/workloads, non-root final users, exec-form entrypoints, OCI source/revision labels, read-only root filesystem compatibility, bounded stop time, health probes, no copied `.env`/credentials/test results, and a Kubernetes workload/security context for every entrypoint. Kubelet probes for Dispatcher/Workers must be `exec` probes that call the packaged Node loopback probe against `127.0.0.1`; a Pod-IP `httpGet` may not target a loopback-only listener. It also requires Media Worker to report the ADR-0006 FFmpeg `7.1.1`, ClamAV engine and signed-definition snapshot checksums.

`verify-network-boundaries.test.mjs` requires the ADR-0006 controller version/digest and exact GatewayClass/controllerName to match rendered resources; the named cert issuer, Certificate refs, renewal policy and external LB settings must be present and ready-checkable. It requires TLS listener/certificate refs, exact `/`, `/v1`+webhook, dedicated SSE and `/collab` routes, cluster-internal TLS, proxy CIDR/hop config, stripping/rebuilding forwarded headers, and a raw-body webhook path with decompression/JSON parsing disabled until signature verification. Controller policy must preserve `/collab` upgrade, use keepalive `<=20s` and effective gateway+LB idle timeout `>=120s` and greater than the frozen room lease; the SSE policy disables buffering/response transformation, preserves `text/event-stream`, flushes a 15s heartbeat and disables stream timeout or sets it `>=15m`. It enumerates the JSON matrix against rendered NetworkPolicies: application Pods have no direct DNS/Internet or `0.0.0.0/0`; private services use frozen CIDRs; OIDC/KMS/provider calls use the identity-aware controlled gateway; only Media reaches the SafeFetch proxy; only those infrastructure gateways have allowlisted external egress. SafeFetch proxy config/test must resolve and validate every hop itself, connect the exact just-validated public IP while preserving TLS SNI/hostname verification, revalidate redirects and enforce mTLS caller identity plus non-expandable byte/time limits; DNS rebind between validation/connect and redirect-to-private fixtures both fail. Keycloak seed validation requires one realm, Web PKCE client, API/Collab audiences, deterministic Owner/Editor/Generator/Commenter/Viewer test users and invitation allowlist records without production secrets.

- [ ] **Step 2: Run RED**

Run: `pnpm --filter @comic-canvas/config test -- src/env.test.ts`<br>
Expected: FAIL because `loadEnv` is not exported.<br>
Run: `pnpm --filter @comic-canvas/api test:e2e -- health.e2e-spec.ts`<br>
Expected: FAIL because the readiness-aware health contract is not registered.<br>
Run: `node --test scripts/verify-runtime-artifacts.test.mjs`<br>
Expected: FAIL `RUNTIME_IMAGE_SET_MISSING` with the exact five expected image names; the verifier and fixture-free expected set already exist.

- [ ] **Step 3: Implement validation and the bootable API**

`AppEnv` validates role-specific PostgreSQL URLs, Redis/S3/OIDC URLs, bucket, distinct generation-submit and webhook-verification KMS key IDs, API-only Collab-session private-JWK file plus Collab-only public-JWKS file, public base URL, trusted proxy CIDRs/hop count, internal service identity, controlled/SafeFetch egress endpoints, process role, immutable `RELEASE_SHA`/own image digest and API-visible Media image/compiler digest, plus `BETA_ACCESS_MODE=off|allowlist|open`. Compose defines PostgreSQL 16, Redis 7, MinIO, Keycloak and Mailpit with localhost bindings and named volumes under `deps`; six application services from five images join `app`, isolated deterministic dependencies and Fake wiring join `test`, and production-shaped images with Fake disabled join `release`. `seed-keycloak.mjs` imports/validates the committed realm artifacts idempotently and refuses a non-test target when test users are requested. Dispatcher launches only `dispatcher-main`, receives `comic_dispatcher` plus Redis credentials and never receives provider/KMS/API credentials. Session key files are runtime secret mounts, never environment values or image layers. `render-deployment` injects release/image/compiler identity from the verified image manifest, never operator-typed tags; it also rejects an unrecognized GatewayClass/controller digest, missing issuer/renewal evidence, WebSocket upgrade loss, an idle timeout below the frozen thresholds, SSE buffering, or a stream timeout shorter than the 10-minute release workload. `init-roles.sql` creates `comic_migrator`, NOLOGIN/NOINHERIT/BYPASSRLS `comic_security_owner`, non-runtime NOLOGIN/NOINHERIT/NOBYPASSRLS `comic_operations`, plus runtime `comic_api`, `comic_collab`, `comic_dispatcher`, `comic_generation_worker`, `comic_media_worker`, all without production secrets. Operations receives only later audited repair-function EXECUTE and is activated by a short-lived mapped operator identity; no runtime process may receive it or fall back to migrator/security-owner credentials.

All `FROM` references and downloaded binaries use the accepted digest/checksum ledger in ADR-0006. Web uses an unprivileged static server; API, Collab and Generation Worker share the pinned Node base; Media Worker additionally contains the pinned FFmpeg/ffprobe and ClamAV engine plus signed definition snapshot and proves an EICAR rejection in `test` only. Production stages contain compiled/runtime files only, run as numeric non-root UIDs, accept secrets solely through runtime secret refs, emit `org.opencontainers.image.revision=$RELEASE_SHA`, and never contain Fake provider, source maps, test fixtures or release attestations. The API image includes the compiled migrator runner and numbered SQL as immutable runtime data, but its default entrypoint cannot invoke them; the one-shot migrator Job overrides the command and is the only workload receiving migrator credentials. The Kubernetes base defines three application Services, six application Deployments from five image digests, the signed ingress/egress infrastructure components, one explicit migrator Job, per-process service accounts, probes, resource requests/limits, disruption budgets and default-deny/allowlisted NetworkPolicies. API/Collab use Pod-port probes; Dispatcher/Workers use packaged exec-to-loopback probes. Overlays contain no secret values. `render-deployment` injects the five verified digests and rejects tags, mutable image refs, missing limits/probes/non-root/read-only settings, direct application Internet egress, Dispatcher with non-dispatch credentials or a long-running workload using migrator credentials.

- [ ] **Step 4: Verify config, Compose and HTTP**

Run: `docker compose -f infra/docker/compose.yml --profile deps config`<br>
Expected: exactly five dependency services with localhost-only development ports and named volumes.<br>
Run: `node scripts/seed-keycloak.mjs --validate-only --realm infra/docker/keycloak/realm.json --clients infra/docker/keycloak/clients.json --users infra/docker/keycloak/test-users.json --allowlist infra/docker/keycloak/allowlist-seed.json`<br>
Expected: one deterministic test realm, PKCE/audience/role fixtures and allowlist pass with no production secret or mutable remote dependency.<br>
Run: `docker compose -f infra/docker/compose.yml --profile app --profile test --profile release config`<br>
Expected: all four profiles resolve; six app services use exactly five build targets and each receives only its role-specific credentials.<br>
Run: `pnpm --filter @comic-canvas/config test && pnpm --filter @comic-canvas/api test:e2e && pnpm --filter @comic-canvas/collab test -- health.test.ts && pnpm --filter @comic-canvas/worker-generation test -- health.test.ts && pnpm --filter @comic-canvas/worker-media test -- health.test.ts`<br>
Expected: validation passes and all six long-running entrypoints return the exact liveness/readiness contract, including dependency-down `not_ready`.<br>
Run: `pnpm exec cross-env RELEASE_SHA=local-test pnpm images:build -- --target test && pnpm images:verify -- --manifest test-results/images/image-manifest.json && pnpm deploy:verify -- --manifest test-results/images/image-manifest.json && node --test scripts/verify-network-boundaries.test.mjs`<br>
Expected: exactly five images build and six application containers start as non-root with read-only root filesystems, reach healthy state, stop within 30 seconds and match their OCI revision; loopback probes are executable from kubelet; Dispatcher and Generation share one digest but run distinct entrypoints/credentials; Media reports exact FFmpeg/ClamAV checksums and rejects EICAR; the production-target inspection finds zero Fake/test imports; staging and production render to digest-only valid Kubernetes objects with six application workloads, the ADR-bound ready-checkable GatewayClass/certificate issuer, TLS routes whose WebSocket/SSE policies meet every frozen timeout/buffering invariant, enforceable controlled/SafeFetch egress, one migrator Job and zero embedded secrets or broad application egress.

- [ ] **Step 5: Commit**

```bash
git add package.json packages/config apps/api apps/collab apps/worker-generation apps/worker-media infra scripts/build-images.mjs scripts/verify-images.mjs scripts/render-deployment.mjs scripts/seed-keycloak.mjs scripts/verify-runtime-artifacts.test.mjs scripts/verify-network-boundaries.test.mjs .dockerignore .env.example
git commit -m "feat: add validated deployable runtime stack"
```

### Task 03: Test Kit、黄金 fixture 与 Playwright 驱动底座

**Files:**
- Create: `packages/test-kit/src/protocols.ts`, `packages/test-kit/src/canvas.ts`, `packages/test-kit/src/yjs.ts`, `packages/test-kit/src/db.ts`, `packages/test-kit/src/api.ts`, `packages/test-kit/src/provider.ts`, `packages/test-kit/src/story.ts`, `packages/test-kit/src/media.ts`
- Modify: `packages/test-kit/src/index.ts`
- Create: `packages/test-kit/src/index.test.ts`
- Create: `tests/e2e/support/fixtures.ts`, `tests/e2e/support/drivers/project.driver.ts`, `tests/e2e/support/drivers/canvas.driver.ts`, `tests/e2e/support/drivers/story.driver.ts`, `tests/e2e/support/drivers/bibles.driver.ts`, `tests/e2e/support/drivers/generation.driver.ts`, `tests/e2e/support/drivers/storyboard.driver.ts`, `tests/e2e/support/drivers/timeline.driver.ts`, `tests/e2e/support/drivers/export.driver.ts`
- Create: `tests/e2e/specs/support-smoke.spec.ts`
- Create: `scripts/generate-test-media.mjs`, `scripts/fetch-golden-projects.mjs`, `scripts/verify-golden-projects.mjs`, `tests/fixtures/fixture-manifest.json`, `tests/fixtures/story/episode-01.md`, `tests/fixtures/rights/records.json`, `tests/fixtures/golden/project-sources.json`, `tests/fixtures/golden/expected.json`
- Create: `.github/workflows/ci.yml`, `vitest.integration.ts`

**Interfaces:** Produces all named test helpers before feature tests consume them. `protocols.ts` declares the exact structural TestCanvas/TestProvider/TestStory/TestAsset interfaces used by these factories without importing future feature packages; Tasks 05, 23 and 30 each add compile-time structural-compatibility assertions against their production contracts.

```ts
export function graphWith(input: GraphFixtureInput): TestCanvasSnapshot;
export function createTestRegistry(overrides?: readonly TestNodeDefinition[]): TestNodeRegistry;
export const pointArb: Arbitrary<Point>;
export const viewportArb: Arbitrary<Viewport>;
export function createCanvasDocFixture(snapshot?: TestCanvasSnapshot): CanvasYDoc;
export function connectTestDocs(a: Y.Doc, b: Y.Doc): { flush(): void; disconnect(): void };
export function createDbTestContext(): Promise<DbTestContext>;
export function createMockProviderAdapter(): Mocked<TestProviderAdapter>;
export function createGenerationWorkerHarness(ctx: WorkerHarnessContext): WorkerHarness;
export function storyProposalFixture(input: { scenes: number; characters: number }): TestStoryParseProposal;
```

`DbTestContext` exposes `db/adminDb/fixture/ids/cleanup`; `WorkerHarness.runUntil()` accepts `before-submit | after-submit-before-external-id-commit | after-provider-success-before-output-commit`. Playwright exports one extended `test` fixture with `api/project/canvas/story/bibles/generation/storyboard/timeline/exportFlow` drivers; no test may depend on an implicit global.

**Integration Gate:** `T` Modify exports every helper; `C/D/A/W/R/G/M/Q` N/A because this task supplies test-only code.

- [ ] **Step 1: Write compile-contract tests for every helper and driver**

`src/index.test.ts` imports every symbol above, creates and cleans a container context, calls `connectTestDocs(...).flush()`, and constructs every Playwright driver from explicit page/API dependencies. `support-smoke.spec.ts` imports the extended fixture and every driver, declares one discoverable browser test, and proves Playwright wiring without relying on a support file being listed as a test. The golden source manifest has exactly three named projects and freezes, for every fetched file, its relative destination, HTTPS source URL, license/provenance evidence ID, byte length and SHA-256; verifier tests reject changed URL/license/hash, missing files and an unlisted file.

- [ ] **Step 2: Run RED**

Run: `pnpm --filter @comic-canvas/test-kit test -- src/index.test.ts`<br>
Expected: FAIL with missing exports from `src/index.ts`, not missing packages.

- [ ] **Step 3: Implement deterministic fixtures and factories**

`generate-test-media.mjs` uses argument-array process spawning to create 1s WAV, 1s CFR MP4, PNG and SRT; verifies the rights-cleared font from Task 00; writes bytes, duration, MIME and SHA-256 to `fixture-manifest.json`. `fetch-golden-projects.mjs` reads only the committed allowlist, streams each file into a gitignored content-addressed cache with size/time limits, verifies license ID/byte length/SHA-256 before atomic placement and never follows an unlisted redirect host. `verify-golden-projects.mjs` can validate either that cache or a CI artifact without network and maps every source to Task 00 evidence. Large golden binaries are downloaded artifacts, not Git blobs. `golden/expected.json` freezes project size, expected output names, 1080x1920/25fps/audio/QC values and normalized stream hashes supplied by the signed golden manifest. DB/container cleanup uses unique tenant IDs and never truncates another test's data.

- [ ] **Step 4: Verify test foundations**

Run: `node scripts/generate-test-media.mjs && node scripts/fetch-golden-projects.mjs --manifest tests/fixtures/golden/project-sources.json --cache test-results/golden-source-cache && node scripts/verify-golden-projects.mjs --manifest tests/fixtures/golden/project-sources.json --cache test-results/golden-source-cache && pnpm --filter @comic-canvas/test-kit test -- src/index.test.ts && pnpm typecheck && pnpm exec playwright test tests/e2e/specs/support-smoke.spec.ts --list`<br>
Expected: generated and three golden-project manifests match exact license/URL/byte/hash evidence, all helper contract tests pass, typecheck resolves every driver, and Playwright lists exactly the named support smoke test without starting the app.

- [ ] **Step 5: Commit**

```bash
git add packages/test-kit tests scripts/generate-test-media.mjs scripts/fetch-golden-projects.mjs scripts/verify-golden-projects.mjs vitest.integration.ts playwright.config.ts .github/workflows/ci.yml
git commit -m "test: establish deterministic comic canvas test kit"
```

---

### Task 04: 通用契约、稳定错误与能力类型

**Files:**
- Create: `packages/contracts/src/ids.ts`, `packages/contracts/src/money.ts`, `packages/contracts/src/auth.ts`, `packages/contracts/src/errors.ts`, `packages/contracts/src/events.ts`, `packages/contracts/src/common.contract.test.ts`
- Modify: `packages/contracts/src/index.ts`
- Create: `apps/api/src/platform/openapi.ts`, `apps/api/src/platform/openapi.test.ts`

**Interfaces:** Produces branded IDs, `MoneyMicrosSchema` as decimal string, `Principal`, all 20 `Capability` values, `ApiErrorEnvelope`, `TraceEnvelope`, project stream envelope and `buildOpenApiDocument(app)` used by every controller test and Task 48.

```ts
export type Capability =
  | "project:view" | "content:edit" | "canvas:edit" | "generation:spend"
  | "asset:upload" | "asset:select" | "asset:approve" | "timeline:edit"
  | "snapshot:create" | "snapshot:restore" | "job:cancel-own" | "job:cancel-any"
  | "comment:create" | "issue:manage" | "share:manage" | "export:create"
  | "stale:waive" | "rights:manage" | "retention:manage" | "project:admin";
export interface ProjectEvent<T> {
  projectId: string; eventId: string; jobSequence?: number;
  occurredAt: string; type: string; data: T;
}
```

**Integration Gate:** `C` Modify exports exact schemas/types; `A` N/A because the OpenAPI builder introspects the Task 01 root module without registering a feature module; `D/W/R/G/M/T/Q` N/A because consumers start in later tasks.

- [ ] **Step 1: Write schema boundary tests**

Assert `MoneyMicrosSchema` accepts `"1200000"`, rejects `1.2` and negative strings; ID schemas reject empty/cross-kind values; error envelope requires stable code and traceId; the Capability schema equals the blueprint's exact 20-member set; ProjectEvent requires projectId/eventId and keeps `jobSequence` separate. The empty API builds a valid OpenAPI 3 document rather than an undefined placeholder.

- [ ] **Step 2: Run RED**

Run: `pnpm --filter @comic-canvas/contracts test -- common.contract.test.ts`<br>
Expected: FAIL because `MoneyMicrosSchema` and `CapabilitySchema` are not exported.

- [ ] **Step 3: Implement Zod schemas and inferred types**

Use discriminated envelopes, ISO datetime validation, non-negative base-10 micros and opaque branded strings. No DTO serializes `bigint` or provider errors directly.

- [ ] **Step 4: Verify contracts and public exports**

Run: `pnpm --filter @comic-canvas/contracts test && pnpm --filter @comic-canvas/contracts typecheck && pnpm --filter @comic-canvas/api test -- openapi.test.ts`<br>
Expected: PASS, all 20 capabilities round-trip, the OpenAPI document is valid, and public API contains no `any` or React Flow type.

- [ ] **Step 5: Commit**

```bash
git add packages/contracts apps/api/src/platform/openapi.ts apps/api/src/platform/openapi.test.ts
git commit -m "feat: define stable platform contracts"
```

---

### Task 05: 画布契约、命令与完整 NodeKind

**Files:**
- Create: `packages/contracts/src/canvas.ts`, `packages/contracts/src/canvas.contract.test.ts`
- Modify: `packages/contracts/src/index.ts`
- Modify: `packages/test-kit/src/canvas.ts`, `packages/test-kit/src/index.ts`
- Create: `packages/test-kit/src/canvas.contract.test.ts`

**Interfaces:** Produces `CanvasSnapshotSchema`, discriminated `ResourceRef`, `CanvasCommand`, `NodeKind`, ports, edge kinds and renderer-neutral viewport types.

```ts
export type ResourceRef =
  | { kind: ResourceKind; id: string; follow: "pinned"; versionId: string }
  | { kind: ResourceKind; id: string; follow: "latest" };
export type CanvasCommand =
  | { type: "node.add"; operationId: string; node: CanvasNode }
  | { type: "node.move"; operationId: string; positions: Readonly<Record<NodeId, Point>> }
  | { type: "node.configure"; operationId: string; nodeId: NodeId; patch: unknown }
  | { type: "node.remove"; operationId: string; nodeIds: readonly NodeId[] }
  | { type: "edge.connect"; operationId: string; edge: CanvasEdge }
  | { type: "edge.disconnect"; operationId: string; edgeId: EdgeId }
  | { type: "group.set"; operationId: string; parentId: NodeId; childIds: readonly NodeId[] }
  | { type: "projection.upsert"; operationId: string; node: CanvasNode };
```

`NodeKind` exactly covers script, scene, shot, character, location, prop, style, asset-input, image-generation, video-generation, voice-generation, audio, caption, timeline-output, export, review-gate, frame, note and unknown. Reference edges require `bindingId`; domain-backed node data cannot contain editable domain fields.

**Integration Gate:** `C/T` Modify; `D/A/W/R/G/M/Q` N/A because registry/rendering begins in Tasks 06/17.

- [ ] **Step 1: Write contract and round-trip tests**

Assert pinned refs require versionId, latest refs reject it, unknown nodes preserve raw JSON, reference edge without bindingId fails, every command round-trips JSON without losing operationId, and production CanvasSnapshot is structurally assignable to Task 03 `TestCanvasSnapshot` in both directions.

- [ ] **Step 2: Run RED**

Run: `pnpm --filter @comic-canvas/contracts test -- canvas.contract.test.ts`<br>
Expected: FAIL because `CanvasCommandSchema` is not exported.

- [ ] **Step 3: Implement exact schemas and migration envelope**

Define finite coordinate/size bounds, schemaVersion, stable IDs, ports/cardinality, `editLocked`, relative child positions and `CanvasSnapshot {schemaVersion,nodes,edges,meta}`; keep node-specific config as validated unknown until Task 06.

- [ ] **Step 4: Verify schema fixtures**

Run: `pnpm --filter @comic-canvas/contracts test -- canvas.contract.test.ts && pnpm --filter @comic-canvas/test-kit test -- canvas.contract.test.ts`<br>
Expected: all round trips pass and the test kit builds explicit node fixtures without missing-node false positives.

- [ ] **Step 5: Commit**

```bash
git add packages/contracts packages/test-kit/src/canvas.ts packages/test-kit/src/index.ts packages/test-kit/src/canvas.contract.test.ts
git commit -m "feat: define renderer neutral canvas commands"
```

---

### Task 06: 节点目录、图校验与迁移

**Files:**
- Create: `packages/canvas-core/src/node-definitions/content.ts`, `packages/canvas-core/src/node-definitions/bibles.ts`, `packages/canvas-core/src/node-definitions/media.ts`, `packages/canvas-core/src/node-definitions/audio.ts`, `packages/canvas-core/src/node-definitions/composition.ts`, `packages/canvas-core/src/node-definitions/auxiliary.ts`
- Create: `packages/canvas-core/src/node-registry.ts`, `packages/canvas-core/src/graph-validator.ts`, `packages/canvas-core/src/migrations.ts`
- Create: `packages/canvas-core/src/node-registry.test.ts`, `packages/canvas-core/src/graph-validator.test.ts`, `packages/canvas-core/src/graph-validator.property.test.ts`
- Modify: `packages/canvas-core/src/index.ts`
- Modify: `packages/test-kit/src/canvas.ts`, `packages/test-kit/src/index.ts`

**Interfaces:** Produces `createNodeRegistry()`, `validateGraph(snapshot, registry)`, `migrateCanvas(snapshot)` and `getExecutionOrder(snapshot)`.

**Integration Gate:** `T` Modify canvas helpers; `C` N/A because Task 05 already owns the unchanged contracts; `D/A/W/R/G/M/Q` N/A.

- [ ] **Step 1: Write completeness and property tests**

Assert each non-unknown NodeKind has schema/default size/typed ports/migration; data-edge cycles, incompatible types and second edge into a single input fail with distinct codes; reference cycles pass; 1000 random DAGs return stable topological order.

- [ ] **Step 2: Run RED**

Run: `pnpm --filter @comic-canvas/canvas-core test -- node-registry.test.ts graph-validator.test.ts`<br>
Expected: FAIL reporting every NodeKind as unregistered.

- [ ] **Step 3: Implement focused definitions and validators**

One file per NodeKind family; no definition imports React. `unknown` is read-only and lossless. Migration is deterministic/idempotent and never invents domain resource IDs. Port mismatch, missing required input, broken edge and DAG cycle remain separate diagnostics.

- [ ] **Step 4: Verify unit and property suites**

Run: `pnpm --filter @comic-canvas/canvas-core test && pnpm --filter @comic-canvas/canvas-core typecheck`<br>
Expected: exactly 18 non-unknown kinds are registered and `unknown` remains the separate lossless fallback, 1000 property runs pass, migration twice equals migration once.

- [ ] **Step 5: Commit**

```bash
git add packages/canvas-core packages/test-kit/src/canvas.ts packages/test-kit/src/index.ts
git commit -m "feat: add complete canvas node registry"
```

---

### Task 07: PostgreSQL、runtime roles 与强制 RLS

**Files:**
- Create: `packages/db/src/client.ts`, `packages/db/src/verified-scope.ts`, `packages/db/src/http-scope.ts`, `packages/db/src/tenant-context.ts`, `packages/db/src/migrator.ts`, `packages/db/src/schema/identity.ts`
- Create: `packages/db/migrations/0001_identity.sql`
- Create: `packages/db/test/rls.integration.test.ts`, `packages/db/test/migration.integration.test.ts`, `packages/db/test/tenant-references.integration.test.ts`, `packages/db/test/security-owner.integration.test.ts`, `packages/db/test/scope-boundary.test.ts`
- Modify: `packages/db/src/schema/index.ts`
- Modify: `packages/db/src/index.ts`
- Modify: `infra/docker/postgres/init-roles.sql`, `packages/test-kit/src/db.ts`, `packages/test-kit/src/index.ts`

**Interfaces:** Produces opaque `VerifiedTenantScope` and its narrower `VerifiedProjectScope`, neither constructor/brand exported; `bootstrapHttpTenantScope(db,{issuer,subject,verifiedTenantClaim,requestId}): Promise<VerifiedTenantScope>` after OIDC verification+tenant membership+beta gate; `bootstrapHttpProjectScope(db,tenantScope,projectId,requestId): Promise<VerifiedProjectScope>` after Project membership; `withTenantTransaction(db,tenantScope,fn)` and `withProjectTransaction(db,projectScope,fn)` with no raw-ID overload. It also produces migrator plus five distinct runtime connection factories, immutable tenant-column helpers, persistent/audited `beta_access_entries`, and `assertTenantScopedForeignKeys(schema)` for every later migration test. Task 09/13/25 add Work Event、Canvas 与 verified-provider bootstrap wrappers that return `VerifiedProjectScope`.

**Integration Gate:** `D` Modify exports identity schema; `T` Modify DB context; `A/W/R/G/M/C/Q` N/A.

- [ ] **Step 1: Write isolation/schema introspection tests and create legal comment-only `0001`**

Create two tenants as migrator, then assert API/Collab/Dispatcher/Generation Worker/Media Worker cannot read or write tenant tables without a verified scope, cannot access the other tenant, do not own tables and have `rolbypassrls=false`; introspect every table containing `tenant_id` for both `relrowsecurity` and `relforcerowsecurity`. Verified OIDC subject+tenant membership can list/create its first Project before a projectId exists; spoofed tenant claim and missing tenant membership fail. A tenant scope cannot call a project-only repository; after Project membership bootstrap, the project scope can access exactly that Project. Attempt to update tenant_id or insert a same-tenant row whose referenced ID belongs to the other tenant and require a database constraint failure. Prove `comic_security_owner` is `NOLOGIN NOINHERIT BYPASSRLS`, no LOGIN role can inherit or `SET ROLE` to it, it owns no schema/table, every owned function has empty safe search path/full qualification/`PUBLIC` revoked/minimal ACL/audit. Compile negative fixtures that pass raw strings/structurally similar objects or the wrong scope brand to either transaction helper, and scan all TypeScript for direct `SET LOCAL app.tenant_id/app.project_id` outside the one context module.

- [ ] **Step 2: Run RED**

Run: `pnpm --filter @comic-canvas/db test:migration -- 0001_identity.sql`<br>
Expected: the comment-only migration loads, then FAILS `IDENTITY_TABLE_MISSING`; it must not fail because the numbered file or runtime-role fixture is absent.

- [ ] **Step 3: Implement roles, migration and transaction context**

`comic_migrator` owns schema; `comic_api`, `comic_collab`, `comic_dispatcher`, `comic_generation_worker`, `comic_media_worker` are LOGIN/NOINHERIT/NOBYPASSRLS non-owners, while `comic_security_owner` is NOLOGIN/NOINHERIT/BYPASSRLS, cannot be granted to a LOGIN role and owns only narrow functions. Migration 0001 creates audited `bootstrap_http_tenant_scope(issuer,subject,verifiedTenantClaim,requestId)` and `bootstrap_http_project_scope(tenantScopeNonce,projectId,requestId)` with empty search path, full qualification, bounded returns and `PUBLIC` revoked; only `comic_api` may execute them. Tenant bootstrap verifies subject membership/beta state, while project bootstrap verifies the tenant scope nonce and current Project membership; invalid issuer/subject/tenant/project returns no scope. TypeScript wrappers alone convert returned rows/nonces to module-private brands. Tables tenants/users/memberships/project_memberships/project_policies/beta_access_entries include UUID PKs, `UNIQUE(tenant_id,id)`, immutable tenant IDs, revisions and timestamps; every tenant FK is composite, and policies use `current_setting('app.tenant_id', true)` and reject null context. Beta entries store subject hash, state, inviter, reason, expiry and append-only audit. Dispatcher has no blanket table SELECT; cross-tenant work is available only through Task 09's audited claim function.

- [ ] **Step 4: Verify clean and upgrade paths**

Run: `pnpm --filter @comic-canvas/db test:migration -- 0001_identity.sql && pnpm --filter @comic-canvas/db test -- rls.integration.test.ts security-owner.integration.test.ts scope-boundary.test.ts`<br>
Expected: clean/upgrade PASS; all five runtime roles are least privilege, security owner cannot login/inherit/own business objects, bootstrap positive/negative/ACL cases pass, raw scope construction and stray `SET LOCAL` count are 0, every unauthorized or cross-tenant-reference case is denied, immutable tenant IDs cannot move, and every authorized same-tenant case passes.

- [ ] **Step 5: Commit**

```bash
git add packages/db infra/docker/postgres packages/test-kit/src/db.ts packages/test-kit/src/index.ts
git commit -m "feat: enforce tenant isolation at database boundary"
```

---

### Task 08: OIDC 与项目级能力授权

**Files:**
- Create: `apps/api/src/auth/auth.module.ts`, `apps/api/src/auth/oidc.guard.ts`, `apps/api/src/auth/beta-access.guard.ts`, `apps/api/src/auth/beta-access.service.ts`, `apps/api/src/auth/principal.decorator.ts`, `apps/api/src/auth/authorization.service.ts`, `apps/api/src/auth/authorization.service.test.ts`, `apps/api/src/auth/beta-access.e2e-spec.ts`
- Modify: `apps/api/src/app.module.ts`
- Modify: `packages/contracts/src/auth.ts`, `packages/contracts/src/index.ts`

**Interfaces:** Produces `authorize(principal, projectScope: VerifiedProjectScope, capability, projectPolicy): Promise<AuthorizationDecision>`, tenant/project scoped guards and global invitation gate; Principal contains verified OIDC identity only, never an unverified tenant/project role. Tenant-level list/create first obtains `VerifiedTenantScope`; project routes narrow it to `VerifiedProjectScope`. In `allowlist` mode, only health/OIDC callback remain public and a valid, unexpired persisted entry is required before product routes.

**Integration Gate:** `C` Modify decision DTO; `A` Modify register AuthModule globally; `D` N/A because it consumes Task 07 schema without a new migration; `W/R/G/M/T/Q` N/A.

- [ ] **Step 1: Write the 5 roles x 20 capabilities x policy matrix test**

Iterate the exact 20-value Capability schema from Task 04. Assert Editor generation/approval/snapshot restore/rights changes and Viewer export change only through the named project policy, Generator does not inherit Editor, Commenter cannot select, Owner has every capability, and a valid tenant principal with no membership in this Project is denied for all 20 even when they belong to the same tenant.

- [ ] **Step 2: Run RED**

Run: `pnpm --filter @comic-canvas/api test -- authorization.service.test.ts`<br>
Expected: FAIL because `AuthorizationService` is absent.

- [ ] **Step 3: Implement JWKS validation and capability evaluation**

Validate issuer/audience/expiry/key rotation, then call Task 07 tenant bootstrap using only verified claims and apply `BETA_ACCESS_MODE` before product authorization. Tenant routes keep `VerifiedTenantScope`; project guards call project bootstrap and pass `VerifiedProjectScope` to repositories/capability evaluation. Return allow/deny reason and matched policy revision. Allowlist grants/revocations are audited server-side and take effect on the next request/stream reconnect. No `ROLE_RANK`, numeric comparison, body/path tenant authority or token-supplied project role is allowed.

- [ ] **Step 4: Verify authorization boundaries**

Run: `pnpm --filter @comic-canvas/api test -- authorization.service.test.ts && pnpm --filter @comic-canvas/api test:e2e -- beta-access.e2e-spec.ts && pnpm --filter @comic-canvas/db test -- rls.integration.test.ts scope-boundary.test.ts`<br>
Expected: all 100 role/capability cells, same-tenant/no-membership, revoked membership/token and off/allowlist/open mode cases pass; revoked/expired invite is denied and audited.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/auth apps/api/src/app.module.ts packages/contracts/src/auth.ts packages/contracts/src/index.ts
git commit -m "feat: authorize project capabilities from memberships"
```

---

### Task 09: 通用写幂等、审计与 trace 错误

**Files:**
- Create: `packages/db/src/schema/idempotency.ts`, `packages/db/src/schema/audit.ts`, `packages/db/src/schema/analytics.ts`, `packages/db/src/schema/outbox.ts`, `packages/db/migrations/0002_idempotency_audit.sql`
- Modify: `packages/db/src/schema/index.ts`
- Create: `packages/db/src/command-transaction.ts`, `packages/db/src/idempotent-command.ts`, `packages/db/test/outbox-claim.integration.test.ts`
- Create: `packages/db/src/work-event-scope.ts`, `packages/db/src/outbox-repair.ts`, `packages/db/test/outbox-repair.integration.test.ts`, `packages/db/test/work-event-scope.integration.test.ts`
- Modify: `packages/db/src/index.ts`
- Create: `packages/queue/src/outbox-dispatcher.ts`, `packages/queue/src/consumer-receipt.ts`, `packages/queue/src/outbox.integration.test.ts`
- Create: `packages/queue/src/outbox-reconciler.ts`, `packages/queue/src/outbox-reconciler.integration.test.ts`
- Modify: `packages/queue/src/index.ts`
- Modify: `apps/worker-generation/src/dispatcher-main.ts`
- Create: `apps/worker-generation/src/dispatcher-main.test.ts`
- Create: `apps/api/src/platform/idempotency.interceptor.ts`, `apps/api/src/platform/trace.interceptor.ts`, `apps/api/src/platform/api-error.filter.ts`, `apps/api/src/platform/idempotency.e2e-spec.ts`, `apps/api/src/platform/command-crash.e2e-spec.ts`
- Modify: `apps/api/src/app.module.ts`
- Create: `scripts/requeue-outbox.mjs`, `docs/runbooks/outbox-dead-letter-repair.md`

**Interfaces:** Produces `runIdempotentCommand(context, requestFingerprint, handler)` backed by one AsyncLocalStorage PostgreSQL transaction; persisted replay keyed by `(tenantId, actorId, operation, key)`; generic `OutboxEvent`, separate broker-publish state and permanent terminal `ConsumerReceipt`; `claim_outbox(maxRows,claimant,leaseMs)`, `renew_outbox_lease`, `mark_outbox_published`, `bootstrapWorkEvent(eventId,expectedConsumer,expectedRoute,payloadHash): Promise<{scope:VerifiedProjectScope,subject:WorkSubject}>`, and audited `requeue_outbox(eventId,expectedAttempt,reason)`; a bootable Dispatcher entrypoint from Task 02's Generation image that uses only `comic_dispatcher`/Redis credentials; and `ApiErrorEnvelope` with traceId. BullMQ payload is exactly `{eventId,route,payloadHash}`.

**Integration Gate:** `D/A/Q` Modify; Dispatcher entrypoint changes outside the fixed-point catalog and receives deployment smoke coverage; `C` N/A because it consumes Task 04's unchanged envelope; `W/R/G/M/T` N/A because feature producers/consumers register later.

- [ ] **Step 1: Write replay/schema introspection tests and create legal comment-only `0002`**

The same key/semantic request returns byte-equivalent status/body without a second mutation; same key with changed path param, sorted semantic query or canonical body returns 409 `IDEMPOTENCY_PAYLOAD_MISMATCH`; reordered JSON keys and reordered non-semantic headers match. Twenty concurrent requests produce one mutation. Inject a crash after business row+Outbox effect but before HTTP write and assert replay returns the committed response with exactly one effect. Error responses never include provider details.

Run two Dispatchers against pending work and require a single valid lease owner; kill it before publish, after broker send/before ACK and after ACK. Expired lease is reclaimed, non-owner heartbeat/ACK is rejected, retry uses bounded exponential backoff+jitter, and max attempts enters `dead_letter` without a terminal receipt. Broker `published` never satisfies a consumer-effect assertion. Delete the Redis job after published ACK: reconciler republishes the same eventId and one downstream receipt/effect results. Queue payload injection of tenant/project/subject is ignored/rejected; only correct expected consumer/route/payloadHash can bootstrap a `VerifiedProjectScope`. Exercise audited repair with correct and stale `expectedAttempt`; the correct repair preserves eventId/payload hash and appends one repair record, while stale/missing reason/unauthorized caller changes nothing.

- [ ] **Step 2: Run RED**

Run: `pnpm --filter @comic-canvas/db test:migration -- 0002_idempotency_audit.sql`<br>
Expected: the comment-only migration loads, then FAILS `IDEMPOTENCY_TABLE_MISSING`; the target file and migration runner already exist.

- [ ] **Step 3: Implement request hashing and append-only audit**

Hash stable operation ID, normalized path params, sorted semantic query and RFC 8785-style canonical body; method is retained as diagnostic input. The interceptor opens `runIdempotentCommand`, and every repository, audit write and Outbox producer resolves the same AsyncLocalStorage transaction. It locks/inserts the key row, executes the handler, persists status/allowlisted headers/canonical body and commits once; no response is stored after a separate business commit. Audit records actor/object/action/version/request IP class and traceId with server time; prompt/media/user text are excluded.

Migration 0002 also creates tenant-scoped `outbox_events`, append-only broker-attempt/repair records, permanent `consumer_receipts` and privacy-minimized `analytics_events/analytics_daily_aggregates` reserved for Task 47. Its state distinguishes `pending/claimed/published/dead_letter/terminal`, with claim token, `leaseUntil`, `attemptCount`, `nextAttemptAt`, broker identity and immutable payload hash. `comic_security_owner` owns narrow `claim_outbox`/renew/published/terminal/bootstrap/requeue SECURITY DEFINER functions with empty `search_path`, fully qualified names, hard row/lease limits, expected-state CAS, minimal returns and append-only audits. `claim_outbox` selects pending/due or expired-lease work using `SKIP LOCKED`; only `comic_dispatcher` executes claim/renew/published, while non-runtime `comic_operations` executes requeue. `comic_collab`、`comic_generation_worker`、`comic_media_worker` and, only for registered analytics routes, `comic_api` may execute `bootstrap_work_event`; it derives the permitted consumer/route from `current_user`, also checks expectedConsumer/expectedRoute/hash, and cannot bootstrap another process's route. Dispatcher cannot execute it. Direct cross-tenant table reads remain denied. The wrapper returns the opaque source row needed by `work-event-scope.ts`; no application caller can manufacture the brand.

Dispatcher sends only `{eventId,route,payloadHash}`, records broker ACK as `published`, and never writes a terminal receipt. Target Consumer bootstraps scope. A PostgreSQL-co-located effect commits its business mutation, unique `(consumerName,eventId)` receipt and terminal CAS atomically. A Yjs/object-store/provider/two-phase effect first persists a durable idempotency marker plus recovery state, then writes receipt+terminal after verification; replay recognizes that marker and completes recovery without repeating the external effect. `outbox-reconciler` handles expired claims and published-without-receipt records; it verifies BullMQ state and republishes missing jobs with the same eventId. Dead-letter remains nonterminal and retains evidence. `scripts/requeue-outbox.mjs` requires explicit eventId/expectedAttempt/reason, defaults to dry-run, uses a short-lived Operations credential and prints an audit ID; the runbook requires root-cause and idempotency checks. `dispatcher-main` starts the bounded claim/deliver/reconcile loop, exposes Task 02 health, drains leases on SIGTERM and fails startup if any API, provider, KMS or migrator credential is present.

- [ ] **Step 4: Verify migration and API concurrency**

Run: `pnpm --filter @comic-canvas/db test:migration -- 0002_idempotency_audit.sql && pnpm --filter @comic-canvas/db test -- outbox-claim.integration.test.ts outbox-repair.integration.test.ts work-event-scope.integration.test.ts && pnpm --filter @comic-canvas/queue test -- outbox.integration.test.ts outbox-reconciler.integration.test.ts && pnpm --filter @comic-canvas/worker-generation test -- dispatcher-main.test.ts && pnpm --filter @comic-canvas/api test:e2e -- idempotency.e2e-spec.ts command-crash.e2e-spec.ts`<br>
Expected: PASS with one mutation/Outbox event across 20 concurrent duplicates and the crash replay; deterministic 409 for every semantic mismatch; two Dispatchers never hold the same valid lease; expired claims and lost Redis jobs recover; `published` without receipt stays nonterminal; dead-letter repair is audited/CAS-safe; opaque-envelope bootstrap rejects every spoofed scope; the separate Dispatcher drains cleanly while API/Workers cannot scan tenants; consumer effects remain one.

- [ ] **Step 5: Commit**

```bash
git add packages/db packages/queue apps/api/src/platform apps/api/src/app.module.ts apps/worker-generation/src/dispatcher-main.ts apps/worker-generation/src/dispatcher-main.test.ts scripts/requeue-outbox.mjs docs/runbooks/outbox-dead-letter-repair.md
git commit -m "feat: persist idempotent writes and audit traces"
```

---

### Task 10: Project、Episode 与受限 Canvas session

**Files:**
- Create: `packages/contracts/src/projects.ts`, `packages/contracts/src/projects.contract.test.ts`
- Create: `packages/contracts/src/narrative.ts`, `packages/contracts/src/narrative.contract.test.ts`
- Modify: `packages/contracts/src/index.ts`
- Create: `packages/db/src/schema/projects.ts`, `packages/db/src/schema/narrative.ts`, `packages/db/migrations/0003_projects.sql`
- Modify: `packages/db/src/schema/index.ts`
- Create: `apps/api/src/projects/projects.module.ts`, `apps/api/src/projects/projects.controller.ts`, `apps/api/src/projects/projects.service.ts`, `apps/api/src/projects/episode-content.service.ts`, `apps/api/src/projects/episode-copy-matrix.ts`, `apps/api/src/projects/episode-lifecycle.registry.ts`, `apps/api/src/projects/projects.e2e-spec.ts`, `apps/api/src/projects/episode-copy.e2e-spec.ts`
- Create: `apps/api/src/narrative/narrative.module.ts`, `apps/api/src/narrative/scripts.controller.ts`, `apps/api/src/narrative/scripts.service.ts`, `apps/api/src/narrative/script-revision.service.ts`, `apps/api/src/narrative/narrative.e2e-spec.ts`
- Create: `apps/api/src/projects/canvas-session-signer.ts`, `apps/api/src/projects/canvas-session-signer.test.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:** Produces create/list/get project; create/copy-preview/copy/rename/archive/restore Episode; exactly one `Script` aggregate per Episode; immutable source/revisions and stable Scene/Beat/Shot/Line identities; `GET /v1/episodes/:episodeId/script`, `PUT /v1/scripts/:scriptId`, revision list/read/restore APIs with ETag and head CAS; API-process `EpisodeCopyContributor` and database-backed `EpisodeArchiveBlocker` registries plus an exhaustive copy-policy catalog; and `POST /v1/canvases/:id/session` returning a short asymmetric token, role capabilities, schemaVersion and readOnly. `CanvasSessionSigner.sign({canvasId,tenantId,userId,capabilities,sessionRevision})` exposes only a public rotation JWKS to Collab. Later modules register explicit copy/blocker contributors; no Worker-process in-memory registry is valid.

**Integration Gate:** `C/D/A` Modify; `W` N/A because WorkspaceShell is Task 15; `R/G/M/T/Q` N/A.

- [ ] **Step 1: Write lifecycle/schema introspection tests and create legal comment-only `0003`**

Project creation atomically creates one Episode/Canvas/Timeline header and one Script with initial ScriptRevision. Import preserves exact UTF-8 source bytes/hash; structured command batches preserve unaffected stable IDs, append one revision and advance only `scripts.headRevisionId`. Save/restore require `Idempotency-Key + expectedHeadRevisionId + operationId`; two clients on one head allow one CAS winner, and stale write returns base/head/local merge data with zero partial rows. Revision history/read returns immutable canonical hashes and source provenance.

Episode copy preview freezes source Episode/Script/Canvas/Timeline heads and a canonical preview hash. Its complete catalog asserts: Script/Scene/Beat/Shot/Line and all Episode-local settings get new IDs plus a full old-to-new map; project-level Asset/Bible resources reuse exact pinned versions without copying bytes or approvals; Canvas/Timeline contributors remap local IDs and preserve canonical project refs; Job/Attempt/Batch/progress/UsageReservation/Ledger/Selection/Approval/Comment/ReviewRequest/Decision/Issue/share/audit are excluded. Any uncataloged table or missing required contributor fails closed. Confirmation with changed head/hash returns 409 and writes no partial copy. A database-backed test blocker prevents archive; Viewer session is read-only and scoped to one Canvas. Session tests reject algorithm confusion, unknown/retired `kid`, wrong issuer/audience/canvas, expired token, capability escalation and a private key readable by Collab.

- [ ] **Step 2: Run RED**

Run: `pnpm --filter @comic-canvas/db test:migration -- 0003_projects.sql`<br>
Expected: the comment-only migration loads, then FAILS `PROJECT_TABLE_MISSING`; no failure comes from a missing migration file.

- [ ] **Step 3: Implement revisioned lifecycle APIs**

Use capability guards and verified scope before the shared command transaction: project list/create use `bootstrapHttpTenantScope`, create atomically grants the creator Owner membership, and every route with a project/Episode/Canvas/Script resource resolves `bootstrapHttpProjectScope` before repository access. Soft archive, expected-head CAS, audit and lifecycle registries operate only on `VerifiedProjectScope`; no controller/repository accepts a raw tenant/project scope from path/body/token claims. Migration 0003 creates Project/Episode/Canvas, Timeline header, Script/immutable ScriptSource/immutable ScriptRevision, stable Scene/Beat/Shot/Line identities and immutable per-revision memberships/field versions with composite tenant foreign keys; Script head is the only mutable pointer and every history row is append-only/content-hashed. Task 30 adds AI parse proposal/diff records and the full editor, while Timeline content revisions still start in 0015. `PUT` accepts only a validated structured command batch, never a client-supplied replacement aggregate; read/save/history/restore use explicit Zod/OpenAPI contracts and revision ETags. Copy executes the catalog under one project fence, generates deterministic UUIDv5-style remaps from copy operationId+old ID, stages every contributor result and activates only after the source-head/preview-hash CAS.

Session JWT is 5 minutes, issuer/environment and audience `collab`, signed with an allowlisted asymmetric algorithm and active `kid`, includes canvas/tenant/user/capabilities/sessionRevision only and cannot authorize HTTP APIs. API reads its rotated private JWK from a secret file; Collab receives only current/overlap public JWKS, and retirement waits longer than maximum token lifetime.

- [ ] **Step 4: Verify API, RLS and registration smoke**

Run: `pnpm --filter @comic-canvas/db test:migration -- 0003_projects.sql && pnpm --filter @comic-canvas/contracts test -- projects.contract.test.ts narrative.contract.test.ts && pnpm --filter @comic-canvas/api test:e2e -- projects.e2e-spec.ts episode-copy.e2e-spec.ts narrative.e2e-spec.ts`<br>
Expected: lifecycle and full Script read/save/history/restore PASS; two-client Script CAS has one winner and immutable history; explicit copy contributors execute once, every policy row is cataloged, exact project refs reuse while Episode IDs remap, changed source head or missing contributor aborts with no partial copy, denylisted rows copy 0; same-tenant/no-project-membership and cross-project escalation are denied; session signature/scope/rotation cases pass with zero private-key exposure; OpenAPI contains every route with capability metadata.

- [ ] **Step 5: Commit**

```bash
git add packages/contracts packages/db apps/api/src/projects apps/api/src/narrative apps/api/src/app.module.ts
git commit -m "feat: add scoped project and episode lifecycle"
```

---

### Task 11: Rights、Moderation、ApprovalGate policy 与入口安全

**Files:**
- Create: `packages/contracts/src/governance.ts`, `packages/contracts/src/governance.contract.test.ts`
- Modify: `packages/contracts/src/index.ts`
- Create: `packages/db/src/schema/governance.ts`, `packages/db/migrations/0004_rights_moderation.sql`
- Modify: `packages/db/src/schema/index.ts`
- Create: `packages/storage/src/safe-fetch.ts`, `packages/storage/src/safe-fetch.test.ts`
- Modify: `packages/storage/src/index.ts`
- Create: `apps/api/src/governance/governance.module.ts`, `apps/api/src/governance/rights.controller.ts`, `apps/api/src/governance/moderation.controller.ts`, `apps/api/src/governance/rights.service.ts`, `apps/api/src/governance/moderation.gateway.ts`, `apps/api/src/governance/approval-gate-policy.service.ts`, `apps/api/src/governance/safe-fetch.service.ts`, `apps/api/src/governance/governance.e2e-spec.ts`
- Modify: `apps/api/src/app.module.ts`, `apps/api/src/main.ts`
- Create: `apps/web/src/governance/rights-record-editor.tsx`, `apps/web/src/governance/moderation-status.tsx`, `apps/web/src/governance/approval-gate-policy.tsx`
- Create: `apps/web/src/governance/governance.test.tsx`
- Modify: `apps/web/src/app/router.tsx`

**Interfaces:** Produces immutable `RightsRecord`, input/output `ModerationRecord`, versioned `ApprovalGatePolicy`, versioned `AiDisclosurePolicy {targetProfile,visibleOverlay,machineReadableMetadata,sidecar,labelText,fontVersionId,placement,timeRange}`, shared Media-only `safeFetchToQuarantine(request,sink): Promise<SafeFetchResult>`, API-side `validateRemoteIngestRequest` that performs no network I/O, and capability-protected waiver records. Project, uploaded asset, font, music/SFX and provider output can all reach an explicit rights/moderation/provenance decision through API or registered Media workflow.

**Integration Gate:** `C/D/A/W` Modify; `M/Q` N/A until Task 22 registers output-moderation work; `R/G/T` N/A.

- [ ] **Step 1: Write governance/schema introspection tests and create legal comment-only `0004`**

Assert paid generation/export cannot pass without required rights, moderation and AI-disclosure decisions; waiver cannot cover statutory rights or mandatory disclosure gaps. A target profile with generated material must resolve one immutable policy whose visible/machine-readable/sidecar requirements, exact Chinese label, licensed font version, safe placement and time range match Task 00 legal evidence. Rights/disclosure CRUD requires `rights:manage` and denies a same-tenant user without Project membership. The SafeFetch client/proxy contract rejects loopback/private/link-local/metadata IPs, DNS rebinding between validation and connect, redirect to private/rebound IP, non-HTTP protocols, TLS host mismatch and oversized responses; proxy revalidates every redirect, connects the exact resolved IP with original-host SNI, and refuses caller-supplied pin overrides. API remote-ingest validation opens zero sockets and stores no fetched bytes; Task 22/26 Media callers execute the shared fetch only through the Task 02 mTLS SafeFetch proxy.

- [ ] **Step 2: Run RED**

Run: `pnpm --filter @comic-canvas/db test:migration -- 0004_rights_moderation.sql`<br>
Expected: the comment-only migration loads, then FAILS `RIGHTS_TABLE_MISSING`; the failure is not a missing file or test suite.

- [ ] **Step 3: Implement immutable decisions and HTTP security baseline**

Store subject/version/policy/checker/evidence hash/decision/reason/actor/time; changes append a new record. Rights controller and work-surface editor capture owner/license/territory/expiry/source evidence for project inputs, assets, fonts and music/SFX; moderation controller exposes status/evidence without leaking provider payload. The same governance UI selects only signed target-profile disclosure policies and previews the exact mandatory overlay; it cannot accept arbitrary label text or waive required metadata/sidecar. Generated AssetVersions carry immutable provenance. Add CSP, strict CORS, CSRF strategy, rate/budget guards and request-size limits. Shared SafeFetch pins resolved public addresses and streams through byte/time limits, but only Media Worker may invoke it in production. API validates/authenticates a remote-ingest request and later Tasks write opaque Media work; it neither resolves DNS nor downloads bytes.

- [ ] **Step 4: Verify policy and module registration**

Run: `pnpm --filter @comic-canvas/db test:migration -- 0004_rights_moderation.sql && pnpm --filter @comic-canvas/storage test -- safe-fetch.test.ts && pnpm --filter @comic-canvas/api test:e2e -- governance.e2e-spec.ts && pnpm --filter @comic-canvas/web test -- governance.test.tsx`<br>
Expected: all SSRF fixtures follow the same result in API/Worker harness, every rights subject and target disclosure policy can be completed/previewed through UI, mandatory disclosure is not waivable, same-tenant/no-membership is denied, gate reasons are stable, and OpenAPI/module/routes are registered.

- [ ] **Step 5: Commit**

```bash
git add packages/contracts packages/db packages/storage apps/api/src/governance apps/api/src/app.module.ts apps/api/src/main.ts apps/web/src/governance apps/web/src/app/router.tsx
git commit -m "feat: establish rights moderation and safety gates"
```

## Wave B：画布、协作与前端壳

### Task 12: Yjs 文档适配、origin 与本地撤销

**Files:**
- Create: `packages/canvas-collab-yjs/src/document.ts`, `packages/canvas-collab-yjs/src/commands.ts`, `packages/canvas-collab-yjs/src/origins.ts`, `packages/canvas-collab-yjs/src/snapshot.ts`, `packages/canvas-collab-yjs/src/migrations.ts`
- Create: `packages/canvas-collab-yjs/src/document.test.ts`, `packages/canvas-collab-yjs/src/convergence.property.test.ts`
- Modify: `packages/canvas-collab-yjs/src/index.ts`
- Modify: `packages/test-kit/src/yjs.ts`, `packages/test-kit/src/index.ts`

**Interfaces:** Produces `createCanvasYDoc`, `applyCanvasCommand(doc, command, origin)`, `readCanvasSnapshot`, `encodeDurableSnapshot` and local `UndoManager` factories.

**Integration Gate:** `T` Modify Yjs helpers; `C` N/A because its existing contract is consumed unchanged; `D/A/W/R/G/M/Q` N/A.

- [ ] **Step 1: Write convergence, origin and operation dedupe tests**

Two docs concurrently add/move/delete note and generation nodes, flush in both orders and converge byte-for-byte. Local A undo reverts only LOCAL_A, never REMOTE_B. Reapplying the same `projection.upsert.operationId` 100 times creates one node because `meta.appliedOperations` is written in the same Yjs transaction.

- [ ] **Step 2: Run RED**

Run: `pnpm --filter @comic-canvas/canvas-collab-yjs test -- document.test.ts`<br>
Expected: FAIL because `createCanvasYDoc` is absent.

- [ ] **Step 3: Implement maps, migrations and scoped undo**

Store nodes/edges/meta in separate Y.Maps by stable ID; viewport/awareness/job progress never enter the document. Domain-backed projection nodes expose `labelOverride` only; editing Shot title must not be representable by a CanvasCommand. One drag uses one capture boundary.

- [ ] **Step 4: Verify properties**

Run: `pnpm --filter @comic-canvas/canvas-collab-yjs test`<br>
Expected: 1000 randomized interleavings converge, duplicate operations remain one, migration is idempotent and local undo leaves remote edits intact.

- [ ] **Step 5: Commit**

```bash
git add packages/canvas-collab-yjs packages/test-kit/src/yjs.ts packages/test-kit/src/index.ts
git commit -m "feat: map canvas commands to convergent yjs docs"
```

---

### Task 13: Collab 鉴权、durable revision、投影与安全压缩

**Files:**
- Create: `packages/db/src/schema/canvas-collab.ts`, `packages/db/migrations/0005_canvas_collab.sql`
- Create: `packages/db/src/project-fence.ts`, `packages/db/src/canvas-scope.ts`, `packages/db/test/project-fence.integration.test.ts`, `packages/db/test/canvas-scope.integration.test.ts`
- Modify: `packages/db/src/schema/index.ts`, `packages/db/src/index.ts`
- Create: `packages/queue/src/canvas-projection-queue.ts`, `packages/queue/src/canvas-projection-queue.test.ts`
- Modify: `packages/queue/src/index.ts`
- Modify: `apps/collab/src/main.ts`
- Create: `apps/collab/src/auth.ts`, `apps/collab/src/persistence.ts`, `apps/collab/src/projection-consumer.ts`, `apps/collab/src/compactor.ts`, `apps/collab/src/flush-reader.ts`, `apps/collab/src/room-coordinator.ts`, `apps/collab/src/owner-rpc.ts`, `apps/collab/src/durable-notifications.ts`
- Create: `apps/collab/src/full-update-store.ts`, `apps/collab/src/active-revision-loader.ts`, `apps/collab/src/projection-finalizer.ts`
- Create: `apps/collab/test/persistence.integration.test.ts`, `apps/collab/test/projection-order.integration.test.ts`, `apps/collab/test/projection-crash.integration.test.ts`, `apps/collab/test/compaction.integration.test.ts`, `apps/collab/test/viewer-auth.integration.test.ts`, `apps/collab/test/two-replica-routing.integration.test.ts`, `apps/collab/test/room-failover.integration.test.ts`
- Create: `apps/api/src/canvas/canvas-reader.client.ts`
- Modify: `apps/api/src/app.module.ts`, `apps/api/src/projects/projects.service.ts`, `apps/api/src/projects/episode-content.service.ts`, `apps/api/src/projects/episode-lifecycle.registry.ts`, `apps/api/src/governance/rights.service.ts`, `apps/api/src/governance/moderation.gateway.ts`, `apps/api/src/governance/approval-gate-policy.service.ts`, `packages/test-kit/src/yjs.ts`, `packages/test-kit/src/index.ts`
- Modify: `infra/deploy/kubernetes/base/collab.yaml`, `infra/deploy/kubernetes/base/network-policies.yaml`, `infra/deploy/kubernetes/overlays/staging/patches.yaml`, `infra/deploy/kubernetes/overlays/production/patches.yaml`

**Interfaces:** Produces `withProjectWriteFence(projectScope: VerifiedProjectScope, fn)` for every domain write; `bootstrapCanvasScope(canvasId,sessionRevision,requestId): Promise<VerifiedProjectScope>`; dedicated epoch-qualified `canvas-projection` BullMQ route with opaque envelope; active Canvas `documentEpoch`, per-epoch projection counter and superseded-old-epoch receipt; Redis owner discovery plus separately PostgreSQL-fenced `{canvasId,ownerPodId,roomEpoch,leaseUntil}`; internal mTLS authenticated owner-routed `flushRead(canvasId,requestId) -> {activeCanvasRevisionId,documentEpoch,stateVector,updateHash,durableSeq,snapshot}`; `materializeFullUpdate(canvasId,durableSeq) -> {contentObjectId,sha256,bytes,stateVector,schemaVersion,documentEpoch}` whose bytes apply to an empty `Y.Doc`; staged Canvas revision APIs; active-revision loader; durable-append notification; and epoch-qualified projection receipt/watermark query. API gets `CanvasDocumentReader.readDurableRevision()`.

**Integration Gate:** `D` Modify; `A` Modify register internal CanvasReader and retrofit Project writers/copy contributor with shared project fence; `T` Modify crash harness; `Q` Modify register the dedicated projection queue/consumer route; Collab main and deployment Modify for owner coordination; `C/W/R/G/M` N/A.

- [ ] **Step 1: Write ordering/schema introspection tests and create legal comment-only `0005`**

Cover crash after Yjs projection marker durable commit but before receipt, crash after update row before ack, append competing with compaction, API read with unflushed edits, and 100 randomized commit schedules. Assert append and compactor share the same per-Canvas transaction advisory lock; committed update seq is contiguous; no lower seq commits after a higher seq. Deliver `(epoch,N+1)` before `(epoch,N)` and require N+1 to remain unacked until N arrives, then apply both in order. Dead-letter N, verify N+1/snapshot drain/finalization stay blocked, repair N through Task 09 and require ordered recovery. Increment document epoch, then deliver an old-epoch event and a new `(epoch+1,1)` event: old writes only superseded receipt, new applies without waiting for prior epoch gaps. Copy a source Canvas after N projections and prove target derived full update has a distinct documentEpoch, no source marker/sequence, and accepts target seq 1. Old resourceRevision/upsert cannot beat a newer revision/delete tombstone. Finalization removes only same-epoch markers whose durable receipt, terminal source Outbox and consumer watermark are all proven.

Start Collab A/B behind Task 02's real TLS Gateway/LB policy: connect the browser WebSocket through `/collab` to owner A, hold it beyond both owner lease and 120s while `<=20s` keepalives prevent idle closure, let B receive the BullMQ projection and an API `flushRead`, and require both to owner-route to A before ACK/response. Drain/kill A between accepted update and append, advance PostgreSQL roomEpoch and let B rebuild/take ownership; the public client reconnects through the Gateway, rejects every old-epoch append and proves exact state/hash. A negative rendered-policy fixture that drops upgrade or shortens idle timeout must fail before the live test. Send a spoofed queue tenant/project and a valid opaque envelope: only `bootstrap_work_event` plus `bootstrap_canvas_scope` may create scope. Collab rejects Task 10 session tokens with unknown/retired kid, algorithm mismatch, wrong issuer/audience/canvas or stale sessionRevision; it intersects token capabilities with current Project membership. Viewer receives full sync but document updates close with forbidden; revoked membership disconnects within 5 seconds. Internal flush rejects missing/wrong service identity and ignores caller-supplied tenantId.

- [ ] **Step 2: Run RED**

Run: `pnpm --filter @comic-canvas/db test:migration -- 0005_canvas_collab.sql`<br>
Expected: the comment-only migration loads, then FAILS `CANVAS_HEAD_TABLE_MISSING`; no failure comes from a missing migration or suite.

- [ ] **Step 3: Implement monotonic durability**

Migration 0005 creates `canvas_heads/updates/snapshots/document_epochs/projection_counters/room_epochs` and narrow security-owner `bootstrap_canvas_scope(canvasId,sessionRevision,requestId)`; only Collab and service-authenticated API-to-Collab flow may execute it, it returns minimal active tenant/project/canvas revision/documentEpoch data, and all null/stale/cross-scope/function-ACL cases are tested. `canvas_heads.next_seq` allocates bigint durable update seq only while holding the same transaction-scoped advisory lock used by append and compactor, and insert+counter advance commit together. Compactor under that lock reconstructs the contiguous prefix throughSeq, writes stateVector/updateHash/content-addressed full update, then deletes only that prefix in one transaction; append resumes after commit. Durable update seq and projection seq are distinct; projection counter/marker/watermark keys are `(canvasId,documentEpoch,projectionSeq)`.

`room-coordinator.ts` uses Redis only to discover/renew the owner and PostgreSQL `roomEpoch` as the durable fencing token; roomEpoch protects concurrent Pod ownership and is distinct from documentEpoch, which protects projection history across restore/copy. Non-owner WebSocket frames, dedicated projection queue events and flush RPCs traverse mTLS owner RPC; the receiver never confirms a local shadow document. Owner drain rejects new work, flushes every accepted update, publishes a durable notification, releases the lease and becomes unready; takeover increments roomEpoch under the Canvas lock and loads the active durable revision before readiness. `canvas_projection_counters` allocate contiguous projectionSeq inside each active documentEpoch in the domain transaction. Dispatcher publishes the dedicated Q route; consumer bootstraps the opaque work event, compares event/active documentEpoch, writes a superseded receipt for old epochs, rejects future epochs, and applies only current-epoch `nextProjectionSeq`; otherwise it leaves a gap unacked. One Yjs transaction CASes `(documentEpoch,lastResourceRevision,lastProjectionSeq)`, writes upsert/delete tombstone plus bounded `meta.appliedOperations[operationId]`. The marker update must durable-append before a permanent receipt is written. Reconciler verifies same-epoch marker/hash/receipt/source-Outbox-terminal/watermark before `dedupeFinalized`; dead-letter is never terminal and compactor prunes only finalized markers. `flushRead` authenticates API service identity, re-runs Canvas bootstrap, owner-routes, persists room updates and reconstructs/verifies the exact durableSeq/documentEpoch. Full-update objects are immutable and active rooms always load PostgreSQL `activeCanvasRevisionId`, never “latest object by time”. `auth.ts` verifies Task 10's public JWKS allowlist and claims, re-reads membership/sessionRevision through `VerifiedProjectScope` at connect, never widens the signed capability set, and subscribes to revocation events for bounded disconnect. Register the Canvas Episode-copy contributor: under fence it materializes the source full update, deterministically remaps Canvas-local IDs while preserving canonical project refs, strips projection markers/sequence/room metadata, assigns a new target documentEpoch with counter baseline 0, stages the derived target revision and never copies Job/progress/Approval/comment metadata. All Task 10/11 project-domain writes are retrofitted to shared project fence; future domain modules must call the helper.

- [ ] **Step 4: Verify migration, crashes and auth**

Run: `pnpm --filter @comic-canvas/db test:migration -- 0005_canvas_collab.sql && pnpm --filter @comic-canvas/db test -- project-fence.integration.test.ts canvas-scope.integration.test.ts && pnpm --filter @comic-canvas/queue test -- canvas-projection-queue.test.ts && pnpm --filter @comic-canvas/collab test`<br>
Expected: 100 randomized schedules lose 0 updates/projections, sequences are contiguous inside each documentEpoch, normal/dead-letter-repaired gaps are eventually applied, old document epochs never block/apply after activation, copied Canvas accepts target seq 1, tombstones never resurrect, markers stay bounded after finalization, full update restores an empty Y.Doc byte-equivalently, a public TLS-Gateway WebSocket survives the frozen keepalive window and reconnects across two-replica route+flush+drain failover with 0 accepted update lost and 100% stale room epochs rejected, bootstrap/service-auth negatives fail, Viewer writes are rejected and API sees the owner-flushed config.

- [ ] **Step 5: Commit**

```bash
git add packages/db packages/queue apps/collab apps/api/src/canvas apps/api/src/app.module.ts apps/api/src/projects apps/api/src/governance packages/test-kit/src/yjs.ts packages/test-kit/src/index.ts infra/deploy/kubernetes/base/collab.yaml infra/deploy/kubernetes/base/network-policies.yaml infra/deploy/kubernetes/overlays/staging/patches.yaml infra/deploy/kubernetes/overlays/production/patches.yaml
git commit -m "feat: persist durable and idempotent canvas revisions"
```

---

### Task 14: 离线画布、草稿、备份与付费意图

**Files:**
- Create: `apps/web/src/offline/indexed-db.ts`, `apps/web/src/offline/service-worker.ts`, `apps/web/src/offline/draft-store.ts`, `apps/web/src/offline/generation-intent-store.ts`, `apps/web/src/offline/backup.ts`, `apps/web/src/offline/reconnect-coordinator.ts`, `apps/web/src/offline/collab-provider.ts`
- Create: `apps/web/src/offline/offline.test.ts`
- Modify: `apps/web/src/main.tsx`, `apps/web/src/app/router.tsx`
- Create: `tests/e2e/specs/offline-recovery.spec.ts`

**Interfaces:** Produces local stores `canvasDocs`, `composerDrafts`, `generationIntents`, `recoveryMetadata`; `exportEncryptedBackup(passphrase) -> Blob` and transactional `preview/importEncryptedBackup`; and the real Hocuspocus/Yjs WebSocket provider using Task 10's scoped Canvas session token. Intent includes expiresAt, canvas/node/durable baseline and requested capability, never a confirmed price or Job ID.

**Integration Gate:** `W` Modify mount Service Worker/recovery route; `C/D/A/R/G/M/T/Q` N/A; generation submit callback is injected and implemented in Task 25.

- [ ] **Step 1: Write offline and permission-revocation tests**

Edit while offline, reload, recover exact text/Yjs update, export/import an encrypted backup, reconnect after price/input change and assert no submit occurs until new OIDC auth/Canvas session/flush/estimate/diff/confirmation. Wrong passphrase, one-bit ciphertext/header tamper, truncated file, schema downgrade and cross-tenant/project import all fail before an IndexedDB write; a valid import previews object counts/conflicts and commits all stores atomically. Two browser contexts connect through the real WebSocket provider; Viewer receives the same durable document but its write closes forbidden. Expired intent and revoked permission are retained only as local exportable drafts.

- [ ] **Step 2: Run RED**

Run: `pnpm --filter @comic-canvas/web test -- offline.test.ts`<br>
Expected: FAIL because `GenerationIntentStore` is absent.

- [ ] **Step 3: Implement versioned IndexedDB and reconnect state machine**

States are `offline-draft -> revalidating -> changed-awaiting-confirmation -> submitted | expired | unauthorized`. Autosave text every 2 seconds. The portable backup uses WebCrypto PBKDF2-HMAC-SHA-256 with 600,000 iterations, a random 16-byte salt and user passphrase to derive an AES-256-GCM key; each export uses a random 12-byte nonce and authenticates formatVersion/tenant/project/canvas/schema as AAD. The clear header contains only algorithm/version/KDF parameters and salt/nonce; ciphertext contains canonical manifest, full Yjs update, drafts/intents/recovery metadata and plaintext SHA-256. The passphrase/key is never persisted, tokens/provider payloads/signed URLs are excluded, and import decrypts to memory, verifies GCM/tag/schema/scope/checksum and shows a diff before one IndexedDB transaction. Service Worker caches only the application shell and immutable public assets.

- [ ] **Step 4: Verify unit and browser recovery**

Run: `pnpm --filter @comic-canvas/web test -- offline.test.ts && pnpm exec playwright test tests/e2e/specs/offline-recovery.spec.ts`<br>
Expected: zero confirmed characters lost, wrong/tampered/cross-scope backups write zero records, valid backup round-trips exact hashes atomically, no offline intent auto-submits, and restored document converges after reconnect.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/offline apps/web/src/main.tsx apps/web/src/app/router.tsx tests/e2e/specs/offline-recovery.spec.ts
git commit -m "feat: recover canvas drafts without offline charges"
```

---

### Task 15: UI tokens、WorkspaceShell 与响应式不变量

**Files:**
- Create: `packages/ui/src/tokens.css`, `packages/ui/src/button.tsx`, `packages/ui/src/icon-button.tsx`, `packages/ui/src/dialog.tsx`, `packages/ui/src/drawer.tsx`, `packages/ui/src/status.tsx`, `packages/ui/src/tooltip.tsx`
- Modify: `packages/ui/src/index.ts`
- Modify: `apps/web/src/app/router.tsx`
- Create: `apps/web/src/workspace/workspace-shell.tsx`, `apps/web/src/workspace/workspace-shell.css`, `apps/web/src/workspace/empty-state.tsx`, `apps/web/src/workspace/episode-selector.tsx`
- Create: `apps/web/src/workspace/workspace-mode.ts`, `apps/web/src/workspace/workspace-mode.test.ts`, `apps/web/src/workspace/work-rect.ts`, `apps/web/src/workspace/work-rect.test.ts`
- Create: `apps/web/src/auth/oidc-client.ts`, `apps/web/src/auth/auth-callback.tsx`, `apps/web/src/projects/project-home.tsx`, `apps/web/src/projects/project-create-dialog.tsx`, `apps/web/src/projects/project-list.tsx`
- Create: `apps/web/src/workspace/workspace-shell.test.tsx`, `tests/e2e/specs/workspace-responsive.spec.ts`

**Interfaces:** Produces OIDC authorization-code+PKCE login/callback/refresh/logout, authenticated `/projects` list/create home, edit routes `/projects/:projectId/episodes/:episodeId/{canvas|storyboard|timeline}`, review route `/projects/:projectId/episodes/:episodeId/review`, `resolveWorkspaceMode(route,capabilities): "edit"|"review"`, pure `computeWorkRect(layout): Rect`, and stable layout slots for toolbar/drawer/canvas/inspector/composer/task tray. CSS width/page zoom may reflow the resolved mode but may never change it.

**Integration Gate:** `W` Modify real routes; `C/D/A` N/A because their existing project APIs are consumed unchanged; `R/G/M/T/Q` N/A.

- [ ] **Step 1: Write bounding-box and state-matrix tests**

At 1440x900 both 280px/352px panels dock; 1280x720 only inspector docks at 320px; 1024x768 panels are mutually exclusive overlays. `workRect.x=toolRailWidth+leftDockWidth`, `y=topBarHeight`, `width=viewportWidth-x-rightDockWidth`, `height=viewportHeight-topBarHeight-collapsedComposerHeight`; only a rect `>=640x480` permits canvas+dock simultaneous interaction. Composer width equals `min(840, workRect.width-32)` and expanded max height is `min(360,40vh,viewportHeight-topBarHeight-480-32)`; below 160px it becomes a full-screen inert-background view. Task tray overlap area is 0. Dock change keeps selected content inside workRect with 16px margin without changing zoom or shared Yjs viewport.

The same `/canvas` route at page zoom 100/125/200/400 retains Canvas session, selection and edit state; at 400% it reflows non-2D controls to one column/full-screen mutual exclusion while Canvas remains pannable and outline-equivalent. A real mobile entry resolves `/review` and requests no edit token. Width alone can neither enter review mode nor silently drop edit capability. Empty/loading/offline/failed/read-only/blocked states retain commands. OIDC state/nonce/PKCE, in-memory refresh rotation, reload `prompt=none` recovery and interactive fallback are verified; no bearer/refresh token reaches localStorage/sessionStorage/IndexedDB. Unauthenticated or non-allowlisted users cannot reach project data; project create lands on the default Episode canvas without an API-only test shortcut.

- [ ] **Step 2: Run RED**

Run: `pnpm --filter @comic-canvas/web test -- workspace-shell.test.tsx`<br>
Expected: FAIL because WorkspaceShell is absent.

- [ ] **Step 3: Implement restrained work-surface UI**

Use 52px top bar/tool rail, 6-8px panels, Lucide icon buttons with tooltips, neutral canvas and no nested cards. Implement OIDC code+PKCE with access and rotating refresh tokens held only in memory; after reload, recover through the provider session using `prompt=none`, then fall back to interactive login without losing encrypted local drafts. Never persist either token in Web Storage or IndexedDB. Project home lists recent projects, explicit create command and actionable empty/error states. Route plus granted capability resolves edit/review; breakpoints only choose dock/overlay/full-screen layout. A real mobile default route is review-only, but a desktop edit route enlarged to 400% remains edit and keeps its pannable canvas plus outline. Overlay close restores focus; the deterministic workRect function pans selected content to at least 16px visibility using <=180ms motion, or immediately under reduced motion, without changing zoom/Yjs.

- [ ] **Step 4: Verify components and target viewports**

Run: `pnpm --filter @comic-canvas/ui test && pnpm --filter @comic-canvas/web test -- workspace-shell.test.tsx workspace-mode.test.ts work-rect.test.ts && pnpm exec playwright test tests/e2e/specs/workspace-responsive.spec.ts`<br>
Expected: 1440/1280/1024/768/390 screenshots and 100/125/200/400% page zoom have zero core-control overlap and no page horizontal overflow beyond 1px; edit route/session/selection survives 400%, real mobile receives no edit token, every workRect numeric assertion and focus return passes.

- [ ] **Step 5: Commit**

```bash
git add packages/ui apps/web/src/app apps/web/src/auth apps/web/src/projects apps/web/src/workspace tests/e2e/specs/workspace-responsive.spec.ts
git commit -m "feat: build responsive comic production shell"
```

---

### Task 16: React Flow 隔离、投影、LOD 与早期规模 Spike

**Files:**
- Create: `packages/canvas-renderer-reactflow/src/canvas-surface.tsx`, `packages/canvas-renderer-reactflow/src/projection.ts`, `packages/canvas-renderer-reactflow/src/coordinates.ts`, `packages/canvas-renderer-reactflow/src/lod.ts`, `packages/canvas-renderer-reactflow/src/viewport-index.ts`
- Create: `packages/canvas-renderer-reactflow/src/projection.test.ts`, `packages/canvas-renderer-reactflow/src/coordinates.property.test.ts`
- Modify: `packages/canvas-renderer-reactflow/src/index.ts`, `.dependency-cruiser.cjs`
- Create: `tests/performance/canvas-spike.spec.ts`, `tests/fixtures/canvas/100.json`, `tests/fixtures/canvas/500.json`, `tests/fixtures/canvas/1000.json`, `tests/fixtures/canvas/5000.json`, `tests/fixtures/canvas/10000.json`

**Interfaces:** Produces renderer-neutral `CanvasSurfaceProps`, `projectVisibleGraph(snapshot, viewport, zoom)` and coordinate conversions; no React Flow type crosses package exports.

**Integration Gate:** `R` Modify public surface exports; `W` N/A until Task 18 mounts it; `C/D/A/G/M/T/Q` N/A.

- [ ] **Step 1: Write boundary/property tests and a minimal Spike harness**

1000 random document/screen round trips stay within 0.01px; projection mounts <=400 and details <=300. The Spike uses blueprint fixture mix and fixed baseline, records cold/warm interactive time, 30s pan FPS/1% low, heap and long tasks for all five sizes.

- [ ] **Step 2: Run RED and the go/no-go Spike**

Run: `pnpm --filter @comic-canvas/canvas-renderer-reactflow test -- projection.test.ts coordinates.property.test.ts`<br>
Expected: FAIL because projection/coordinate implementation is absent.<br>
Run independently even though the prior command failed: `pnpm exec playwright test tests/performance/canvas-spike.spec.ts --project=chromium`<br>
Expected: the discoverable Spike suite executes rather than being shell-short-circuited and FAILS its named 500/1000 baseline assertions until the minimal surface/projection exists; its raw artifact is still written for the go/no-go record.

- [ ] **Step 3: Implement projection and apply the recorded decision**

Use spatial index, 500-1000px overscan, stable node dimensions and LOD thresholds 0.15/0.45/0.85. If 500/1000 miss the blueprint hard gates, execute the ADR-0002 fallback before Task 17; 5000/10000 remain diagnostic only.

- [ ] **Step 4: Verify isolation and hard gates**

Run: `pnpm exec depcruise apps packages && pnpm --filter @comic-canvas/canvas-renderer-reactflow test && pnpm exec playwright test tests/performance/canvas-spike.spec.ts --grep "^canvas (500|1000) logical nodes$"`<br>
Expected: no forbidden imports; 500/1000 meet the signed ADR-0002 decision and raw results are saved as CI artifacts.

- [ ] **Step 5: Commit**

```bash
git add packages/canvas-renderer-reactflow tests/performance tests/fixtures/canvas .dependency-cruiser.cjs docs/adr/0002-canvas-renderer-and-scale.md
git commit -m "perf: validate isolated canvas renderer scale"
```

---

### Task 17: 全部 MVP 节点 renderer 与注册完整性

**Files:**
- Create: `packages/canvas-renderer-reactflow/src/nodes/content-nodes.tsx`, `packages/canvas-renderer-reactflow/src/nodes/bible-nodes.tsx`, `packages/canvas-renderer-reactflow/src/nodes/media-nodes.tsx`, `packages/canvas-renderer-reactflow/src/nodes/audio-nodes.tsx`, `packages/canvas-renderer-reactflow/src/nodes/composition-nodes.tsx`, `packages/canvas-renderer-reactflow/src/nodes/auxiliary-nodes.tsx`, `packages/canvas-renderer-reactflow/src/nodes/unknown-node.tsx`
- Create: `packages/canvas-renderer-reactflow/src/node-shell.tsx`, `packages/canvas-renderer-reactflow/src/ports.tsx`
- Modify: `packages/canvas-renderer-reactflow/src/node-registry.tsx`
- Create: `packages/canvas-renderer-reactflow/src/node-registry.test.tsx`
- Modify: `packages/canvas-renderer-reactflow/src/index.ts`

**Interfaces:** Produces `createRendererRegistry()` with renderer for all non-unknown kinds plus safe unknown placeholder; ports and dimensions come from canvas-core definitions.

**Integration Gate:** `R` Modify registry/index; `C/D/A/W/G/M/T/Q` N/A because Task 18 mounts the renderer and Web state overlay.

- [ ] **Step 1: Write registration and stable-layout tests**

Iterate the 18 concrete canvas-core definitions and require schema, ports and renderer for each, then require one separate safe renderer for `unknown`. Changing idle/queued/running/reconciling/failed/stale/approved labels must not change outer node size or port coordinates; long Chinese wraps without covering actions.

- [ ] **Step 2: Run RED**

Run: `pnpm --filter @comic-canvas/canvas-renderer-reactflow test -- node-registry.test.tsx`<br>
Expected: FAIL listing every missing renderer.

- [ ] **Step 3: Implement domain-tailored nodes**

Use fixed aspect ratios for media, 24px port hit areas, icon+text state, 2-4 high-value fields and inspector links. Unknown is read-only and lossless. Do not put forms, nested cards or provider HTML in nodes.

- [ ] **Step 4: Verify all kinds and visual states**

Run: `pnpm --filter @comic-canvas/canvas-renderer-reactflow test && pnpm --filter @comic-canvas/canvas-renderer-reactflow typecheck`<br>
Expected: registry completeness is exactly `18 concrete + 1 safe unknown`, all state matrices pass, no layout shift assertion exceeds 1px.

- [ ] **Step 5: Commit**

```bash
git add packages/canvas-renderer-reactflow
git commit -m "feat: render the complete mvp node catalog"
```

---

### Task 18: 画布编辑、命令桥与断链恢复

**Files:**
- Create: `packages/canvas-renderer-reactflow/src/command-bridge.ts`, `packages/canvas-renderer-reactflow/src/selection.ts`, `packages/canvas-renderer-reactflow/src/clipboard.ts`, `packages/canvas-renderer-reactflow/src/groups.ts`, `packages/canvas-renderer-reactflow/src/edges.tsx`, `packages/canvas-renderer-reactflow/src/keyboard.ts`
- Create: `packages/canvas-renderer-reactflow/src/command-bridge.test.tsx`
- Modify: `packages/canvas-renderer-reactflow/src/canvas-surface.tsx`, `packages/canvas-renderer-reactflow/src/index.ts`
- Create: `apps/web/src/workspace/canvas-workspace.tsx`, `apps/web/src/workspace/inspector.tsx`, `apps/web/src/workspace/node-state-overlay.tsx`
- Modify: `apps/web/src/app/router.tsx`
- Create: `tests/e2e/specs/canvas-editing.spec.ts`

**Interfaces:** Emits only CanvasCommand; domain node create/edit calls Project APIs and waits for projection. Single-input replacement returns explicit replace/cancel choice.

**Integration Gate:** `R/W` Modify and mount the renderer plus shared state overlay; `C` N/A because its command union is consumed unchanged; `D/A/G/M/T/Q` N/A.

- [ ] **Step 1: Write command and keyboard tests**

Cover selection, right/left box semantics, connect/reconnect, explicit single-input replacement, group/ungroup/delete-container choice, copy config vs reference, edit lock, broken-edge placeholder and focus-scoped shortcuts. With the Canvas surface focused and no input/editor focused, `N` emits the quick-create intent consumed by Task 20; input focus suppresses canvas letters. `Tab/Shift+Tab` only advance/reverse focus and can never create a node. Generation shortcut opens confirmation only.

- [ ] **Step 2: Run RED**

Run: `pnpm --filter @comic-canvas/canvas-renderer-reactflow test -- command-bridge.test.tsx`<br>
Expected: FAIL because event-to-command bridge is absent.

- [ ] **Step 3: Implement editing without domain duplication**

Use local-origin transactions, stable clipboard IDs, 8px snapping, preview-only auto changes and 10-second recover notice. Domain-backed rename routes to API; Yjs keeps position/config only. Delete upstream preserves recoverable broken edge.

- [ ] **Step 4: Verify browser workflow**

Run: `pnpm --filter @comic-canvas/canvas-renderer-reactflow test && pnpm exec playwright test tests/e2e/specs/canvas-editing.spec.ts`<br>
Expected: all keyboard/menu paths produce the same commands, refresh preserves result, no silent edge replacement occurs.

- [ ] **Step 5: Commit**

```bash
git add packages/canvas-renderer-reactflow apps/web/src/workspace apps/web/src/app/router.tsx tests/e2e/specs/canvas-editing.spec.ts
git commit -m "feat: add non destructive canvas editing"
```

---

### Task 19: 大纲、搜索、自动布局与无障碍矩阵

**Files:**
- Create: `apps/web/src/workspace/outline-view.tsx`, `apps/web/src/workspace/search-panel.tsx`, `apps/web/src/workspace/minimap-control.tsx`, `apps/web/src/workspace/layout-preview.tsx`, `apps/web/src/workspace/accessibility-status.tsx`
- Modify: `apps/web/src/workspace/canvas-workspace.tsx`, `apps/web/src/app/router.tsx`, `packages/canvas-renderer-reactflow/src/index.ts`
- Modify: `apps/web/package.json`, root `package.json`, `pnpm-lock.yaml`
- Create: `apps/web/src/workspace/accessibility.test.tsx`, `tests/e2e/specs/accessibility.spec.ts`

**Interfaces:** Produces keyboard-equivalent node create/connect/edit/delete/select and preview-confirm ELK layout; `N` on the focused Canvas/outline opens create while `Tab/Shift+Tab` remain focus navigation; adds `elkjs@0.10.0` and `@axe-core/playwright@4.10.2` exactly.

**Integration Gate:** `W/R` Modify accessibility/navigation entrypoints; `C/D/A/G/M/T/Q` N/A.

- [ ] **Step 1: Write focus, zoom and alternative-operation tests**

Cover page zoom 100/200/400 separately from canvas zoom 5/15/45/85/100/400; Dialog/Popover/delete focus restoration; reduced-motion; 2x Chinese; outline keyboard connections; aggregated aria-live; no drag-only command.

- [ ] **Step 2: Run RED**

Run: `pnpm --filter @comic-canvas/web test -- accessibility.test.tsx`<br>
Expected: FAIL because OutlineView and focus restoration are absent.

- [ ] **Step 3: Implement accessible navigation and ELK preview**

Run ELK in Web Worker and write positions only after confirm. At 400% page zoom non-2D UI reflows to 320 CSS px equivalent; canvas keeps two-axis pan and outline equivalence. Batch live region announces no more than once per 2 seconds.

- [ ] **Step 4: Verify automatic and manual-ready gates**

Run: `pnpm install --lockfile-only && pnpm install --frozen-lockfile && pnpm --filter @comic-canvas/web test && pnpm exec playwright test tests/e2e/specs/accessibility.spec.ts`<br>
Expected: axe serious/critical 0, keyboard P0 flows 100%, no focus trap, reduced-motion has zero continuous animations.

- [ ] **Step 5: Commit**

```bash
git add apps/web packages/canvas-renderer-reactflow package.json pnpm-lock.yaml tests/e2e/specs/accessibility.spec.ts
git commit -m "feat: make canvas workflows keyboard accessible"
```

---

### Task 20: 竖屏漫剧模板与快捷插入

**Files:**
- Create: `packages/contracts/src/templates.ts`, `packages/contracts/src/templates.contract.test.ts`
- Modify: `packages/contracts/src/index.ts`
- Create: `packages/canvas-core/src/templates/vertical-comic.ts`, `packages/canvas-core/src/template-validator.ts`, `packages/canvas-core/src/template-validator.test.ts`
- Modify: `packages/canvas-core/src/index.ts`
- Create: `apps/api/src/templates/templates.module.ts`, `apps/api/src/templates/templates.controller.ts`
- Modify: `apps/api/src/app.module.ts`
- Create: `apps/web/src/workspace/quick-insert-menu.tsx`, `apps/web/src/workspace/template-picker.tsx`
- Create: `apps/web/src/workspace/quick-insert-menu.test.tsx`
- Modify: `apps/web/src/app/router.tsx`, `packages/canvas-renderer-reactflow/src/index.ts`
- Create: `apps/api/src/templates/templates.e2e-spec.ts`, `tests/e2e/specs/quick-insert.spec.ts`

**Interfaces:** Produces one versioned built-in vertical-comic template and compatible-node quick insert from double-click, focus-scoped `N` or dropped port. `Tab/Shift+Tab` are never creation commands.

**Integration Gate:** `C/A/W/R` Modify; `D/G/M/T/Q` N/A because template is signed built-in data and has no Agent/provider execution.

- [ ] **Step 1: Write template completeness and insert-filter tests**

Template validates every node/port, contains Script/Bibles/Shot/Image/Video/Voice/Timeline/Export/ReviewGate, has no unknown kind or P1 capability, and creates zero Job. Dropped data port lists only compatible nodes; double-click/`N`/menu routes are equivalent. Pressing `N` inside an input/editor does nothing, while every `Tab/Shift+Tab` case changes focus only and creates zero command.

- [ ] **Step 2: Run RED**

Run: `pnpm --filter @comic-canvas/canvas-core test -- template-validator.test.ts`<br>
Expected: FAIL because vertical-comic template is absent.

- [ ] **Step 3: Implement signed built-in template and insert UI**

Freeze templateId/version/checksum; API returns schema-compatible read-only template. Inserting proposes CanvasCommands and requires user confirm for domain-backed resources; it never invokes a provider. Generic Agent/Skill workflow is excluded.

- [ ] **Step 4: Verify registration and browser use**

Run: `pnpm --filter @comic-canvas/canvas-core test -- template-validator.test.ts && pnpm --filter @comic-canvas/api test:e2e -- templates.e2e-spec.ts && pnpm --filter @comic-canvas/web test -- quick-insert-menu.test.tsx && pnpm exec playwright test tests/e2e/specs/quick-insert.spec.ts`<br>
Expected: endpoints are reachable, all nodes render, no generation/ledger rows are created.

- [ ] **Step 5: Commit**

```bash
git add packages/contracts packages/canvas-core apps/api/src/templates apps/api/src/app.module.ts apps/web/src/workspace apps/web/src/app/router.tsx packages/canvas-renderer-reactflow/src/index.ts tests/e2e/specs/quick-insert.spec.ts
git commit -m "feat: add controlled vertical comic template"
```

## Wave C：资产、供应商与可靠任务

### Task 21: 不可变资产、quarantine 与签名访问

**Files:**
- Create: `packages/contracts/src/assets.ts`, `packages/contracts/src/assets.contract.test.ts`
- Modify: `packages/contracts/src/index.ts`
- Create: `packages/db/src/schema/assets.ts`, `packages/db/migrations/0006_assets_uploads.sql`
- Modify: `packages/db/src/schema/index.ts`
- Create: `packages/storage/src/object-key.ts`, `packages/storage/src/signed-url.ts`, `packages/storage/src/quarantine.ts`, `packages/storage/src/storage.test.ts`
- Modify: `packages/storage/src/index.ts`

**Interfaces:** Produces immutable `Asset/AssetVersion/AssetVariant`, `UploadSession`, short-lived RLS-protected `RemoteIngestInstruction`, `opaqueObjectKey(tenantId, objectId, variant)` and quarantine-to-ready promotion contract.

**Integration Gate:** `C/D` Modify; `A/M` N/A until Task 22 registers endpoints/processors; `W/R/G/T/Q` N/A.

- [ ] **Step 1: Write immutability/schema introspection tests and create legal comment-only `0006`**

Reject changing bytes/MIME/hash of an AssetVersion; object keys contain only tenant/opaque IDs and never title/original filename; a quarantine key cannot be signed for browser/CDN; cross-tenant dedupe and signed access fail. Introspection requires `RemoteIngestInstruction` to carry project scope, opaque instruction ID, locator, declared type/limit, expiry, immutable request hash and lifecycle state under FORCE RLS; no queue schema may embed its locator.

- [ ] **Step 2: Run RED**

Run: `pnpm --filter @comic-canvas/db test:migration -- 0006_assets_uploads.sql`<br>
Expected: the comment-only migration loads, then FAILS `ASSET_VERSION_TABLE_MISSING`; no failure comes from a missing migration file.

- [ ] **Step 3: Implement revisioned asset schema and storage policy**

Store SHA-256, byte size, detected MIME, media metadata, rights/moderation refs, source Job and status. Store remote locators only in the short-lived scoped instruction row under platform database encryption/RLS; exclude them from analytics, audit detail, queue payloads and object metadata, and redact them from diagnostics. Only Media Worker credentials can read quarantine or a scoped instruction after `bootstrap_work_event`; promotion is server-side copy to immutable ready prefix followed by DB CAS.

- [ ] **Step 4: Verify migration, RLS and storage rules**

Run: `pnpm --filter @comic-canvas/db test:migration -- 0006_assets_uploads.sql && pnpm --filter @comic-canvas/storage test`<br>
Expected: same-tenant ready URLs expire as signed, every quarantine/cross-tenant/original-name case is denied.

- [ ] **Step 5: Commit**

```bash
git add packages/contracts packages/db packages/storage
git commit -m "feat: establish immutable quarantined assets"
```

---

### Task 22: Multipart 上传、外部导入、扫描、代理与 abandoned reaper

**Files:**
- Create: `apps/api/src/uploads/uploads.module.ts`, `apps/api/src/uploads/uploads.controller.ts`, `apps/api/src/uploads/uploads.service.ts`, `apps/api/src/uploads/remote-ingest.controller.ts`, `apps/api/src/uploads/remote-ingest.service.ts`, `apps/api/src/uploads/uploads.e2e-spec.ts`
- Create: `apps/api/src/assets/assets.module.ts`, `apps/api/src/assets/assets.controller.ts`, `apps/api/src/assets/assets.service.ts`
- Modify: `apps/api/src/app.module.ts`
- Create: `apps/worker-media/src/processors/inspect-upload.ts`, `apps/worker-media/src/processors/ingest-remote-source.ts`, `apps/worker-media/src/processors/ingest-remote-source.test.ts`, `apps/worker-media/src/processors/generate-proxies.ts`, `apps/worker-media/src/processors/moderate-output.ts`, `apps/worker-media/src/processors/promote-ready.ts`, `apps/worker-media/src/processors/abort-abandoned-uploads.ts`
- Create: `apps/worker-media/src/processors/transcode-cfr-mezzanine.ts`, `apps/worker-media/src/processors/transcode-cfr-mezzanine.test.ts`
- Modify: `apps/worker-media/src/processor-registry.ts`, `apps/worker-media/src/main.ts`
- Create: `apps/worker-media/src/moderation/output-moderation.gateway.ts`, `apps/worker-media/src/media-outbox-consumer.ts`
- Create: `packages/queue/src/media-queue.ts`, `packages/queue/src/media-queue.test.ts`
- Modify: `packages/queue/src/index.ts`
- Create: `packages/storage/src/multipart.ts`, `packages/storage/src/untrusted-ingest.ts`, `packages/storage/src/multipart.test.ts`
- Modify: `packages/storage/src/index.ts`, `apps/web/src/app/router.tsx`
- Modify: `packages/contracts/src/assets.ts`, `packages/contracts/src/index.ts`
- Create: `packages/contracts/src/mezzanine.contract.test.ts`
- Create: `apps/web/src/assets/upload-panel.tsx`, `apps/web/src/assets/remote-import.tsx`, `tests/e2e/specs/upload-resume.spec.ts`

**Interfaces:** Produces create/complete/abort multipart APIs; `POST /v1/uploads/remote` returning an inspectable ingest task; local/URL segmented source UI; `ingestUntrustedObject(source): Promise<QuarantinedObject>` for upload/remote/provider output; transactional Media Outbox routing with permanent receipts; required output-moderation record; ready variants thumbnail/poster/proxy/waveform; and shared `ensureCfrMezzanine(assetVersionId): Promise<AssetVariant>` whose immutable recipe is H.264/yuv420p/25/1 CFR with exact objectVersionId/byteSha256/source-to-frame mapping. Every ready video, whether upload, URL import or provider output, must pass it before Timeline eligibility.

**Integration Gate:** `C/A/M/W/Q` Modify; `D` N/A because it consumes Task 21's asset schema and Task 11 governance; `R/G/T` N/A.

- [ ] **Step 1: Write boundary, resume and quarantine tests**

Validate blueprint MIME/size/pixel/duration limits before signed URL; same-tenant/no-Project-membership cannot obtain a signed part URL or create remote ingest. Complete the same multipart key twice or submit the same remote request hash twice and require one AssetVersion/Media chain. API remote handling must open zero sockets; BullMQ, logs, audit detail, object keys and process arguments contain zero URL text. Through the real Task 02 proxy harness, allowlisted public HTTPS reaches quarantine while loopback/private/link-local/metadata, DNS rebind, private redirect, TLS host mismatch, wrong MIME, oversized/expired response and caller pin override create a typed failed ingest and zero ready asset. Corrupt checksum, MIME spoof, virus fixture, zip bomb or rejected output moderation remains quarantined; interrupted multipart resumes; 7-day session triggers AbortMultipartUpload and object cleanup. Feed 24fps, 30fps and VFR upload/remote/provider-style fixtures through the same processor and require one immutable 25/1 CFR mezzanine, stable mapping/hash, no audio drift beyond one frame and Timeline-ineligible status before it exists. Crash each processor after effect/before ack and require one durable marker followed by one receipt/effect on replay.

- [ ] **Step 2: Run RED**

Run: `pnpm --filter @comic-canvas/api test:e2e -- uploads.e2e-spec.ts`<br>
Expected: FAIL with `/v1/uploads` and `/v1/uploads/remote` both 404; the tests and proxy fixtures are already discoverable.

- [ ] **Step 3: Implement direct upload and Media Worker chain**

API returns short part URLs after `asset:upload`, Project membership and quota checks. Complete writes AssetVersion plus media Outbox in the shared Task 09 command transaction. Remote ingest uses the same capability/quota/rights checks, calls Task 11 request validation without DNS or fetch, and transactionally writes a short-lived `RemoteIngestInstruction` plus an opaque Media Outbox; the queue contains only `{eventId,route,payloadHash}`. Media bootstraps the event, reads that one scoped instruction, streams it through the mTLS SafeFetch proxy directly into quarantine and records detected hash/metadata before expiring the locator. The UI presents local file and HTTPS URL as a segmented source control, shows queued/fetching/scanning/failed/ready with retry requiring fresh confirmation, and never claims the API has validated remote bytes. Dispatcher routes to Media queue; processors use `shell:false` argument arrays for ClamAV/ffprobe/FFmpeg, MIME magic, decode limits and EXIF removal, then call the registered output-moderation gateway for generated media. For every detected video, the common chain deterministically creates a 25/1 CFR mezzanine before ready promotion; source fps/VFR timestamps never become Timeline frame numbers. Provider outputs added in Task 26 enter this same chain, and Task 38 static-motion only produces another input to this common processor. Promotion happens only after every required scan/moderation/mezzanine receipt. Reaper is an Outbox-driven idempotent processor and ignores completed sessions.

- [ ] **Step 4: Verify API, worker registry and browser resume**

Run: `pnpm --filter @comic-canvas/contracts test -- mezzanine.contract.test.ts && pnpm --filter @comic-canvas/api test:e2e -- uploads.e2e-spec.ts && pnpm --filter @comic-canvas/worker-media test -- ingest-remote-source.test.ts transcode-cfr-mezzanine.test.ts && pnpm --filter @comic-canvas/worker-media test && pnpm exec playwright test tests/e2e/specs/upload-resume.spec.ts`<br>
Expected: local and remote edge fixtures follow exact accept/reject rules; API network calls and URL occurrences outside the scoped instruction are 0; valid remote bytes reach quarantine once; 24/30/VFR inputs produce exact immutable 25/1 variants before Timeline eligibility; Q/M registrations and receipts are complete; output ModerationRecord exists before promotion; refresh resumes local parts and remote task state; only ready variants become visible.

- [ ] **Step 5: Commit**

```bash
git add packages/contracts apps/api/src/uploads apps/api/src/assets apps/api/src/app.module.ts apps/worker-media packages/queue packages/storage apps/web/src/assets apps/web/src/app/router.tsx tests/e2e/specs/upload-resume.spec.ts
git commit -m "feat: scan and resume media uploads"
```

---

### Task 23: Provider SDK、能力目录与 Fake Provider

**Files:**
- Create: `packages/provider-sdk/src/types.ts`, `packages/provider-sdk/src/adapter.ts`, `packages/provider-sdk/src/contract-suite.ts`, `packages/provider-sdk/src/generation-credential-resolver.ts`, `packages/provider-sdk/src/provider-sdk.test.ts`
- Modify: `packages/provider-sdk/src/index.ts`, `packages/provider-sdk/package.json`, `pnpm-lock.yaml`
- Create: `packages/contracts/src/models.ts`, `packages/contracts/src/generation.ts`
- Modify: `packages/contracts/src/index.ts`
- Create: `packages/db/src/schema/models.ts`, `packages/db/migrations/0007_model_catalog.sql`
- Modify: `packages/db/src/schema/index.ts`
- Create: `packages/db/test/provider-route-scope.integration.test.ts`
- Create: `apps/api/src/models/models.module.ts`, `apps/api/src/models/models.controller.ts`, `apps/api/src/models/models.service.ts`, `apps/api/src/models/models.e2e-spec.ts`
- Modify: `apps/api/src/app.module.ts`
- Create: `apps/worker-generation/src/adapters/fake.adapter.ts`
- Create: `apps/worker-generation/src/adapter-registry.test.ts`
- Modify: `apps/worker-generation/src/adapter-registry.ts`, `apps/worker-generation/src/main.ts`
- Create: `apps/worker-generation/vitest.staging.config.ts`

**Interfaces:**

```ts
export interface ModelProviderAdapter {
  providerKey: string;
  capabilities: readonly ModelCapability[];
  listModels(ctx: ProviderContext): Promise<readonly ModelDescriptor[]>;
  validate(request: GenerationRequest): ValidationResult;
  estimateCost(request: GenerationRequest): Promise<CostEstimate>;
  submit(request: GenerationRequest): Promise<ProviderSubmission>;
  recover(submissionKey: string): Promise<ProviderRecoveryResult>;
  poll(externalId: string): Promise<ProviderStatus>;
  cancel(externalId: string): Promise<ProviderCancellationResult>;
  parseWebhook(request: SignedWebhookRequest): Promise<ProviderEvent>;
  normalizeError(error: unknown): NormalizedProviderError;
}

export type ProviderRecoveryResult =
  | { kind: "found"; submission: ProviderSubmission; evidence: RecoveryEvidence }
  | { kind: "definitively_absent"; evidence: RecoveryEvidence }
  | { kind: "unknown"; reasonCode: string; evidence?: RecoveryEvidence }
  | { kind: "unsupported" };

export type ProviderCancellationResult =
  | { kind: "accepted"; evidence: CancellationEvidence }
  | { kind: "already_terminal"; status: ProviderStatus; evidence: CancellationEvidence }
  | { kind: "unknown"; reasonCode: string; evidence?: CancellationEvidence }
  | { kind: "unsupported" };
```

`ProviderStatus/Event` include billed micros/currency/evidence, outputs, progress stage and terminal reason; adapter declares recovery mode `idempotency-key | client-reference-query | unsupported`. `definitively_absent` is legal only for a documented authoritative lookup and carries evidence accepted by the contract suite; transport failure maps to `unknown`, never absence.

**Integration Gate:** `C/D/A/G` Modify; `T` N/A because Task 26 consumes the contract suite without changing the test-kit registry; `W/R/M/Q` N/A.

- [ ] **Step 1: Write adapter/schema introspection suites and create legal comment-only `0007`**

Assert capability/schema/price consistency, submission key round-trip, all four recovery variants, all four cancellation variants, authoritative evidence for definitive absence, signed webhook parsing, standardized errors/billing, no secret serialization and no network during Fake tests. Prove recovery `unknown/unsupported` cannot satisfy a resubmit predicate; cancellation `accepted` is a request acknowledgement rather than terminal Job evidence, `already_terminal` carries a normalized terminal status, and transport ambiguity maps to `unknown`. Add compile-time assertions that the production adapter and Task 03 `TestProviderAdapter` protocols are structurally compatible. Create 0007 as a comment-only legal migration and an introspection test for model catalog plus narrow pre-signature webhook routing function.

- [ ] **Step 2: Run RED**

Run: `pnpm --filter @comic-canvas/provider-sdk test`<br>
Expected: FAIL because adapter contract and Fake test implementation are absent.<br>
Run: `pnpm --filter @comic-canvas/db test:migration -- 0007_model_catalog.sql`<br>
Expected: the comment-only migration loads, then FAILS `MODEL_CATALOG_TABLE_MISSING`; no failure comes from a missing migration file.

- [ ] **Step 3: Implement catalog, KMS resolution and deterministic Fake**

Add exact `@aws-sdk/client-kms@3.864.0`, update lockfile, then run the two-step dependency materialization rule. `GenerationCredentialResolver` can decrypt only the `generation-submit` key class inside Generation Worker, rejects webhook-verification ciphertext and zeroes cache on rotation. Migration 0007 creates `provider_configs/model_catalog` plus `comic_security_owner`-owned `route_provider_webhook(providerKey,routeToken)` with empty search path, fully qualified names, bounded/minimal return and route-lookup audit; only `comic_api` may execute it, and it returns providerConfigId plus verification-secret reference, never tenant/project/Attempt scope or submit credentials. Wrong current_user/token/provider, `PUBLIC`, Generation/Media/Collab/Dispatcher calls and direct config reads all fail. Task 25 creates the post-signature Attempt bootstrap after Attempt tables exist. Fake accepts scripted latency/failure/webhook/recovery/cancel/billing but its module is not imported into a production registry/image; production startup test enumerates the registry and proves Fake is absent.

- [ ] **Step 4: Verify contract, migration and registrations**

Run: `pnpm install --lockfile-only && pnpm install --frozen-lockfile && pnpm --filter @comic-canvas/provider-sdk test -- provider-sdk.test.ts && pnpm --filter @comic-canvas/db test:migration -- 0007_model_catalog.sql && pnpm --filter @comic-canvas/db test -- provider-route-scope.integration.test.ts && pnpm --filter @comic-canvas/api test:e2e -- models.e2e-spec.ts && pnpm --filter @comic-canvas/worker-generation test -- adapter-registry.test.ts`<br>
Expected: the comment-only migration was replaced and model catalog plus the audited `route_provider_webhook` SECURITY DEFINER function migrate cleanly; the function returns only providerConfigId/verification-secret reference and is executable only by API ingress; catalog endpoint is reachable, Fake passes all adapter cases in test wiring, and the production registry/image contains no Fake import.

- [ ] **Step 5: Commit**

```bash
git add packages/provider-sdk packages/contracts packages/db apps/api/src/models apps/api/src/app.module.ts apps/worker-generation pnpm-lock.yaml
git commit -m "feat: define recoverable provider capability sdk"
```

---

### Task 24: 整数微单位账本与并发预算

**Files:**
- Create: `packages/contracts/src/billing.ts`, `packages/contracts/src/billing.contract.test.ts`
- Modify: `packages/contracts/src/index.ts`
- Create: `packages/db/src/schema/billing.ts`, `packages/db/migrations/0008_billing.sql`, `packages/db/src/ledger.ts`, `packages/db/test/ledger.integration.test.ts`
- Modify: `packages/db/src/schema/index.ts`, `packages/db/src/index.ts`
- Create: `apps/api/src/billing/billing.module.ts`, `apps/api/src/billing/billing.controller.ts`, `apps/api/src/billing/billing.service.ts`
- Create: `apps/api/src/billing/billing.e2e-spec.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:** Produces one immutable ISO 4217 currency policy per tenant/project; `reserve/settle/release/expire`; and idempotent `recordAttemptCharge(attemptId, providerChargeId, amountMicros, currency, evidenceHash)` with decimal-string micros at API boundary and bigint internally. Every ledger movement balances; Task 25 makes each GenerationAttempt reference a pre-created billable-attempt subject.

**Integration Gate:** `C/D/A` Modify; `W/R/G/M/T/Q` N/A.

- [ ] **Step 1: Write concurrency/schema introspection properties and create legal comment-only `0008`**

100 concurrent reservations cannot exceed project/tenant budget; duplicate operation/charge evidence creates one movement; provider currency mismatch is rejected before reservation or charge. Two retry Attempts billed under one Job both append charges and settle their exact sum. Only undispatched reservation expires. Cancellation releases remaining reserve; a later evidenced bill appends `cancellation_late_bill_adjustment`, never mutates the release, and flags overage/reconciliation according to policy.

- [ ] **Step 2: Run RED**

Run: `pnpm --filter @comic-canvas/db test:migration -- 0008_billing.sql`<br>
Expected: the comment-only migration loads, then FAILS `USAGE_RESERVATION_TABLE_MISSING`; no failure comes from a missing file.

- [ ] **Step 3: Implement serializable ledger transitions**

Use append-only debit/credit/adjustment entries, locked budget row, unique operation/providerCharge IDs and state CAS. `billing_currency_policies` freeze the project currency; `billable_attempts` provides the tenant-scoped identity referenced by charge evidence before generation schema exists. Never use float or JS number for money. Dispatcher heartbeat can extend a valid reservation only in the same transaction that claims its Job.

- [ ] **Step 4: Verify invariants and endpoint registration**

Run: `pnpm --filter @comic-canvas/db test:migration -- 0008_billing.sql && pnpm --filter @comic-canvas/db test -- ledger.integration.test.ts && pnpm --filter @comic-canvas/api test:e2e -- billing.e2e-spec.ts`<br>
Expected: 100 concurrency rounds preserve non-negative balance and exact sum; two billed Attempts settle twice without duplicate charge, late cancel adjustment is append-only, all currency mismatches fail, and the authorized endpoint/OpenAPI are registered.

- [ ] **Step 5: Commit**

```bash
git add packages/contracts packages/db apps/api/src/billing apps/api/src/app.module.ts
git commit -m "feat: reserve and settle generation costs exactly"
```

---

### Task 25: Durable Job 创建、estimate、Outbox 与队列投递

**Files:**
- Create: `packages/db/src/schema/generation.ts`, `packages/db/src/schema/selections.ts`, `packages/db/migrations/0009_generation.sql`
- Modify: `packages/db/src/schema/index.ts`
- Create: `packages/db/src/provider-event-scope.ts`, `packages/db/test/provider-event-scope.integration.test.ts`
- Create: `packages/queue/src/generation-queue.ts`, `packages/queue/src/generation-queue.test.ts`
- Modify: `packages/queue/src/index.ts`
- Create: `apps/api/src/generation/generation.module.ts`, `apps/api/src/generation/generation.controller.ts`, `apps/api/src/generation/generation.service.ts`, `apps/api/src/generation/job-cancellation.service.ts`, `apps/api/src/generation/generation.e2e-spec.ts`, `apps/api/src/generation/generation-cancel.e2e-spec.ts`
- Create: `apps/api/src/generation/generation-input-contributors.ts`, `apps/api/src/generation/generation-archive-blocker.ts`
- Create: `apps/api/src/selections/selections.module.ts`, `apps/api/src/selections/selections.controller.ts`, `apps/api/src/selections/selections.service.ts`, `apps/api/src/selections/selections.e2e-spec.ts`
- Modify: `apps/api/src/app.module.ts`
- Create: `apps/worker-generation/src/generation-consumer.ts`
- Create: `apps/worker-generation/src/generation-consumer.test.ts`
- Modify: `apps/worker-generation/src/main.ts`
- Create: `apps/web/src/generation/single-job-confirmation.tsx`, `apps/web/src/generation/single-job-result.tsx`, `apps/web/src/assets/selection-actions.tsx`
- Create: `apps/web/src/generation/single-job-confirmation.test.tsx`
- Modify: `apps/web/src/offline/reconnect-coordinator.ts`, `apps/web/src/app/router.tsx`, `packages/canvas-renderer-reactflow/src/node-registry.tsx`
- Modify: `packages/contracts/src/generation.ts`, `packages/contracts/src/index.ts`
- Create: `packages/contracts/src/generation-state.contract.test.ts`
- Create: `packages/contracts/src/selections.ts`
- Modify: `apps/api/src/projects/episode-lifecycle.registry.ts`

**Interfaces:** Produces `/v1/generation/estimate`, `/jobs` and idempotent `POST /v1/generation/jobs/:jobId/cancel`; single-Job estimate/diff/confirm UI; persisted Job input/config/provider/model/durable Canvas revision; `GENERATION_JOB_STATES`, `TERMINAL_JOB_STATES`, `NONTERMINAL_JOB_STATES` and exhaustive `isGenerationJobTerminal`; orthogonal cancellation `none/requested/acknowledged/unsupported/unknown`; `GenerationInputContributorRegistry`; baseline append-only Selection/current pointer API; database-backed Generation archive blocker; stable Outbox eventId/terminal receipt and per-Project event counter. Migration 0009 also produces verified-provider receipt/bootstrap storage and `bootstrapVerifiedProviderEvent(...): VerifiedProjectScope` for Task 26. Task 32 later contributes compiled prompts; Task 34 extends Selection with Approval/rejection/history UX.

**Integration Gate:** `C/D/A/G/W/R/Q` Modify; `M/T` N/A.

- [ ] **Step 1: Write atomicity/schema introspection tests and create legal comment-only `0009`**

Job creation calls Collab flush/read, rejects mismatched activeCanvasRevisionId/documentEpoch/stateVector/hash/durableSeq with 409, validates `generation:spend`, same-Project membership, rights/moderation/model/currency, reserves fee and writes Job/first Attempt subject/project event/outbox in one command transaction. Enforce globally unique submissionKey, partial unique `(providerConfigId,externalId)`, unique cancellation operation key and GenerationAttempt -> billable_attempt composite FK. Crash before queue send replays one event; BullMQ cleanup cannot cause a second consumer effect. Offline and online single-Job intents both show input/model/price diff and require confirm. Baseline Selection can point only to a ready output from the same Shot/project and never implies Approval.

Iterate every Job state and prove `TERMINAL`/`NONTERMINAL` are disjoint, exhaustive and the only source used by archive/snapshot/restore/retention guards. Cancel `pending/queued` while the generation Outbox is not published: one row-lock/CAS race winner marks Job `canceled`, terminalizes/supersedes the undispatched Outbox and releases the unused reservation atomically. Cancel `dispatching/running/reconciling`: Job execution state remains, cancellation becomes `requested`, and exactly one cancel-command Outbox/audit/Project event is written; duplicate operation is one effect. Race cancel with Dispatcher claim/publish and with provider success; no published work is mistaken for undispatched and terminal provider evidence wins without dropping late output/billing.

Create a verified-webhook receipt fixture only after a raw-verifier proof, then call the narrow bootstrap by providerConfig/externalId/receiptId/payloadHash and receive the Attempt's exact Project scope. Missing proof, spoofed tenant/project, mismatched payload hash/externalId, replayed receipt, wrong role and pre-signature direct calls return no scope and write no provider event.

- [ ] **Step 2: Run RED**

Run: `pnpm --filter @comic-canvas/db test:migration -- 0009_generation.sql`<br>
Expected: the comment-only migration loads, then FAILS `GENERATION_JOB_TABLE_MISSING`; generic Outbox tables already exist from Task 09.

- [ ] **Step 3: Implement estimate-reserve-create-dispatch flow**

API reconstructs node config only from durable Yjs data, resolves exact upstream AssetVersion/Binding revisions and stores a canonical input/config snapshot hash; it does not call or name the future Prompt Compiler. Contributor registry initially contains only durable Canvas/input resolution. Task 09's separate Dispatcher claims/publishes the generation Outbox without creating a fake `delivered` state or terminal receipt. `generation-consumer` under `comic_generation_worker` receives only `{eventId,route,payloadHash}`, calls role-bound `bootstrap_work_event`, writes a durable consumer marker, then advances Job `queued/dispatching -> running` with the effect receipt rules; Redis jobId is only an optimization. Project events allocate eventId while locking the Project counter row until commit.

Migration 0009 creates Job/Attempt/cancellation operation/provider-verification receipt tables and the narrow security-owner `record_verified_provider_event`/`bootstrap_verified_provider_event`; API may invoke them only through the raw-verifier call site, Generation/Media/Collab/Dispatcher cannot, proof/payload/external identity are audited and Attempt is the sole tenant/project authority. The cancel command uses the same Job/Outbox row locks as Dispatcher. Undispatched cancellation releases reservation; dispatched cancellation writes one worker cancel route and never marks Job canceled without poll/webhook terminal evidence. Register `GenerationArchiveBlocker` with Task 10's lifecycle registry using `NONTERMINAL_JOB_STATES`, so `pending/queued/dispatching/running/reconciling` all prevent archive; Jobs/Attempts/Selection are explicitly excluded from Episode copy. Single-job UI always separates Estimate from Confirm and surfaces currency/retention/cancel-billing terms.

- [ ] **Step 4: Verify integration and module/runner registration**

Run: `pnpm --filter @comic-canvas/db test:migration -- 0009_generation.sql && pnpm --filter @comic-canvas/db test -- provider-event-scope.integration.test.ts && pnpm --filter @comic-canvas/contracts test -- generation-state.contract.test.ts && pnpm --filter @comic-canvas/queue test -- generation-queue.test.ts && pnpm --filter @comic-canvas/api test:e2e -- generation.e2e-spec.ts generation-cancel.e2e-spec.ts selections.e2e-spec.ts && pnpm --filter @comic-canvas/worker-generation test -- generation-consumer.test.ts && pnpm --filter @comic-canvas/web test -- single-job-confirmation.test.tsx`<br>
Expected: 20 duplicate creates yield one Job/reservation/event/outbox; uniqueness constraints reject duplicate provider/cancellation identities; all state sets are exhaustive; cancel-vs-publish races either cancel undispatched work+release reserve or issue one running cancellation without false terminal; stale Canvas/currency mismatch yields no charge; Redis record removal still produces one effect; verified-provider bootstrap accepts only post-signature Attempt evidence; archive blocker covers every nonterminal state; estimate-confirm and baseline Selection are operable without API-driver shortcuts.

- [ ] **Step 5: Commit**

```bash
git add packages/contracts packages/db packages/queue apps/api/src/generation apps/api/src/selections apps/api/src/projects/episode-lifecycle.registry.ts apps/api/src/app.module.ts apps/worker-generation apps/web/src/generation apps/web/src/assets/selection-actions.tsx apps/web/src/offline apps/web/src/app/router.tsx packages/canvas-renderer-reactflow/src/node-registry.tsx
git commit -m "feat: create generation jobs from durable canvas state"
```

---

### Task 26: Worker submission recovery、Webhook 与费用对账

**Files:**
- Create: `apps/worker-generation/src/job-processor.ts`, `apps/worker-generation/src/attempt-service.ts`, `apps/worker-generation/src/recovery-service.ts`, `apps/worker-generation/src/cancellation-service.ts`, `apps/worker-generation/src/webhook-consumer.ts`, `apps/worker-generation/src/billing-reconciler.ts`, `apps/worker-generation/src/provider-output-dispatch.ts`
- Modify: `apps/worker-generation/src/main.ts`, `apps/worker-generation/src/adapter-registry.ts`
- Create: `apps/worker-generation/test/recovery.integration.test.ts`, `apps/worker-generation/test/cancellation.integration.test.ts`, `apps/worker-generation/test/webhook.integration.test.ts`, `apps/worker-generation/test/provider-output-dispatch.integration.test.ts`, `apps/worker-generation/test/billing-reconciliation.integration.test.ts`
- Create: `apps/worker-media/src/processors/ingest-provider-output.ts`, `apps/worker-media/src/processors/ingest-provider-output.test.ts`
- Modify: `apps/worker-media/src/processor-registry.ts`, `apps/worker-media/src/main.ts`
- Create: `packages/provider-sdk/src/webhook-secret-resolver.ts`, `packages/provider-sdk/src/webhook-verifier.ts`, `packages/provider-sdk/src/webhook-verifier.test.ts`
- Modify: `packages/provider-sdk/src/index.ts`
- Create: `packages/queue/src/provider-event-queue.ts`, `packages/queue/src/provider-event-queue.test.ts`
- Modify: `packages/queue/src/index.ts`
- Create: `apps/api/src/providers/provider-webhook.controller.ts`, `apps/api/src/providers/provider-webhook.e2e-spec.ts`
- Modify: `apps/api/src/app.module.ts`, `apps/api/src/main.ts`, `apps/api/src/platform/http-boundary.ts`
- Modify: `packages/test-kit/src/provider.ts`, `packages/test-kit/src/index.ts`

**Interfaces:** Implements separate Job/Attempt execution plus orthogonal cancellation transitions; discriminated recovery/cancellation handling; separate webhook-verification KMS path; post-signature Attempt-derived `VerifiedProjectScope`; opaque provider-event and provider-output-ingest Outbox routes; Media-only SafeFetch-proxy-to-quarantine ingest feeding Task 22's generic scan/moderation/mezzanine chain; attempt-level charge evidence; and the first browser-driven vertical-slice release gate. Webhook uniqueness is `(providerConfigId, externalEventId)` and tenant/job are derived only from Attempt.

**Integration Gate:** `A/G/M/T/Q` Modify; `C/D` N/A because they consume existing schemas/bootstrap; `W/R` N/A because their existing registrations are exercised end-to-end without modification.

- [ ] **Step 1: Write crash checkpoint and webhook-scope tests**

Use all three WorkerHarness checkpoints plus “bytes definitely not sent”. For idempotency-key mode, uncertain submit may re-call only the same Attempt/submissionKey when the provider contract explicitly permits it; client-reference mode calls recover first and only evidenced `definitively_absent` may create a new Attempt. `unknown`/`unsupported` enter reconciling with total submit count 1. Prove ordinary timeout/connection reset/ambiguous 5xx creates no second Attempt and performs no repeated submit, while poll/recover retry with jitter. Duplicate webhook/charge settles once; two genuinely billed Attempts both settle. Same externalEventId under two providerConfig IDs is independent; payload tenant spoof is ignored. Raw-body signature over the Task 02 bounded unparsed bytes, timestamp window and replay key are mandatory; only after verification may the Task 25 verified receipt/bootstrap return Attempt scope, and webhook ingress KMS cannot decrypt submit/API keys.

For Job cancellation, call adapter `cancel` once per cancellation operation. `accepted` moves only cancellation to `acknowledged` and continues poll; `already_terminal` validates/effects the supplied terminal status; `unsupported` leaves execution running; transport ambiguity writes `unknown` and does not auto-call cancel again. Only an adapter-declared/tested idempotent cancel contract permits operator retry with the same operation key. Race cancel response with success/webhook/bill and preserve terminal evidence/output/charges exactly once.

Provider success writes a DB fetch instruction plus opaque Media Outbox, never a URL in BullMQ and never opens a Generation Worker download socket. Media bootstraps the event, reads the scoped instruction, and fetches through the Task 02 SafeFetch proxy. Test output host differing from provider API host, redirect CDN, DNS rebind between validation/connect, private redirect, TLS hostname mismatch, expiry and process NetworkPolicy: valid bytes reach quarantine once; every unsafe case writes a recoverable ingest result and zero ready asset.

- [ ] **Step 2: Run RED**

Run: `pnpm --filter @comic-canvas/worker-generation test -- recovery.integration.test.ts`<br>
Expected: FAIL because JobProcessor is absent.

- [ ] **Step 3: Implement Attempt transitions, isolated webhook ingress and safe output ingest**

Persist unique submissionKey and billable-attempt subject before network. A transport retry under a provider idempotency contract stays in the same Attempt and reuses the key; a new Attempt is allowed only after definite non-send/non-acceptance evidence. Recovery handles `found | definitively_absent | unknown | unsupported` exhaustively. Cancellation consumes Task 23's `accepted | already_terminal | unknown | unsupported` union without treating request acknowledgement as Job terminal. Webhook ingress resolves only providerConfigId plus the `webhook-verification` secret through Task 23's narrow audited pre-signature function, verifies exact Task 02 raw bytes/timestamp/replay before JSON parsing, then calls Task 25's audited verified-receipt/bootstrap to derive Attempt tenant/project/job and transactionally writes a provider-event Outbox. BullMQ contains only eventId/route/hash; it cannot instantiate GenerationCredentialResolver or use payload scope.

For every provider output URL, Generation persists a scoped fetch instruction/expiry and writes an opaque Media Outbox in one transaction. Media owns the network fetch: the SafeFetch proxy performs per-hop DNS/public-IP validation, exact-IP connect with original-host TLS verification, redirect revalidation and byte/time caps, then streams directly into Task 22 quarantine. Never pass URL text in queue/log/S3/FFmpeg arguments. Expired URLs return a typed refresh-required receipt so Generation may poll provider for a new instruction without Media gaining provider credentials. The common Media chain scans, moderates, proxies, creates the 25fps CFR mezzanine and only then promotes ready. Each billed status/event calls idempotent `recordAttemptCharge`; late success after cancellation is retained as an unselected candidate, appends cancellation-late-bill adjustment if billed and never silently becomes current. Reconciler requires external task/billing evidence before terminal state.

- [ ] **Step 4: Verify crash, billing and webhook registrations**

Run: `pnpm --filter @comic-canvas/provider-sdk test -- webhook-verifier.test.ts && pnpm --filter @comic-canvas/queue test -- provider-event-queue.test.ts && pnpm --filter @comic-canvas/worker-generation test -- recovery.integration.test.ts cancellation.integration.test.ts webhook.integration.test.ts provider-output-dispatch.integration.test.ts billing-reconciliation.integration.test.ts && pnpm --filter @comic-canvas/worker-media test -- ingest-provider-output.test.ts transcode-cfr-mezzanine.test.ts && pnpm --filter @comic-canvas/api test:e2e -- provider-webhook.e2e-spec.ts`<br>
Expected: submit count never exceeds the recovery contract; ambiguous submissions create 0 second Attempts and auto-resubmit 0; every cancellation union branch and race is exact; only post-signature Attempt bootstrap succeeds; all billed Attempts reconcile once; Generation network fetch count is 0; Media/SafeFetch rejects rebinding/private/redirect/TLS spoof and accepted output reaches ready only after moderation+CFR mezzanine; webhook/KMS/queue/Media registrations are live. Task 27 adds project-stream observation and runs the complete vertical slice.

- [ ] **Step 5: Commit**

```bash
git add apps/worker-generation apps/worker-media/src/processors/ingest-provider-output.ts apps/worker-media/src/processors/ingest-provider-output.test.ts apps/worker-media/src/processor-registry.ts apps/worker-media/src/main.ts apps/api/src/providers apps/api/src/app.module.ts apps/api/src/main.ts apps/api/src/platform/http-boundary.ts packages/provider-sdk packages/queue packages/test-kit/src/provider.ts packages/test-kit/src/index.ts
git commit -m "feat: recover uncertain provider submissions"
```

---

### Task 27: 项目级 SSE、Job sequence 与完整任务托盘

**Files:**
- Modify: `packages/contracts/src/events.ts`, `packages/contracts/src/generation.ts`, `packages/contracts/src/index.ts`
- Create: `apps/api/src/events/events.module.ts`, `apps/api/src/events/events.controller.ts`, `apps/api/src/events/events.service.ts`, `apps/api/src/events/project-snapshot-contributors.ts`, `apps/api/src/events/events.e2e-spec.ts`
- Modify: `apps/api/src/app.module.ts`
- Create: `apps/web/src/tasks/task-tray.tsx`, `apps/web/src/tasks/task-store.ts`, `apps/web/src/tasks/sse-client.ts`, `apps/web/src/tasks/project-state-snapshot.ts`, `apps/web/src/tasks/task-state-matrix.test.tsx`
- Modify: `apps/web/src/workspace/workspace-shell.tsx`, `apps/web/src/app/router.tsx`
- Create: `tests/e2e/specs/vertical-slice.spec.ts`, `tests/e2e/specs/gateway-sse.spec.ts`
- Modify: `tests/e2e/support/drivers/project.driver.ts`, `tests/e2e/support/drivers/canvas.driver.ts`, `tests/e2e/support/drivers/generation.driver.ts`

**Interfaces:** `/v1/projects/:projectId/events` uses commit-ordered per-Project `eventId` for Last-Event-ID; Job updates separately carry monotonic `jobSequence` for per-Job CAS. Replay-gap recovery fetches `/v1/projects/:projectId/events/snapshot -> {watermark,jobs,attempts,assets,batches}` and atomically replaces reducer state. `ProjectEventSnapshotContributor` supplies each named slice; Task 27 registers Job/Attempt/Asset and an explicit empty Batch slice, and Task 28 replaces the Batch contributor. Poll fallback is project-scoped `/v1/projects/:projectId/generation/jobs?updatedAfter=`.

**Integration Gate:** `C/A/W` Modify; `D` N/A because it consumes Task 25 project stream/counter tables; `G` N/A because its registered processor emits existing events without a fixed-point change; `R/M/T/Q` N/A.

- [ ] **Step 1: Write interleaved job, reconnect and stale-update tests**

Interleave two Jobs in one Project and another Job in a different Project; no stream may leak the latter. Hold transaction A after work but before counter allocation, let B approach commit, then release in reverse scheduling order and assert event IDs follow actual commit order with no delayed lower sequence. Run the client through Task 02's real TLS Gateway dedicated SSE policy for more than 10 minutes: every 15s heartbeat is observed without proxy batching, connection memory stays bounded, and the stream is not cut by route/LB timeout. Disconnect/resume by Last-Event-ID through the Gateway and receive later events exactly once. A negative rendered-policy fixture with buffering or timeout below 15m fails. Force cursor older than replay retention: server returns `EVENT_REPLAY_GAP` plus snapshot endpoint/watermark, client atomically replaces state and resumes after watermark without merging stale rows. A lower jobSequence cannot overwrite a higher state. Cross-tenant and same-tenant/no-Project-membership SSE are denied; polling produces the same reducer result. Render every Job execution state crossed with `none/requested/acknowledged/unsupported/unknown`, multiple Attempt histories and empty Batch. Job never renders `partial`; cancellation acknowledgement never replaces the authoritative execution state or claims canceled without terminal provider evidence.

- [ ] **Step 2: Run RED**

Run: `pnpm --filter @comic-canvas/api test:e2e -- events.e2e-spec.ts`<br>
Expected: FAIL because `/v1/projects/:projectId/events` and its snapshot endpoint are not registered.

- [ ] **Step 3: Implement replay window and task UI state matrix**

Allocate each Project event counter under row lock in the event's business transaction and hold it through commit; never preallocate a sequence outside that transaction. Persist replay rows with bounded retention, heartbeat every 15s, backoff with jitter, then poll after three failures. A replay gap never falls through to ordinary reconnect: fetch snapshot, replace, store watermark, subscribe. The snapshot transaction takes a lock that conflicts with counter updates, captures the repeatable-read view and current watermark, runs every contributor in that same transaction, then releases; therefore any later committed state event has `eventId > watermark`. Before Task 28, `batches` is deliberately `[]`, not a query to a future table. Tray groups Batch summary, Job row and expandable Attempt lineage as distinct objects. Job row shows pending/queued/dispatching/running/reconciling/succeeded/failed/canceled plus a separate cancellation label/action; Batch alone may show partial/pausing/paused/canceling. It shows estimate/reserve/actual, actionable errors and no fabricated percentage.

- [ ] **Step 4: Verify server and UI reducers**

Run: `pnpm --filter @comic-canvas/api test:e2e -- events.e2e-spec.ts && pnpm --filter @comic-canvas/web test -- task-state-matrix.test.tsx && pnpm exec playwright test tests/e2e/specs/gateway-sse.spec.ts tests/e2e/specs/vertical-slice.spec.ts`<br>
Expected: project isolation and commit ordering hold; the real TLS-Gateway SSE stream delivers unbuffered 15s heartbeats for more than 10 minutes without premature timeout, ordinary Last-Event-ID reconnect loses 0 events, gap reset converges to snapshot+watermark, stale jobSequence overwrites 0 states, every Job/Attempt/cancellation state/action combination renders without Job `partial` or false canceled. The browser E2E logs in, creates project, imports source, creates Scene/Shot and image node, confirms Fake estimate, observes project SSE result/quarantine moderation/proxy/mezzanine, selects it through Task 25 baseline Selection, refreshes/offline-recovers, and verifies a second Viewer context sees the same durable Canvas read-only. This gate must pass before Task 28-50.

- [ ] **Step 5: Commit**

```bash
git add packages/contracts apps/api/src/events apps/api/src/app.module.ts apps/web/src/tasks apps/web/src/workspace/workspace-shell.tsx apps/web/src/app/router.tsx tests/e2e/specs/gateway-sse.spec.ts tests/e2e/specs/vertical-slice.spec.ts tests/e2e/support/drivers
git commit -m "feat: stream durable job state to task tray"
```

---

### Task 28: Batch estimate、控制、部分成功与优先级

**Files:**
- Create: `packages/contracts/src/batches.ts`, `packages/contracts/src/batches.contract.test.ts`
- Modify: `packages/contracts/src/index.ts`
- Create: `packages/db/src/schema/batches.ts`, `packages/db/migrations/0010_generation_batches.sql`
- Modify: `packages/db/src/schema/index.ts`
- Create: `apps/api/src/generation/batches.controller.ts`, `apps/api/src/generation/batches.service.ts`, `apps/api/src/generation/batches.e2e-spec.ts`
- Modify: `apps/api/src/generation/generation.module.ts`, `apps/api/src/app.module.ts`
- Modify: `apps/api/src/events/project-snapshot-contributors.ts`
- Create: `packages/queue/src/batch-control-queue.ts`, `packages/queue/src/batch-control-queue.test.ts`
- Modify: `packages/queue/src/index.ts`
- Create: `apps/worker-generation/src/batch-control-consumer.ts`, `apps/worker-generation/src/batch-control-consumer.test.ts`
- Modify: `apps/worker-generation/src/main.ts`
- Create: `apps/web/src/generation/batch-confirmation.tsx`, `apps/web/src/generation/batch-summary.tsx`, `apps/web/src/generation/batch-controls.tsx`
- Create: `apps/web/src/generation/batch-controls.test.tsx`
- Modify: `apps/web/src/app/router.tsx`, `apps/web/src/tasks/project-state-snapshot.ts`

**Interfaces:** Produces create, `pause`, `resume`, `cancel`, `retry-failed`, `PATCH priority`; Batch aggregate states are `idle/running/pausing/paused/canceling/partial/succeeded/failed/canceled` and never assigned to a single Job.

**Integration Gate:** `C/D/A/W/G/Q` Modify; `R/M/T` N/A.

- [ ] **Step 1: Write transition/schema introspection tests and create legal comment-only `0010`**

Pause CASes `running -> pausing` and immediately prevents any new Dispatcher claim for this Batch; running Jobs continue, pending/queued undispatched Jobs release reservation and become paused members, and Batch becomes `paused` only when no dispatch race remains. Resume re-runs current capability/membership/rights/moderation/input/head/model/currency/price checks, computes a new estimate and reservations, and requires another confirmation for any diff before `paused -> running`. Cancel CASes to `canceling`, atomically cancels undispatched members and uses Task 25 cancellation command for running members; only after every member is terminal may it become `canceled`. Retry-failed creates new Jobs with retryOfJobId; success survives partial failure; `partial` applies only to mixed results without a user cancellation; priority stays inside project policy bounds.

- [ ] **Step 2: Run RED**

Run: `pnpm --filter @comic-canvas/db test:migration -- 0010_generation_batches.sql`<br>
Expected: the comment-only migration loads, then FAILS `GENERATION_BATCH_TABLE_MISSING`; no failure comes from a missing migration file.

- [ ] **Step 3: Implement aggregate CAS and explicit confirmation UI**

Confirmation lists total/compatible/skipped/missing/model/candidates/concurrency/estimate ceiling/currency/retention/failure policy. Each control writes state/audit/control Outbox plus a Project event in one command transaction; Q routes it and G applies it with permanent receipt and per-Job CAS. Dispatcher checks the Batch dispatch permit in the same claim transaction, closing pause-vs-dispatch races. Pausing releases only undispatched reserves; resume creates new estimate/reservation operations after revalidation and never resurrects expired reserve. Register the Batch snapshot contributor and Web reducer so replay-gap replacement restores exact aggregate/member/reservation/cancellation state. No success rollback and no automatic provider switch.

- [ ] **Step 4: Verify controls, costs and module registration**

Run: `pnpm --filter @comic-canvas/db test:migration -- 0010_generation_batches.sql && pnpm --filter @comic-canvas/queue test -- batch-control-queue.test.ts && pnpm --filter @comic-canvas/worker-generation test -- batch-control-consumer.test.ts && pnpm --filter @comic-canvas/api test:e2e -- batches.e2e-spec.ts && pnpm --filter @comic-canvas/web test -- batch-controls.test.tsx`<br>
Expected: every transition returns exact state/action contract; pause blocks 100% new claims, releases only undispatched reserves and reaches paused after running drain; changed resume requires re-confirmation/new reserve; canceling waits for terminal members; duplicate control has one effect/receipt; Q/G registrations are live; replay-gap snapshot restores every Batch without stale merge; skipped reasons, partial/canceled totals and costs are exact.

- [ ] **Step 5: Commit**

```bash
git add packages/contracts packages/db packages/queue apps/api/src/generation apps/api/src/events/project-snapshot-contributors.ts apps/api/src/app.module.ts apps/worker-generation apps/web/src/generation apps/web/src/tasks/project-state-snapshot.ts apps/web/src/app/router.tsx
git commit -m "feat: control partial generation batches"
```

---

### Task 29: 真实主文本模型适配器

**Files:**
- Create: `apps/worker-generation/src/adapters/primary-text.adapter.ts`, `apps/worker-generation/src/adapters/primary-text.contract.test.ts`, `apps/worker-generation/src/adapters/primary-text.staging.test.ts`
- Create: `tests/fixtures/providers/text/success.request.json`, `tests/fixtures/providers/text/success.response.json`, `tests/fixtures/providers/text/recover.response.json`, `tests/fixtures/providers/text/error.response.json`, `tests/fixtures/providers/text/webhook.json`
- Modify: `apps/worker-generation/src/adapter-registry.ts`, `apps/worker-generation/src/main.ts`
- Modify: `docs/adr/0005-providers-region-and-retention.md`

**Interfaces:** Implements provider-generic `text-structured-output` using the exact provider/model/auth/region/recovery decision signed in ADR-0005; it accepts a caller-supplied JSON Schema and returns schema-valid JSON plus provider lineage. Task 30 supplies and owns `StoryParseProposal`; this task does not import that future domain type.

**Integration Gate:** `G` Modify register real text adapter; `C/D/A/W/R/M/T/Q` N/A because this adapter only consumes their existing contracts and registrations.

- [ ] **Step 1: Write provider contract and schema-adherence tests**

Run the shared suite against recorded HTTP fixtures with a local generic nested-object/array JSON Schema; require schema adherence, one bounded repair request for malformed JSON, normalized policy/limit errors, exact estimate and all documented recovery variants. Assert the adapter has no import from future narrative contracts; Task 30 later tests Line/source-span semantics.

- [ ] **Step 2: Run RED**

Run: `pnpm --filter @comic-canvas/worker-generation test -- primary-text.contract.test.ts`<br>
Expected: FAIL because the real adapter is not registered.

- [ ] **Step 3: Implement the signed provider adapter**

Use GenerationCredentialResolver, provider client token/lookup exactly as evidenced, abort/timeouts, no prompt logging and caller-supplied output JSON Schema. `submit` follows the Task 23 ambiguity rules; a timeout/ambiguous 5xx without provider idempotency enters recovery/reconciling rather than generic retry. A second malformed response fails non-retryable `PROVIDER_INVALID_STRUCTURED_OUTPUT`; it never loops repair or substitutes Fake output.

- [ ] **Step 4: Verify recorded and authorized live smoke**

Run: `pnpm --filter @comic-canvas/worker-generation test -- primary-text.contract.test.ts`<br>
Expected: recorded suite PASS.<br>
Run: `pnpm exec cross-env PROVIDER_SMOKE=1 pnpm --filter @comic-canvas/worker-generation test:staging -- primary-text.staging.test.ts`<br>
Expected: one rights-cleared fixture yields a valid proposal, cost/region evidence is recorded and fixture text appears 0 times in logs.

- [ ] **Step 5: Commit**

```bash
git add apps/worker-generation/src/adapters apps/worker-generation/src/adapter-registry.ts apps/worker-generation/src/main.ts tests/fixtures/providers/text docs/adr/0005-providers-region-and-retention.md
git commit -m "feat: connect contracted structured text provider"
```

## Wave D：剧本、设定与镜头媒体

### Task 30: 剧本 revision、结构化 diff 与专用编辑器

**Files:**
- Modify: `packages/contracts/src/narrative.ts`, `packages/contracts/src/narrative.contract.test.ts`
- Modify: `packages/contracts/src/index.ts`
- Modify: `packages/db/src/schema/narrative.ts`
- Create: `packages/db/migrations/0011_narrative.sql`
- Modify: `packages/db/src/schema/index.ts`
- Modify: `apps/api/src/narrative/narrative.module.ts`, `apps/api/src/narrative/scripts.controller.ts`, `apps/api/src/narrative/scripts.service.ts`, `apps/api/src/narrative/narrative.e2e-spec.ts`
- Create: `apps/api/src/narrative/story-commands.ts`, `apps/api/src/narrative/parse-proposals.service.ts`, `apps/api/src/narrative/script-diff.service.ts`
- Modify: `apps/api/src/app.module.ts`, `apps/api/src/projects/episode-lifecycle.registry.ts`
- Create: `apps/web/src/story/script-editor.tsx`, `apps/web/src/story/scene-outline.tsx`, `apps/web/src/story/script-source-view.tsx`, `apps/web/src/story/parse-diff-panel.tsx`, `apps/web/src/story/revision-conflict-dialog.tsx`, `apps/web/src/story/speaker-mapping.tsx`
- Modify: `apps/web/src/app/router.tsx`
- Modify: `packages/test-kit/src/story.ts`, `packages/test-kit/src/index.ts`, `tests/e2e/support/drivers/story.driver.ts`
- Create: `tests/e2e/specs/script-editing.spec.ts`

**Interfaces:** Extends Task 10's complete Script aggregate with immutable `StoryParseProposal` and `StoryDiffDecision`; adds `POST /v1/scripts/parse` and `POST /v1/scripts/:scriptId/apply-diff`; and implements editor commands split/merge/reorder/move/changeSpeaker/save with `expectedHeadRevisionId+operationId`. The existing Script Episode-copy contributor/catalog row remains authoritative and is expanded only for new proposal records, which are excluded.

**Integration Gate:** `C/D/A/W/T` Modify; `G` N/A because the Job API consumes Task 29's registered adapter; `R` N/A because it receives domain projections through its existing registry; `M/Q` N/A.

- [ ] **Step 1: Write ID/schema introspection tests and create legal comment-only `0011`**

Across 1000 generated split/merge/reorder/move operations, unaffected entity IDs change 0 and Line IDs survive speaker/text edits. Source bytes/hash and all Task 10 Script revisions never change. A stale base returns 409 with base/head/local three-way data. Two calls reuse one proposal operationId. TXT/Markdown >20k chars or >2MB is rejected before provider use. The exact Story JSON Schema is passed through Task 29's generic text adapter and source spans/Line IDs are validated here. Production Story contracts and Task 03 TestStory protocols are structurally compatible. Migration introspection targets parse-proposal/diff-decision tables, not ScriptRevision that already exists in 0003.

- [ ] **Step 2: Run RED**

Run: `pnpm --filter @comic-canvas/db test:migration -- 0011_narrative.sql`<br>
Expected: the comment-only migration loads on top of Task 10 baseline, then FAILS `STORY_PARSE_PROPOSAL_TABLE_MISSING`; it must not fail because Script/Revision baseline tables or the migration file are absent.

- [ ] **Step 3: Implement domain commands, parse proposal and full-screen editor**

Parse creates a text Generation Job using the Task 29 generic schema and an immutable proposal against `baseScriptRevisionId`; apply accepts/edits/ignores individual operations inside `withProjectWriteFence`, appends one ScriptRevision and writes projection Outbox. Split keeps original Scene for first half, merge tombstones source Scene, Lines keep IDs. Speaker references canonical Character; alias bulk apply previews count/conflicts. Extend the Task 10 copy catalog to explicitly exclude proposals/decisions while copied Script revisions retain source provenance and receive new local IDs. Local draft saves every 2 seconds.

- [ ] **Step 4: Verify API, properties, performance and UX**

Run: `pnpm --filter @comic-canvas/db test:migration -- 0011_narrative.sql && pnpm --filter @comic-canvas/api test:e2e -- narrative.e2e-spec.ts && pnpm exec playwright test tests/e2e/specs/script-editing.spec.ts`<br>
Expected: 20k-char first-edit P95 <=1.5s, input P95 <100ms, durable ack P95 <=2s, crash loses 0 confirmed chars and 12-shot edit task preserves source/hash.

- [ ] **Step 5: Commit**

```bash
git add packages/contracts packages/db apps/api/src/narrative apps/api/src/projects/episode-lifecycle.registry.ts apps/api/src/app.module.ts apps/web/src/story apps/web/src/app/router.tsx packages/test-kit tests/e2e
git commit -m "feat: edit revisioned comic scripts without id churn"
```

---

### Task 31: 设定圣经、不可变版本与权威 ReferenceBinding

**Files:**
- Create: `packages/contracts/src/bibles.ts`, `packages/contracts/src/references.ts`, `packages/contracts/src/bibles.contract.test.ts`
- Modify: `packages/contracts/src/index.ts`
- Create: `packages/db/src/schema/bibles.ts`, `packages/db/migrations/0012_bibles.sql`
- Modify: `packages/db/src/schema/index.ts`
- Create: `apps/api/src/bibles/bibles.module.ts`, `apps/api/src/bibles/bibles.controller.ts`, `apps/api/src/bibles/bibles.service.ts`, `apps/api/src/bibles/references.service.ts`, `apps/api/src/bibles/bibles.e2e-spec.ts`
- Modify: `apps/api/src/app.module.ts`, `apps/api/src/projects/episode-lifecycle.registry.ts`
- Create: `apps/web/src/bibles/bibles-workspace.tsx`, `apps/web/src/bibles/version-history.tsx`, `apps/web/src/bibles/reference-binding-editor.tsx`
- Modify: `apps/web/src/app/router.tsx`
- Modify: `packages/test-kit/src/story.ts`, `packages/test-kit/src/index.ts`, `tests/e2e/support/drivers/bibles.driver.ts`
- Create: `tests/e2e/specs/bibles.spec.ts`

**Interfaces:** Produces Character/Location/Prop/StyleBible immutable versions and `ReferenceBinding {bindingId,subjectId,targetResourceId,follow,pinnedVersionId?,resolvedVersionId}`.

**Integration Gate:** `C/D/A/W/T` Modify; `R` N/A because it uses the existing character/location/prop/style renderer; `G/M/Q` N/A.

- [ ] **Step 1: Write binding/schema introspection tests and create legal comment-only `0012`**

Pinned requires exact version and never follows new versions; latest forbids pinnedVersionId and resolves current head. Creating a version never mutates prior bytes/fields. Yjs reference edge with wrong/missing bindingId is ignored and corrected by server projection, never made authoritative.

- [ ] **Step 2: Run RED**

Run: `pnpm --filter @comic-canvas/db test:migration -- 0012_bibles.sql`<br>
Expected: the comment-only migration loads, then FAILS `REFERENCE_BINDING_TABLE_MISSING`; no failure comes from a missing file.

- [ ] **Step 3: Implement version APIs, rights links and projections**

Each version records canonical identity, appearance/location/prop continuity, approved references, source assets and rights/moderation records. API writes Binding and contiguous projection event inside `withProjectWriteFence`; UI distinguishes pinned/latest/current/approved and previews bulk scope. Register an Episode copy contributor that reuses project-level resource identities but copies Episode-scoped Binding subjects with new IDs and exact target/follow policy.

- [ ] **Step 4: Verify migration and browser version flow**

Run: `pnpm --filter @comic-canvas/db test:migration -- 0012_bibles.sql && pnpm --filter @comic-canvas/api test:e2e -- bibles.e2e-spec.ts && pnpm exec playwright test tests/e2e/specs/bibles.spec.ts`<br>
Expected: all four resource kinds create/resolve versions, exact refs survive refresh, no Yjs field can overwrite domain state.

- [ ] **Step 5: Commit**

```bash
git add packages/contracts packages/db apps/api/src/bibles apps/api/src/app.module.ts apps/api/src/projects/episode-lifecycle.registry.ts apps/web/src/bibles apps/web/src/app/router.tsx packages/test-kit/src/story.ts packages/test-kit/src/index.ts tests/e2e/support/drivers/bibles.driver.ts tests/e2e/specs/bibles.spec.ts
git commit -m "feat: version comic bibles and authoritative references"
```

---

### Task 32: Prompt Compiler、联合影响图与 stale 确认

**Files:**
- Create: `packages/provider-sdk/src/prompt-compiler.ts`, `packages/provider-sdk/src/prompt-compiler.test.ts`
- Modify: `packages/provider-sdk/src/index.ts`
- Create: `apps/api/src/impact/impact.module.ts`, `apps/api/src/impact/impact-graph.ts`, `apps/api/src/impact/stale.service.ts`, `apps/api/src/impact/impact.controller.ts`, `apps/api/src/impact/impact.e2e-spec.ts`
- Create: `apps/api/src/impact/impact-contributor.registry.ts`
- Modify: `apps/api/src/app.module.ts`, `apps/api/src/generation/generation-input-contributors.ts`, `apps/api/src/generation/generation.service.ts`
- Create: `apps/web/src/impact/impact-panel.tsx`, `apps/web/src/impact/stale-overlay.tsx`, `apps/web/src/impact/regeneration-confirmation.tsx`
- Create: `apps/web/src/impact/impact-panel.test.tsx`
- Create: `apps/web/src/composer/composer-panel.tsx`, `apps/web/src/composer/proposal-diff.tsx`, `apps/web/src/composer/composer-history.tsx`
- Modify: `apps/web/src/app/router.tsx`, `apps/web/src/workspace/workspace-shell.tsx`, `packages/canvas-renderer-reactflow/src/node-registry.tsx`

**Interfaces:** Produces deterministic `compilePrompt(ShotSpec, ResolvedReferences, PromptOverride): CompiledPrompt`, registers it with Task 25's GenerationInputContributorRegistry, and produces extensible `ImpactContributorRegistry` plus `analyzeImpact(change): ImpactReport`. Composer creates version-bound proposals/diffs only; paid generation still requires the existing estimate/confirm flow.

**Integration Gate:** `A/W/R` Modify; `C` N/A because it consumes existing Job/reference contracts; `D` N/A because it uses `resource_invalidations` from 0012; `G` N/A because it consumes the already-frozen Job snapshot without importing compiler code; `M/T/Q` N/A.

- [ ] **Step 1: Write deterministic compiler and combined-graph tests**

Same exact inputs yield the same prompt hash and Task 25 Job stores that hash after the compiler contributor is registered. With only currently available contributors, changing Character version reaches PG Bindings -> Yjs data edges -> historical Job lineage according to follow policy; association edge does not propagate. No Timeline/Approval/Manifest symbol is imported yet. Missing contributor registrations fail a completeness test once their owning module exists. Analysis and Composer proposal create 0 Jobs/reservations until explicit estimate/confirm.

- [ ] **Step 2: Run RED**

Run: `pnpm --filter @comic-canvas/provider-sdk test -- prompt-compiler.test.ts`<br>
Expected: FAIL because `compilePrompt` is absent.

- [ ] **Step 3: Implement compiler snapshots and impact UI**

Normalize project/shot/character/location/prop/style fields in a documented order, include adapter/template version and negative prompt, and register the exact compilation snapshot with generation input resolution. Base impact report groups selected/future scene/all currently registered references and estimates only after user chooses scope. Composer reads selected versioned context, shows structured proposal/diff, records accepted/rejected items and never equates Send with Generate.

- [ ] **Step 4: Verify no-side-effect analysis and explicit regeneration**

Run: `pnpm --filter @comic-canvas/provider-sdk test -- prompt-compiler.test.ts && pnpm --filter @comic-canvas/api test:e2e -- impact.e2e-spec.ts && pnpm --filter @comic-canvas/web test -- impact-panel.test.tsx`<br>
Expected: exact currently knowable affected IDs, deterministic compiler snapshot reaches new Jobs, Composer acceptance changes only selected proposal items, and 0 charges occur before confirm. Later Task 34/39/44 tests expand the same report with Approval/Timeline/Manifest effects.

- [ ] **Step 5: Commit**

```bash
git add packages/provider-sdk apps/api/src/impact apps/api/src/generation apps/api/src/app.module.ts apps/web/src/impact apps/web/src/composer apps/web/src/workspace/workspace-shell.tsx apps/web/src/app/router.tsx packages/canvas-renderer-reactflow/src/node-registry.tsx
git commit -m "feat: compile prompts and preview stale impact"
```

---

### Task 33: 真实主图片模型适配器

**Files:**
- Create: `apps/worker-generation/src/adapters/primary-image.adapter.ts`, `apps/worker-generation/src/adapters/primary-image.contract.test.ts`, `apps/worker-generation/src/adapters/primary-image.staging.test.ts`
- Create: `tests/fixtures/providers/image/success.request.json`, `tests/fixtures/providers/image/success.response.json`, `tests/fixtures/providers/image/recover.response.json`, `tests/fixtures/providers/image/error.response.json`, `tests/fixtures/providers/image/webhook.json`
- Modify: `apps/worker-generation/src/adapter-registry.ts`, `apps/worker-generation/src/main.ts`
- Modify: `docs/adr/0005-providers-region-and-retention.md`

**Interfaces:** Implements the signed ADR-0005 image capability: text plus approved reference images -> immutable image candidates, with exact dimensions/count/seed/price/recovery behavior.

**Integration Gate:** `G` Modify; `C/D/A/W/R/M/T/Q` N/A because this adapter only consumes their existing contracts and registrations.

- [ ] **Step 1: Write shared contract and reference-boundary tests**

Recorded fixtures cover 1-4 candidates, reference order, size/seed capability, moderation rejection, rate limit, timeout, cancel, billed late result and recover. Unsupported local-edit/multi-angle parameters fail validation before submit.

- [ ] **Step 2: Run RED**

Run: `pnpm --filter @comic-canvas/worker-generation test -- primary-image.contract.test.ts`<br>
Expected: FAIL because primary image adapter is absent.

- [ ] **Step 3: Implement the provider selected in ADR-0005**

Resolve only ready/scanned signed references, use documented submission recovery, return the provider output locator only to Task 26's shared SafeFetch-to-quarantine ingest, normalize cost/errors and never log prompt or URLs. Adapter never fetches/follows output URLs itself; provider-specific JSON stays inside adapter.

- [ ] **Step 4: Verify recorded plus opt-in staging smoke**

Run: `pnpm --filter @comic-canvas/worker-generation test -- primary-image.contract.test.ts`<br>
Expected: recorded suite PASS.<br>
Run: `pnpm exec cross-env PROVIDER_SMOKE=1 pnpm --filter @comic-canvas/worker-generation test:staging -- primary-image.staging.test.ts`<br>
Expected: one rights-cleared request yields ready quarantined output with recorded cost/recovery evidence.

- [ ] **Step 5: Commit**

```bash
git add apps/worker-generation/src/adapters apps/worker-generation/src/adapter-registry.ts apps/worker-generation/src/main.ts tests/fixtures/providers/image docs/adr/0005-providers-region-and-retention.md
git commit -m "feat: connect contracted image provider"
```

---

### Task 34: 图片候选、Selection、Approval 与非破坏恢复

**Files:**
- Modify: `packages/contracts/src/selections.ts`
- Create: `packages/contracts/src/selections.contract.test.ts`
- Modify: `packages/contracts/src/index.ts`
- Modify: `packages/db/src/schema/selections.ts`
- Create: `packages/db/src/schema/triage.ts`
- Create: `packages/db/migrations/0013_asset_selection.sql`
- Modify: `packages/db/src/schema/index.ts`
- Modify: `apps/api/src/selections/selections.module.ts`, `apps/api/src/selections/selections.controller.ts`, `apps/api/src/selections/selections.service.ts`, `apps/api/src/selections/selections.e2e-spec.ts`, `apps/api/src/impact/impact-contributor.registry.ts`
- Modify: `apps/api/src/app.module.ts`
- Create: `apps/web/src/assets/candidate-strip.tsx`, `apps/web/src/assets/candidate-compare.tsx`, `apps/web/src/assets/approval-actions.tsx`
- Modify: `apps/web/src/assets/selection-actions.tsx`
- Modify: `apps/web/src/app/router.tsx`, `packages/canvas-renderer-reactflow/src/node-registry.tsx`
- Create: `tests/e2e/specs/candidate-selection.spec.ts`

**Interfaces:** Extends Task 25 baseline Selection with Approval/Rejection records, richer history/current pointers and the Approval impact contributor; restore creates a new Selection record, never edits history.

**Integration Gate:** `C/D/A/W/R` Modify; `G` N/A because its existing output lineage is consumed unchanged; `M/T/Q` N/A.

- [ ] **Step 1: Write orthogonal-state/schema introspection tests and create legal comment-only `0013`**

Selecting does not approve; selecting/approving require their separate capabilities plus Project membership; approving requires exact current version. Restoring v1 after v2 appends selection #3, stale leaves Approval record but validity outdated, two concurrent selects CAS one current pointer and retain both audit attempts. Changing an upstream version reaches current Selection/Approval through Task 32's registered contributor without importing future Timeline/Manifest types. Introspection also requires reserved tenant-scoped `triage_sessions`, `triage_items` and append-only `triage_actions`: unique session snapshot/hash, unique `(triageSnapshotId,shotId)`, candidateSetHash, expected Selection/Approval heads, cursor/filter/preferences, action operationId and completion/compensation links. Task 35 exposes behavior without adding migration 0021.

- [ ] **Step 2: Run RED**

Run: `pnpm --filter @comic-canvas/db test:migration -- 0013_asset_selection.sql`<br>
Expected: the comment-only migration loads on Task 25 baseline, then FAILS `APPROVAL_TABLE_MISSING`; baseline Selection tables must already exist.

- [ ] **Step 3: Implement APIs and candidate comparison**

Extend baseline APIs under `withProjectWriteFence`; support side-by-side, overlay slider and synchronized zoom; separate command labels “设为当前” and “批准当前版本”. Store Job/input lineage and late-canceled marker. Rejection/tag records do not delete assets. Register Approval/Selection traversal with ImpactContributorRegistry so stale validity is computed, not rewritten. Migration 0013 also creates the reserved Triage persistence/constraints described in Step 1; no controller accesses them before Task 35.

- [ ] **Step 4: Verify history and exact versions**

Run: `pnpm --filter @comic-canvas/db test:migration -- 0013_asset_selection.sql && pnpm --filter @comic-canvas/api test:e2e -- selections.e2e-spec.ts && pnpm exec playwright test tests/e2e/specs/candidate-selection.spec.ts`<br>
Expected: history remains append-only, candidate comparisons share zoom, stale approved versions block downstream gate.

- [ ] **Step 5: Commit**

```bash
git add packages/contracts packages/db apps/api/src/selections apps/api/src/impact/impact-contributor.registry.ts apps/api/src/app.module.ts apps/web/src/assets apps/web/src/app/router.tsx packages/canvas-renderer-reactflow/src/node-registry.tsx tests/e2e/specs/candidate-selection.spec.ts
git commit -m "feat: choose and approve immutable image candidates"
```

---

### Task 35: Storyboard、候选 Triage 与高吞吐审片

**Files:**
- Create: `packages/contracts/src/storyboard.ts`, `packages/contracts/src/storyboard.contract.test.ts`
- Modify: `packages/contracts/src/index.ts`
- Create: `apps/api/src/storyboard/storyboard.module.ts`, `apps/api/src/storyboard/storyboard.controller.ts`, `apps/api/src/storyboard/storyboard.service.ts`, `apps/api/src/storyboard/triage.controller.ts`, `apps/api/src/storyboard/triage.service.ts`, `apps/api/src/storyboard/storyboard.e2e-spec.ts`
- Modify: `apps/api/src/app.module.ts`
- Create: `apps/web/src/storyboard/storyboard-page.tsx`, `apps/web/src/storyboard/shot-list.tsx`, `apps/web/src/storyboard/contact-sheet.tsx`, `apps/web/src/storyboard/animatic.tsx`, `apps/web/src/storyboard/triage-queue.tsx`, `apps/web/src/storyboard/triage-shortcuts.ts`, `apps/web/src/storyboard/batch-review-dialog.tsx`
- Create: `apps/web/src/storyboard/triage-queue.test.tsx`
- Modify: `apps/web/src/app/router.tsx`
- Modify: `tests/e2e/support/fixtures.ts`, `tests/e2e/support/drivers/storyboard.driver.ts`
- Create: `tests/e2e/specs/candidate-triage.spec.ts`

**Interfaces:** Produces ordered Episode->Scene->Shot views; immutable `TriageSnapshot`; persisted `TriageSession` preferences/cursor; item key `(triageSnapshotId,shotId)`; deterministic abnormal queue; and atomic per-shot/batch commands carrying `triageSnapshotId+candidateSetHash+expectedSelectionHead+expectedApprovalHead+operationId`.

**Integration Gate:** `C/A/W` Modify; `D` N/A because it consumes Task 34's triage schema; `R/G/M/T/Q` N/A.

- [ ] **Step 1: Write ordering, shortcut and batch safeguard tests**

Creating a session freezes filters, ordered Shot IDs, per-Shot ordered candidate IDs/exact versions, each `candidateSetHash`, global snapshot hash and mode `selection | selection-and-approval`. Merge every abnormal reason for one Shot into one item and sort by highest severity `Blocker -> failed -> stale -> unreviewed -> Shot.orderKey -> shotId`; a failed Shot with zero candidate remains visible. J/K, 1-4, S/A/R/T work only outside inputs and resume exact session/cursor after refresh.

The completion predicate is server-owned and mode-specific. `selection` completes only when a CAS action makes an exact snapshot candidate current; `selection-and-approval` additionally requires Approval of that same current version with no stale/Blocker/rights/moderation failure. A zero-candidate/failed item cannot be completed by retry or label; only an explicit defer record with reason/owner/nextAction/dueAt may move it to deferred-complete, and a new candidate invalidates that disposition into open. Every action compares candidate hash plus both heads; any concurrent head/candidate change returns 409 with refreshed diff, retains focus and writes zero decision. Two clients racing allow one head winner.

Undo appends a compensation linked to the action; it never deletes history. If a Gate, Timeline or Export already depends on the Selection/Approval, ordinary undo is blocked and requires a new review action. Batch acts only on explicit checked items, writes one record per Shot, skips no-selection/stale/Blocker/rights/moderation cases with stable reasons, and >10 requires typed count. Batch rejection/tag never deletes bytes; batch compensation follows the same dependency rule.

- [ ] **Step 2: Run RED**

Run: `pnpm --filter @comic-canvas/web test -- triage-queue.test.tsx`<br>
Expected: FAIL because triage queue reducer is absent.

- [ ] **Step 3: Implement virtualized views and next-abnormal flow**

List/contact/Animatic read Shot order only, never canvas position. Build snapshot/session/items from Task 34 tables under the project fence; snapshot membership/hashes never mutate, while cursor/preferences use their own revision CAS. Per-item and batch actions call Selection/Approval services in the same command transaction and then append triage action/completion records. Candidate/head change returns a rebase payload, never a last-write-wins overwrite. Complete/defer advances to the next open abnormal item and offers only valid compensating undo. Persist queue filters, cursor and decisions server-side; mark stale candidates visibly in every comparison mode.

- [ ] **Step 4: Verify throughput fixture and recovery**

Run: `pnpm --filter @comic-canvas/api test:e2e -- storyboard.e2e-spec.ts && pnpm exec playwright test tests/e2e/specs/candidate-triage.spec.ts`<br>
Expected: the golden 12 shots x 4 candidates selection-and-approval task completes within 15 minutes (`>=48` approved shots/hour) with wrong Selection count 0 and wrong Approval count 0; a separate `>=100` gold-standard decision corpus has `triage_error_rate <=1%`; two-client CAS overwrites 0, failed-empty items cannot fake completion, dependent undo is blocked, refresh restores session/cursor/decisions in <=2s and 200-item next/previous P95 <100ms.

- [ ] **Step 5: Commit**

```bash
git add packages/contracts apps/api/src/storyboard apps/api/src/app.module.ts apps/web/src/storyboard apps/web/src/app/router.tsx tests/e2e/support/fixtures.ts tests/e2e/support/drivers/storyboard.driver.ts tests/e2e/specs/candidate-triage.spec.ts
git commit -m "feat: triage storyboard candidates efficiently"
```

---

### Task 36: 真实主视频模型适配器

**Files:**
- Create: `apps/worker-generation/src/adapters/primary-video.adapter.ts`, `apps/worker-generation/src/adapters/primary-video.contract.test.ts`, `apps/worker-generation/src/adapters/primary-video.staging.test.ts`
- Create: `tests/fixtures/providers/video/success.request.json`, `tests/fixtures/providers/video/success.response.json`, `tests/fixtures/providers/video/recover.response.json`, `tests/fixtures/providers/video/error.response.json`, `tests/fixtures/providers/video/webhook.json`
- Modify: `apps/worker-generation/src/adapter-registry.ts`, `apps/worker-generation/src/main.ts`
- Modify: `docs/adr/0005-providers-region-and-retention.md`

**Interfaces:** Implements MVP single-reference-image video capability with duration/fps/resolution/motion/seed if supported; no first-last-frame or lip-sync surface.

**Integration Gate:** `G` Modify; `C/D/A/W/R/M/T/Q` N/A because this adapter only consumes their existing contracts and registrations.

- [ ] **Step 1: Write capability, recovery and billing tests**

Reject first-last-frame/lip-sync parameters, unready reference and unsupported duration before submit. Recorded cases cover progress/poll/webhook, content refusal, timeout, cancel, late billed output and each documented recovery mode.

- [ ] **Step 2: Run RED**

Run: `pnpm --filter @comic-canvas/worker-generation test -- primary-video.contract.test.ts`<br>
Expected: FAIL because primary video adapter is absent.

- [ ] **Step 3: Implement the signed provider mapping**

Pin model version/capabilities, use exact reference AssetVersion, route every output locator through Task 26 SafeFetch-to-quarantine ingest, normalize progress without fabricated percentages, and record actual dimensions/fps/duration from decoded output rather than provider claims.

- [ ] **Step 4: Verify recorded plus opt-in staging smoke**

Run: `pnpm --filter @comic-canvas/worker-generation test -- primary-video.contract.test.ts`<br>
Expected: recorded suite PASS.<br>
Run: `pnpm exec cross-env PROVIDER_SMOKE=1 pnpm --filter @comic-canvas/worker-generation test:staging -- primary-video.staging.test.ts`<br>
Expected: one approved image produces scanned proxy-ready video and exact billing evidence.

- [ ] **Step 5: Commit**

```bash
git add apps/worker-generation/src/adapters apps/worker-generation/src/adapter-registry.ts apps/worker-generation/src/main.ts tests/fixtures/providers/video docs/adr/0005-providers-region-and-retention.md
git commit -m "feat: connect contracted video provider"
```

---

### Task 37: 真实 TTS、VoiceProfile 与读音谱系

**Files:**
- Create: `packages/contracts/src/audio.ts`, `packages/contracts/src/audio.contract.test.ts`
- Modify: `packages/contracts/src/index.ts`
- Create: `packages/db/src/schema/audio.ts`, `packages/db/migrations/0014_audio.sql`
- Modify: `packages/db/src/schema/index.ts`
- Create: `apps/api/src/audio/audio.module.ts`, `apps/api/src/audio/audio.controller.ts`, `apps/api/src/audio/audio.service.ts`, `apps/api/src/audio/audio.e2e-spec.ts`
- Modify: `apps/api/src/app.module.ts`
- Create: `apps/worker-generation/src/adapters/primary-tts.adapter.ts`, `apps/worker-generation/src/adapters/primary-tts.contract.test.ts`, `apps/worker-generation/src/adapters/primary-tts.staging.test.ts`
- Modify: `apps/worker-generation/src/adapter-registry.ts`, `apps/worker-generation/src/main.ts`
- Create: `apps/web/src/audio/voice-profile-editor.tsx`, `apps/web/src/audio/pronunciation-dictionary.tsx`
- Modify: `apps/web/src/app/router.tsx`
- Create: `tests/fixtures/providers/tts/success.request.json`, `tests/fixtures/providers/tts/success.response.json`, `tests/fixtures/providers/tts/recover.response.json`, `tests/fixtures/providers/tts/error.response.json`, `tests/fixtures/providers/tts/webhook.json`

**Interfaces:** Produces licensed stock VoiceProfile, versioned PronunciationEntry and TTS Job whose input lineage contains exact Line revision, voice version and dictionary revision.

**Integration Gate:** `C/D/A/G/W` Modify; `R` N/A because the existing voice node consumes the new lineage; `M/T/Q` N/A.

- [ ] **Step 1: Write license/schema introspection tests and create legal comment-only `0014`**

Reject cloned/custom voice, missing license/Line revision and unsupported emotion. Pronunciation change marks only matching audio stale. Shared adapter suite covers SSML escaping, duration, billed cancel, recovery and content error; source Line text never appears in logs.

- [ ] **Step 2: Run RED**

Run: `pnpm --filter @comic-canvas/db test:migration -- 0014_audio.sql`<br>
Expected: the comment-only migration loads, then FAILS `VOICE_PROFILE_TABLE_MISSING`; no failure comes from a missing migration file.

- [ ] **Step 3: Implement domain APIs and the signed TTS adapter**

Freeze provider voice ID/license evidence, locale/rate/pitch/emotion schema and dictionary precedence. Output locator enters Task 26 SafeFetch-to-quarantine ingest, decoded duration/sample rate become AssetVersion metadata, and Line/voice/dictionary hashes enter Job snapshot.

- [ ] **Step 4: Verify exact lineage and staging contract**

Run: `pnpm --filter @comic-canvas/db test:migration -- 0014_audio.sql && pnpm --filter @comic-canvas/api test:e2e -- audio.e2e-spec.ts && pnpm --filter @comic-canvas/worker-generation test -- primary-tts.contract.test.ts`<br>
Expected: migration/API/recorded adapter PASS.<br>
Run: `pnpm exec cross-env PROVIDER_SMOKE=1 pnpm --filter @comic-canvas/worker-generation test:staging -- primary-tts.staging.test.ts`<br>
Expected: one rights-cleared Line produces licensed 48kHz ready audio with exact billed micros and recovery evidence.

- [ ] **Step 5: Commit**

```bash
git add packages/contracts packages/db apps/api/src/audio apps/api/src/app.module.ts apps/worker-generation apps/web/src/audio apps/web/src/app/router.tsx tests/fixtures/providers/tts
git commit -m "feat: generate traceable licensed character voices"
```

---

### Task 38: Static-motion、镜头媒体比较与音乐/SFX

**Files:**
- Create: `apps/worker-media/src/processors/static-motion.ts`, `apps/worker-media/src/processors/static-motion.test.ts`
- Modify: `apps/worker-media/src/processor-registry.ts`, `apps/worker-media/src/main.ts`
- Create: `apps/worker-generation/src/adapters/internal-static-motion.adapter.ts`
- Create: `apps/worker-generation/src/adapters/internal-static-motion.adapter.test.ts`
- Modify: `apps/worker-generation/src/adapter-registry.ts`, `apps/worker-generation/src/main.ts`
- Modify: `packages/queue/src/media-queue.ts`, `packages/queue/src/index.ts`
- Create: `apps/web/src/assets/video-compare.tsx`, `apps/web/src/assets/audio-compare.tsx`, `apps/web/src/assets/music-sfx-panel.tsx`
- Create: `apps/web/src/assets/media-compare.test.tsx`
- Modify: `apps/web/src/app/router.tsx`, `packages/canvas-renderer-reactflow/src/node-registry.tsx`

**Interfaces:** Internal adapter creates a Media queue Job; only Media Worker invokes FFmpeg. Static motion supports pan/zoom direction, durationFrames and easing with deterministic source output, then consumes Task 22's common `ensureCfrMezzanine`; this task does not define a second video-normalization contract.

**Integration Gate:** `G/M/W/R/Q` Modify; `C/D/A/T` N/A because they consume existing Job/asset/upload interfaces without fixed-point changes.

- [ ] **Step 1: Write worker-boundary and media comparison tests**

Assert Generation Worker never spawns FFmpeg; it writes one Media Outbox route and Q/M receipt replay creates one effect. Media processor uses opaque input/output IDs, `shell:false` and argument boundaries. Same config/FFmpeg image yields identical normalized stream hash. Video compare syncs play/pause/frame/waveform; only one canvas player remains active.

- [ ] **Step 2: Run RED**

Run: `pnpm --filter @comic-canvas/worker-media test -- static-motion.test.ts`<br>
Expected: FAIL because static-motion processor is absent.

- [ ] **Step 3: Implement deterministic internal media route and UI**

Use integer 25fps duration frames, filter graph assembled from validated enums/numbers and spawn argument array. Internal adapter writes transactional Media Outbox; Q routes and M receipts. Static-motion output re-enters Task 22's scan/moderation/common CFR processor, and only that processor marks the immutable mezzanine AssetVariant/hash Timeline-eligible. Music/SFX uses Task 22 upload path only; no unlicensed generation. Compare preserves exact AssetVersion/Variant labels and reports duration/audio differences.

- [ ] **Step 4: Verify registries, injection boundaries and UI**

Run: `pnpm --filter @comic-canvas/worker-media test -- static-motion.test.ts transcode-cfr-mezzanine.test.ts && pnpm --filter @comic-canvas/worker-generation test -- internal-static-motion.adapter.test.ts && pnpm --filter @comic-canvas/web test -- media-compare.test.tsx`<br>
Expected: processor/adapter registered, dangerous title never enters path/command, shell is false and synchronized compare stays within one frame.

- [ ] **Step 5: Commit**

```bash
git add apps/worker-media apps/worker-generation packages/queue apps/web/src/assets apps/web/src/app/router.tsx packages/canvas-renderer-reactflow/src/node-registry.tsx
git commit -m "feat: add safe static motion media fallback"
```

## Wave E：时间线、快照、审核与导出

### Task 39: Timeline revision 与 Storyboard 显式同步协议

**Files:**
- Create: `packages/contracts/src/timeline.ts`, `packages/contracts/src/timeline.contract.test.ts`
- Modify: `packages/contracts/src/storyboard.ts`, `packages/contracts/src/storyboard.contract.test.ts`
- Modify: `packages/contracts/src/index.ts`
- Create: `packages/db/src/schema/storyboard.ts`, `packages/db/src/schema/timeline.ts`, `packages/db/migrations/0015_timeline_content.sql`
- Modify: `packages/db/src/schema/index.ts`
- Create: `apps/api/src/timeline/timeline.module.ts`, `apps/api/src/timeline/timeline.controller.ts`, `apps/api/src/timeline/timeline.service.ts`, `apps/api/src/timeline/storyboard-sync.ts`, `apps/api/src/timeline/timeline.e2e-spec.ts`
- Create: `apps/api/src/storyboard/storyboard-revision.service.ts`
- Modify: `apps/api/src/storyboard/storyboard.module.ts`, `apps/api/src/storyboard/storyboard.controller.ts`, `apps/api/src/storyboard/storyboard.service.ts`, `apps/api/src/storyboard/storyboard.e2e-spec.ts`
- Modify: `apps/api/src/app.module.ts`, `apps/api/src/impact/impact-contributor.registry.ts`, `apps/api/src/projects/episode-lifecycle.registry.ts`

**Interfaces:** Produces immutable content-addressed `StoryboardRevision {sourceScriptRevisionId,orderedShotRevisions,selectionHeads,canonicalHash}` plus current head; revisioned Track/Clip/Caption/Transition; persisted sync preview `{sourceStoryboardRevisionId,targetTimelineRevisionId,orderedDiffIds,diffHash}`; append-only sync ledger; `previewStoryboardSync` and dual-head-CAS `applyStoryboardSync`; video uses integer frames in one 25/1 master timebase over an exact CFR mezzanine AssetVariant, while audio/caption uses integer ms. Registers Storyboard/Timeline impact and Episode copy contributors.

```ts
export type StoryboardSyncDiff =
  | { type: "shot-added"; shotId: string; proposedAfterClipId?: string }
  | { type: "shot-deleted"; shotId: string; clipId: string; actions: readonly ["keep-unlink", "remove", "relink"] }
  | { type: "shot-moved"; shotId: string; clipId: string; conflict: boolean }
  | { type: "duration-changed"; shotId: string; clipId: string; proposedFrames: number }
  | { type: "asset-changed"; shotId: string; clipId: string; fromVersionId: string; toVersionId: string };
```

**Integration Gate:** `C/D/A` Modify; `W` N/A because Task 40 consumes these APIs; `R/G/M/T/Q` N/A.

- [ ] **Step 1: Write sync/schema introspection tests and create legal comment-only `0015`**

Materialize a StoryboardRevision from exact ScriptRevision, Scene/Shot order/revisions and every image/video/voice/caption Selection head+AssetVersion; same vector gives the same canonical hash, while any member/head change yields a new immutable revision. Empty Timeline seeds 12 Clips in Storyboard order with sourceShotId/sourceShotRevision/exact AssetVersion plus exact 25fps CFR mezzanine AssetVariant/object hash or placeholder. Every video interval is half-open `[startFrame,endFrame)` and `[inFrame,outFrame)` with `durationFrames=end-start=out-in>0`; external ms maps by `floor(ms*25/1000+0.5)`. Hard cuts abut; crossfade overlap equals transition duration and is at most half either Clip; unnamed gaps/overlaps fail. Deleted Shot requires keep-unlink/remove/relink disposition; manual move/trim/volume/transition is preserved.

Preview persists source Storyboard head, target Timeline head, ordered stable diff IDs and canonical diffHash under one project-fence consistent read. Accept/reject/keep for only two of five diffs writes two ledger rows, does not advance global baseline, does not show them again, and leaves the other three pending. Same completed baseline applied 100 times produces no extra revision. Start two clients from the same preview; after either Storyboard/Selection or Timeline head changes, only one apply may win the dual CAS. Loser receives 409 `STORYBOARD_TIMELINE_BASE_CHANGED` with a new rebase preview and writes zero Clip/ledger/baseline rows.

- [ ] **Step 2: Run RED**

Run: `pnpm --filter @comic-canvas/db test:migration -- 0015_timeline_content.sql`<br>
Expected: the comment-only migration loads, then FAILS `TIMELINE_REVISION_TABLE_MISSING`; Timeline header from Task 10 remains valid.

- [ ] **Step 3: Implement frame-safe model and explicit sync APIs**

Task 22's common processor transcodes every ready video used for editing, including Task 38 output, to an immutable 25fps CFR mezzanine; Timeline stores exact assetVersionId/assetVariantId/objectVersionId/byteHash and all four frame fields in that master timebase. Proxy and export use the same variant/mapping. `StoryboardRevisionService` freezes the authoritative version vector/content hash and advances Storyboard head by CAS; it never reads Canvas position. Track order is startFrame+stackOrderKey+clipId; transitions and gap rules enforce the half-open invariants. Each stable diffId derives from sourceStoryboardRevision/targetTimelineRevision/type/sourceShotId-or-clipId. Persist preview bytes/hash. Apply selected dispositions under `withProjectWriteFence`, compare both current heads and diffHash in the same serializable transaction, then append ledger rows and a Timeline revision atomically; partial processing leaves baseline fixed, and only when every current diff has a disposition does CAS advance the baseline. Preview reads ledger/current Clip sourceRevision so handled items do not reappear. Register Storyboard/Timeline traversal with ImpactContributorRegistry and explicit Timeline-content Episode copy contributor.

- [ ] **Step 4: Verify synchronization preservation and timing**

Run: `pnpm --filter @comic-canvas/db test:migration -- 0015_timeline_content.sql && pnpm --filter @comic-canvas/api test:e2e -- timeline.e2e-spec.ts`<br>
Expected: StoryboardRevision hashes/version vectors are immutable and exact; seed/divergence preview P95 <=2s for 12 shots; 1000 interval/property cases obey one timebase; partial ledger behavior is exact; unaffected Clip fields retain 100%; orphan dispositions remain explicit; two-client dual-head race has one winner/zero loser writes; copied Episode has independent Storyboard/Timeline IDs; OpenAPI/sync route are registered.

- [ ] **Step 5: Commit**

```bash
git add packages/contracts packages/db apps/api/src/timeline apps/api/src/storyboard apps/api/src/impact/impact-contributor.registry.ts apps/api/src/projects/episode-lifecycle.registry.ts apps/api/src/app.module.ts
git commit -m "feat: synchronize storyboard changes explicitly"
```

---

### Task 40: Timeline UI、代理预览、字幕与音频编辑

**Files:**
- Create: `apps/web/src/timeline/timeline-page.tsx`, `apps/web/src/timeline/track-list.tsx`, `apps/web/src/timeline/virtual-track.tsx`, `apps/web/src/timeline/clip.tsx`, `apps/web/src/timeline/playhead.tsx`, `apps/web/src/timeline/proxy-player.tsx`, `apps/web/src/timeline/caption-editor.tsx`, `apps/web/src/timeline/audio-controls.tsx`, `apps/web/src/timeline/transition-menu.tsx`, `apps/web/src/timeline/sync-dialog.tsx`
- Create: `apps/web/src/timeline/timeline-reducer.test.ts`, `apps/web/src/timeline/caption-validator.test.ts`
- Modify: `apps/web/src/app/router.tsx`
- Modify: `tests/e2e/support/drivers/timeline.driver.ts`
- Create: `tests/e2e/specs/timeline-editing.spec.ts`, `tests/e2e/specs/timeline-sync.spec.ts`

**Interfaces:** Consumes Task 39 revision APIs; produces deterministic edit commands with baseRevisionId and proxy preview clock.

**Integration Gate:** `W` Modify; `C/D/A/R/G/M/T/Q` N/A because existing contracts/APIs/registries are consumed unchanged.

- [ ] **Step 1: Write reducer, safe-area and conflict tests**

Cover reorder/trim/frame snapping, volume/fades, hard-cut/crossfade duration, caption max two lines/0.5-7s/<=15 Chinese chars/s/safe-area, line-duration changes that do not auto-ripple, sync five-diff selection and 409 local-edit preservation.

- [ ] **Step 2: Run RED**

Run: `pnpm --filter @comic-canvas/web test -- timeline-reducer.test.ts`<br>
Expected: FAIL because timeline reducer is absent.

- [ ] **Step 3: Implement virtual tracks and proxy clock**

Use one master playback clock, integer-frame video positions, ms audio/captions and proxy drift correction. Sync dialog exposes add/delete-orphan/move conflict/duration/asset changes, supports per-item accept and no write on close. Stable track height and clip bounds prevent layout shift.

- [ ] **Step 4: Verify edit and sync E2E**

Run: `pnpm --filter @comic-canvas/web test -- timeline-reducer.test.ts caption-validator.test.ts && pnpm exec playwright test tests/e2e/specs/timeline-editing.spec.ts tests/e2e/specs/timeline-sync.spec.ts`<br>
Expected: proxy A/V drift <=1 frame, all five diffs visible, manual Clip edits preserved and no Selection change silently replaces a Clip.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/timeline apps/web/src/app/router.tsx tests/e2e/support/drivers/timeline.driver.ts tests/e2e/specs/timeline-editing.spec.ts tests/e2e/specs/timeline-sync.spec.ts
git commit -m "feat: edit exact versions on a frame safe timeline"
```

---

### Task 41: ProjectSnapshot、一致恢复与历史保留

**Files:**
- Create: `packages/contracts/src/snapshots.ts`, `packages/contracts/src/snapshots.contract.test.ts`
- Modify: `packages/contracts/src/index.ts`
- Create: `packages/db/src/schema/snapshots.ts`, `packages/db/src/schema/retention.ts`, `packages/db/migrations/0016_project_snapshots.sql`
- Modify: `packages/db/src/schema/index.ts`
- Create: `apps/api/src/snapshots/snapshots.module.ts`, `apps/api/src/snapshots/snapshots.controller.ts`, `apps/api/src/snapshots/snapshots.service.ts`, `apps/api/src/snapshots/snapshot-coordinator.ts`, `apps/api/src/snapshots/snapshot-contributor.registry.ts`, `apps/api/src/snapshots/snapshot-restore-saga.ts`, `apps/api/src/snapshots/snapshots.e2e-spec.ts`
- Create: `apps/api/src/snapshots/detached-results.service.ts`
- Modify: `apps/api/src/app.module.ts`
- Modify: `apps/api/src/generation/generation.controller.ts`, `apps/api/src/generation/generation.service.ts`
- Modify: `apps/worker-generation/src/provider-output-dispatch.ts`
- Create: `apps/collab/test/historical-full-update.integration.test.ts`, `apps/collab/test/active-revision.integration.test.ts`, `apps/collab/test/restore-projection-epoch.integration.test.ts`
- Create: `apps/web/src/history/snapshot-history.tsx`, `apps/web/src/history/snapshot-create-dialog.tsx`, `apps/web/src/history/snapshot-restore-preview.tsx`
- Create: `apps/web/src/history/snapshot-history.test.tsx`
- Modify: `apps/web/src/app/router.tsx`

**Interfaces:** Produces create/list/preview/restore APIs plus `SnapshotContributorRegistry` and durable restore-saga/activation receipt. Core snapshot freezes project/episode/domain revisions; each Canvas documentEpoch/projection watermark/durableSeq/stateVector/schema and immutable content-addressed full update that applies to an empty Y.Doc; Timeline revision; Selection/Approval heads; exact AssetVersions; Task 11 gate-policy/rights/moderation/waiver records; `NONTERMINAL_JOB_STATES`; and parent snapshot. Restore creates new projectHeadEpoch and Canvas documentEpochs. Also produces detached/stale result list/compare and `attachDetachedResult(jobOutputId,expectedProjectHeadEpoch,expectedShotHead,expectedSelectionHead)` that can only append a current candidate. Snapshot members/full updates receive retention holds.

**Integration Gate:** `C/D/A/W` Modify; `G` N/A because Task 26's registered output flow is modified internally without changing its fixed main/adapter registry; Collab Task 13 flush/read/epoch is consumed and tested outside the fixed-point catalog; `R/M/T/Q` N/A.

- [ ] **Step 1: Write consistency/schema introspection tests and create legal comment-only `0016`**

Named snapshot with any `NONTERMINAL_JOB_STATES` member records ID/state but no future output; release snapshot rejects every scope-changing nonterminal Job, including pending/dispatching. Snapshot waits for each epoch-qualified projection consumer through the fenced high-watermark, then records a verified full update object/hash. Restore creates new staged heads/restoredFromSnapshotId/projectHeadEpoch/documentEpoch, cancels/deletes nothing and never auto-selects late output. Inject 100 crashes at project-fence acquisition, projection drain, flush, full-update materialization, member validation, derived epoch reset, PG/Yjs staging and activation-CAS boundaries; externally visible state is old or full new head, never mixed. After snapshot creation, perform append+compaction+update deletion cycles and still reconstruct the historical Canvas from an empty Y.Doc with the original historical hash.

Create snapshot at projection N, apply through M, restore the snapshot into new documentEpoch, deliver delayed `(oldEpoch,N+1..M)` duplicates and then a new event. Derived active full update preserves historical business content but has no old marker and current sequence baseline 0; old events are superseded and new `(newEpoch,1)` applies. Complete an old-head Job after restore: asset/charge remain authoritative but candidate/Selection/Timeline/Gate counts change 0 and the output appears only in detached/stale results. Attach requires a comparison plus current head/selection CAS; one valid attach appends one candidate, stale or duplicate attach writes 0.

- [ ] **Step 2: Run RED**

Run: `pnpm --filter @comic-canvas/db test:migration -- 0016_project_snapshots.sql`<br>
Expected: the comment-only migration loads, then FAILS `PROJECT_SNAPSHOT_TABLE_MISSING`; no failure comes from a missing file.

- [ ] **Step 3: Implement coordinated snapshot and restore preview**

Every domain writer already takes Task 13's shared project fence. Snapshot/restore coordinator takes the exclusive fence, records each Canvas `(documentEpoch,projectionHighWatermark)`, waits until Collab receipts/watermark drain to it, flushes, materializes a content-addressed full update and verifies bytes/hash by applying to an empty Y.Doc. It writes all members and holds as `staging`; only after sorted/schema-versioned member validation does one PostgreSQL CAS activate the snapshot.

Restore preview groups domain/Canvas/Selection/Timeline/gate/nonterminal-Job changes. Confirmation creates a durable saga and stages new Project/Episode/domain/Timeline revisions. For each Canvas it verifies the historical object, derives a new content-addressed full update with identical business nodes/edges but stripped projection markers/room metadata plus a new documentEpoch and lastProjectionSeq 0; neither historical object nor snapshot hash is changed. One serializable PostgreSQL transaction CASes the expected old project head, increments projectHeadEpoch, initializes every new per-epoch counter, switches every domain/Timeline/Canvas active pointer and writes `restoredFromSnapshotId` plus activation receipt. Collab loads the active derived revision and resets rooms idempotently; there is no post-commit Yjs write. Recovery resumes/cleans staging before CAS or observes the complete activation receipt after CAS. Snapshot asset/full-update refs create retention holds.

Job/Attempt creation already freezes projectHeadEpoch and exact input heads. On output completion, Generation compares them to current state inside the effect transaction. Mismatch still creates/charges the immutable AssetVersion but marks the output detached/stale and emits no candidate/Selection/Timeline/Gate mutation. The explicit attach command re-runs authorization/moderation/rights/stale comparison under project fence and appends a candidate only after current head/Selection CAS; it never rewrites Job lineage.

- [ ] **Step 4: Verify scale, hashes and history UI**

Run: `pnpm --filter @comic-canvas/db test:migration -- 0016_project_snapshots.sql && pnpm --filter @comic-canvas/api test:e2e -- snapshots.e2e-spec.ts && pnpm --filter @comic-canvas/collab test -- historical-full-update.integration.test.ts active-revision.integration.test.ts restore-projection-epoch.integration.test.ts && pnpm --filter @comic-canvas/web test -- snapshot-history.test.tsx`<br>
Expected: 1000-node/200-asset/200-Clip create+preview P95 <=5s, restore P95 <=30s; 100 crash injections expose 0 mixed heads; post-snapshot compaction still restores 100% matching historical full-update/reference hashes; new epoch seq1 applies while delayed old epoch mutates 0; every old-head late output stays detached until one CAS-safe attach; staging is never user-visible and history remains immutable.

- [ ] **Step 5: Commit**

```bash
git add packages/contracts packages/db apps/api/src/snapshots apps/api/src/generation/generation.controller.ts apps/api/src/generation/generation.service.ts apps/api/src/app.module.ts apps/worker-generation/src/provider-output-dispatch.ts apps/collab/test apps/web/src/history apps/web/src/app/router.tsx
git commit -m "feat: restore projects from consistent snapshots"
```

---

### Task 42: 评论、Issue、ApprovalGate 与可追溯复验

**Files:**
- Create: `packages/contracts/src/reviews.ts`, `packages/contracts/src/reviews.contract.test.ts`
- Modify: `packages/contracts/src/index.ts`
- Create: `packages/db/src/schema/reviews.ts`, `packages/db/migrations/0017_reviews.sql`
- Modify: `packages/db/src/schema/index.ts`
- Create: `apps/api/src/reviews/reviews.module.ts`, `apps/api/src/reviews/comments.controller.ts`, `apps/api/src/reviews/issues.controller.ts`, `apps/api/src/reviews/review-requests.controller.ts`, `apps/api/src/reviews/review-decisions.controller.ts`, `apps/api/src/reviews/approval-gates.controller.ts`, `apps/api/src/reviews/reviews.service.ts`, `apps/api/src/reviews/review-request.service.ts`, `apps/api/src/reviews/gate-evaluator.ts`, `apps/api/src/reviews/reviews.e2e-spec.ts`
- Modify: `apps/api/src/app.module.ts`, `apps/api/src/snapshots/snapshot-coordinator.ts`, `apps/api/src/snapshots/snapshot-contributor.registry.ts`, `apps/api/src/projects/episode-lifecycle.registry.ts`
- Create: `apps/web/src/reviews/review-panel.tsx`, `apps/web/src/reviews/review-request-dialog.tsx`, `apps/web/src/reviews/review-decision-panel.tsx`, `apps/web/src/reviews/comment-composer.tsx`, `apps/web/src/reviews/issue-detail.tsx`, `apps/web/src/reviews/approval-gate-status.tsx`, `apps/web/src/reviews/reviews.test.tsx`
- Modify: `apps/web/src/app/router.tsx`, `packages/canvas-renderer-reactflow/src/node-registry.tsx`

**Interfaces:** Produces object/version/timecode/local-coordinate comment anchors; `ReviewRequest` bound to one named ProjectSnapshot and exact subject versions/reviewer capabilities; append-only `ReviewDecision {approve|changes_requested|abstain}` bound to `(reviewRequestId,subjectVersionId,reviewerId)`; Issue state machine; and evaluated gate records against exact ProjectSnapshot. Registers requests/decisions/open Issues/gate-evaluation heads as a snapshot contributor so final snapshots include them.

**Integration Gate:** `C/D/A/W/R` Modify; `G/M/T/Q` N/A.

- [ ] **Step 1: Write review/schema introspection tests and create legal comment-only `0017`**

Anchor must include object and exact version; timecode must be in referenced asset range. Creating a ReviewRequest requires a named snapshot, at least one exact subject version, explicit reviewer/capability scope and dueAt; changing the live subject never mutates the request. Decisions require current membership/capability, exact request+subject, unique operationId and append rather than overwrite; a new decision supersedes by link, and request closes only under its frozen completion policy. Same reviewer concurrent decisions allow one operation winner. `changes_requested` creates/links an Issue; approving a stale/replaced subject remains historical and cannot satisfy current gate. Issue transitions open->assigned->in_progress->resolved->verified plus reopened/waived are append-only and capability checked. Gate fails for incomplete/changes-requested review, open Blocker/Major, outdated Approval, rights/moderation gap or stale Clip; waiver records actor/reason/scope and never changes old Decision/Approval validity.

- [ ] **Step 2: Run RED**

Run: `pnpm --filter @comic-canvas/db test:migration -- 0017_reviews.sql`<br>
Expected: the comment-only migration loads, then FAILS `REVIEW_ISSUE_TABLE_MISSING`; no failure comes from a missing file.

- [ ] **Step 3: Implement asynchronous review loop**

Register the review snapshot contributor and open-request/Issue archive blocker, create named review snapshot from Task 41, issue ReviewRequest for frozen subjects, collect append-only decisions/comments/Issues, resolve with replacement version, verify and reevaluate gate. All writes use project fence, Idempotency-Key, request/subject head CAS and exact capability/membership checks. UI links canvas/storyboard/timeline anchors without storing screen coordinates and restores focus to reviewed object; Decision and Asset Approval remain distinct labels/records.

- [ ] **Step 4: Verify workflow and gate registration**

Run: `pnpm --filter @comic-canvas/db test:migration -- 0017_reviews.sql && pnpm --filter @comic-canvas/api test:e2e -- reviews.e2e-spec.ts && pnpm --filter @comic-canvas/web test -- reviews.test.tsx`<br>
Expected: full request->decision/comment->Issue->fix->verify path passes; concurrent decision CAS has one winner; stale subject Decision/Approval blocks current gate; routes/node state/snapshot/archive contributors are registered and cross-version anchors never drift.

- [ ] **Step 5: Commit**

```bash
git add packages/contracts packages/db apps/api/src/reviews apps/api/src/app.module.ts apps/api/src/snapshots/snapshot-coordinator.ts apps/api/src/snapshots/snapshot-contributor.registry.ts apps/api/src/projects/episode-lifecycle.registry.ts apps/web/src/reviews apps/web/src/app/router.tsx packages/canvas-renderer-reactflow/src/node-registry.tsx
git commit -m "feat: review exact project versions asynchronously"
```

---

### Task 43: 可撤销分享与移动端审阅

**Files:**
- Create: `packages/contracts/src/shares.ts`, `packages/contracts/src/shares.contract.test.ts`
- Modify: `packages/contracts/src/index.ts`
- Create: `packages/db/src/schema/shares.ts`, `packages/db/migrations/0018_share_sessions.sql`
- Modify: `packages/db/src/schema/index.ts`
- Create: `apps/api/src/shares/shares.module.ts`, `apps/api/src/shares/shares.controller.ts`, `apps/api/src/shares/shares.service.ts`, `apps/api/src/shares/shares.e2e-spec.ts`
- Modify: `apps/api/src/app.module.ts`
- Create: `apps/web/src/review-mobile/project-list.tsx`, `apps/web/src/review-mobile/episode-list.tsx`, `apps/web/src/review-mobile/mobile-storyboard.tsx`, `apps/web/src/review-mobile/mobile-candidate-compare.tsx`, `apps/web/src/review-mobile/mobile-comment.tsx`, `apps/web/src/review-mobile/mobile-approval-detail.tsx`, `apps/web/src/review-mobile/mobile-task-control.tsx`
- Create: `apps/web/src/shares/share-manager.tsx`, `apps/web/src/shares/share-create-dialog.tsx`, `apps/web/src/shares/share-revoke-dialog.tsx`
- Modify: `apps/web/src/app/router.tsx`
- Create: `tests/e2e/specs/mobile-review.spec.ts`

**Interfaces:** Produces hashed, expiring, revocable share session scoped to one named review snapshot and Commenter/Viewer capabilities; authenticated Owner/Editor/Generator continue to use their project membership capabilities on the same mobile routes. Mobile has no canvas edit token.

**Integration Gate:** `C/D/A/W` Modify; `R/G/M/T/Q` N/A.

- [ ] **Step 1: Write share/schema introspection tests and create legal comment-only `0018`**

Share token cannot change snapshot/project/role, is stored hashed, expires, revokes immediately and cannot call edit/generation/upload/export/approval/task-control APIs. At 390x844 every role can inspect two snapshot candidate versions side-by-side or swipe/zoom with exact version/status labels, but Mobile Candidate Compare is read-only and exposes no “设为当前” Selection mutation. Viewer previews and sees approval detail; Commenter adds timecode comment; a signed-in Owner or policy-authorized Editor may approve the already-current exact version from the separate approval detail; a signed-in Generator cancels only their queued task through `job:cancel-own`.

- [ ] **Step 2: Run RED**

Run: `pnpm --filter @comic-canvas/db test:migration -- 0018_share_sessions.sql`<br>
Expected: the comment-only migration loads, then FAILS `SHARE_SESSION_TABLE_MISSING`; no failure comes from a missing file.

- [ ] **Step 3: Implement minimal mobile review routes**

Desktop share manager creates a Viewer/Commenter link only from a named review snapshot, shows expiry/capabilities and requires explicit revoke confirmation. Mobile uses 44px targets, one-column views, responsive read-only candidate comparison and explicit version/Selection/Approval/stale labels. Candidate navigation never mutates current Selection; approval detail acts only on the server-reported current exact version and capability. It does not load editable Yjs document, Composer, node wiring or Timeline editor. Revocation closes the project-scoped SSE and invalidates refresh/session tokens.

- [ ] **Step 4: Verify permissions, layout and focus**

Run: `pnpm --filter @comic-canvas/db test:migration -- 0018_share_sessions.sql && pnpm --filter @comic-canvas/api test:e2e -- shares.e2e-spec.ts && pnpm exec playwright test tests/e2e/specs/mobile-review.spec.ts --project="Mobile Chrome"`<br>
Expected: P0 mobile flows pass with no horizontal overflow/overlap; snapshot candidate compare changes Selection rows 0; authorized approval targets only the current exact version; revoked token fails on next request and every forbidden mutation returns 403.

- [ ] **Step 5: Commit**

```bash
git add packages/contracts packages/db apps/api/src/shares apps/api/src/app.module.ts apps/web/src/review-mobile apps/web/src/shares apps/web/src/app/router.tsx tests/e2e/specs/mobile-review.spec.ts
git commit -m "feat: review frozen comic snapshots on mobile"
```

---

### Task 44: 导出预检与不可变 Manifest

**Files:**
- Create: `packages/contracts/src/exports.ts`, `packages/contracts/src/exports.contract.test.ts`
- Modify: `packages/contracts/src/index.ts`
- Create: `packages/db/src/schema/exports.ts`, `packages/db/migrations/0019_exports.sql`
- Modify: `packages/db/src/schema/index.ts`
- Create: `apps/api/src/exports/exports.module.ts`, `apps/api/src/exports/exports.controller.ts`, `apps/api/src/exports/exports.service.ts`, `apps/api/src/exports/preflight.service.ts`, `apps/api/src/exports/manifest-builder.ts`, `apps/api/src/exports/exports.e2e-spec.ts`
- Create: `apps/api/src/exports/canonical-json.ts`
- Modify: `apps/api/src/app.module.ts`, `apps/api/src/impact/impact-contributor.registry.ts`
- Create: `packages/queue/src/export-queue.ts`, `packages/queue/src/export-queue.test.ts`
- Modify: `packages/queue/src/index.ts`
- Create: `apps/web/src/exports/export-dialog.tsx`, `apps/web/src/exports/preflight-results.tsx`, `apps/web/src/exports/export-history.tsx`
- Create: `apps/web/src/exports/export-dialog.test.tsx`
- Modify: `apps/web/src/app/router.tsx`

**Interfaces:** Produces `/v1/exports/preflight` and `/v1/exports`; `ExportPreset.captionMode = "burn-in+sidecar" | "sidecar-only"` with MVP default `burn-in+sidecar`; RFC 8785/JCS-compatible immutable Manifest; transactional export Outbox route; and Manifest impact contributor. Manifest always includes canonical SRT delivery, exact Caption revision/normalized text/integer-ms intervals/font/layout recipe, release snapshot, Timeline revision, exact Selection/Approval, rights/moderation/QC profile, exact Task 11 AI-disclosure policy/version/render recipe, Media image/FFmpeg version/render-compiler version plus canonical renderer-neutral `RenderPlan`, and every actual render input as `assetVersionId + assetVariantId + objectVersionId + byteSha256 + detectedMediaMetadata + transformRecipe`. Task 45 deterministically compiles that plan and stores exact exec arrays/hashes in immutable RenderEvidence; Task 44 does not call a future Worker compiler.

**Integration Gate:** `C/D/A/W/Q` Modify; `M` N/A because Task 45 consumes the registered export route; `R/G/T` N/A.

- [ ] **Step 1: Write manifest/schema introspection tests and create legal comment-only `0019`**

Preflight blocks missing/quarantined/stale/outdated/unapproved assets, open Blocker/Major, rights/moderation/font/AI-disclosure gaps, invalid captions and any scope-changing `NONTERMINAL_JOB_STATES` Job. Normal waiver needs capability+reason+scope and cannot waive statutory rights, mandatory AI disclosure or Blocker. Validate both caption modes: omitted mode canonicalizes to `burn-in+sidecar`; unknown values fail; both freeze/deliver the same canonical SRT bytes, while only burn-in mode carries the caption overlay recipe. RFC 8785 ordering/number/string edge fixtures yield one UTF-8 no-BOM byte sequence. Same exact render inputs create the same Manifest hash; changing captionMode/Caption revision/layout, variant/object version/byte hash/metadata/recipe/disclosure policy, even under the same AssetVersion, creates a new hash. Impact report now reaches Manifest refs through the registered contributor.

- [ ] **Step 2: Run RED**

Run: `pnpm --filter @comic-canvas/db test:migration -- 0019_exports.sql`<br>
Expected: the comment-only migration loads, then FAILS `EXPORT_MANIFEST_TABLE_MISSING`; no failure comes from a missing file.

- [ ] **Step 3: Implement snapshot-bound preflight and create transaction**

Reevaluate gates server-side, resolve the exact 25fps CFR mezzanine/other render variants and object versions, and verify byte hashes/metadata/recipes before canonicalization. Freeze default 1080x1920/25fps/H.264/AAC/SRT/ZIP spec and default `burn-in+sidecar`; both modes always include canonical SRT derived from the same normalized Caption revision/intervals used by preview and any burn-in. Resolve the target profile to one signed disclosure version, exact licensed font/overlay/time range plus required deterministic metadata/sidecar independently from caption mode. Migration 0019 creates immutable Manifest/ExportJob plus append-once RenderEvidence/QC/output slots that Task 45 may fill only by CAS from the matching Job. Manifest, ExportJob and Media Outbox are written in the shared command transaction only after preflight token CAS; Q registers the export route. Browser data is advisory; no output path/title or disclosure text is accepted from user input, and Worker is forbidden to select a different variant/policy at runtime. Register Manifest traversal with ImpactContributorRegistry.

- [ ] **Step 4: Verify blockers, idempotency and route registration**

Run: `pnpm --filter @comic-canvas/db test:migration -- 0019_exports.sql && pnpm --filter @comic-canvas/queue test -- export-queue.test.ts && pnpm --filter @comic-canvas/api test:e2e -- exports.e2e-spec.ts && pnpm --filter @comic-canvas/web test -- export-dialog.test.tsx`<br>
Expected: both caption modes and default pass; canonical SRT source/bytes are identical across modes, burn-in recipe exists only when required, canonical Manifest bytes/hash match, every actual variant/object input is frozen, each defect yields a stable blocker, duplicate create produces one ExportJob/Manifest/Outbox, and UI shows exact snapshot/hash/mode.

- [ ] **Step 5: Commit**

```bash
git add packages/contracts packages/db packages/queue apps/api/src/exports apps/api/src/impact/impact-contributor.registry.ts apps/api/src/app.module.ts apps/web/src/exports apps/web/src/app/router.tsx
git commit -m "feat: freeze reproducible export manifests"
```

---

### Task 45: FFmpeg 成片、SRT、ZIP 素材包与 QC

**Files:**
- Create: `apps/worker-media/src/processors/render-export.ts`, `apps/worker-media/src/processors/qc-export.ts`, `apps/worker-media/src/processors/package-assets.ts`, `apps/worker-media/src/processors/export-recovery.ts`, `apps/worker-media/src/ffmpeg-command.ts`, `apps/worker-media/src/ai-disclosure.ts`, `apps/worker-media/src/canonical-srt.ts`, `apps/worker-media/src/deterministic-zip.ts`, `apps/worker-media/src/normalized-stream-hash.ts`
- Create: `apps/worker-media/test/ffmpeg-command.test.ts`, `apps/worker-media/test/ai-disclosure.test.ts`, `apps/worker-media/test/export.integration.test.ts`, `apps/worker-media/test/qc.test.ts`
- Modify: `apps/worker-media/src/processor-registry.ts`, `apps/worker-media/src/main.ts`, `apps/worker-media/package.json`, `pnpm-lock.yaml`
- Create: `apps/api/src/exports/export-download.controller.ts`
- Modify: `apps/api/src/exports/exports.module.ts`, `apps/api/src/app.module.ts`
- Modify: `apps/web/src/exports/export-history.tsx`, `tests/e2e/support/drivers/export.driver.ts`
- Create: `tests/e2e/specs/export-golden.spec.ts`

**Interfaces:** Produces mode-correct immutable MP4, always-delivered canonical UTF-8/LF SRT from the Manifest Caption source, deterministic ZIP asset package, policy-required AI-disclosure sidecar, immutable RenderEvidence containing exact executable/argument arrays/tool+image/compiler versions and hashes, mode-aware QC report and separate decoded RGB24/PCM SHA-256 hashes linked to Manifest; adds `archiver@7.0.1` exactly.

**Integration Gate:** `M/A` Modify; `C/D` N/A because the existing ExportJob/Manifest contracts are consumed; `W` N/A because Task 44 already mounted the export history component; `Q` N/A because its registered export route is consumed with a permanent receipt; `R/G/T` N/A.

- [ ] **Step 1: Write argument-injection, recovery and QC threshold tests**

Assert executable invoked with `shell:false`, argument array boundaries and opaque paths; project/title text never enters a path or filter graph. Crash after temp render/effect-before-receipt resumes or cleans with one final output. Worker reads only Manifest-named object versions and rejects any byte/hash drift. SRT bytes are stable UTF-8 no BOM/LF and generated once from Manifest-normalized captions; ZIP paths are sorted with fixed UTC mtime, Unix mode, compression and no nondeterministic extra fields; MP4 removes creation_time/encoder/random IDs/nonessential metadata while preserving only canonical disclosure fields. `burn-in+sidecar` requires caption glyph/layout pixels plus same-source SRT; `sidecar-only` requires a clean MP4 with no caption overlay plus the same-source SRT. AI disclosure overlay/metadata/sidecar remains independently enforced in both modes. Missing, altered or double-applied overlay fails. QC asserts 1080x1920, 25 CFR, H.264 High/yuv420p, AAC-LC 48kHz, duration <=1 frame difference, A/V <=80ms, -16+/-1 LUFS, true peak <=-1dBTP, mode-specific captions and black-frame thresholds from blueprint.

- [ ] **Step 2: Run RED**

Run: `pnpm --filter @comic-canvas/worker-media test -- ffmpeg-command.test.ts qc.test.ts`<br>
Expected: FAIL because command builder and QC processor are absent.

- [ ] **Step 3: Implement deterministic render/package pipeline**

Compile only the canonical Manifest RenderPlan into validated enum/number/path argument arrays, build filter_complex from half-open Timeline intervals and exact Manifest variants, conditionally add the Manifest caption overlay only for `burn-in+sidecar`, apply the frozen AI-disclosure overlay independently, and persist canonical RenderEvidence before spawn. Render to an opaque temp object, strip all non-policy metadata, write canonical required metadata/sidecar, inspect/QC, promote outputs and settle ExportJob after Q/M receipt. One canonical Caption renderer emits SRT sequence/timestamps from integer ms and feeds burn-in text/layout without separate rounding or normalization. ZIP includes sorted licensed source/proxy assets, SRT, canonical Manifest/RenderEvidence/QC/checksum/disclosure JSON and rights summary with fixed metadata; no provider credential or quarantine object. Normalize video by decoding display-order frames to continuous RGB24 bytes and audio to 48kHz stereo signed PCM bytes; record frame/sample counts and separate SHA-256 hashes. Same fixed image/Manifest renders three normalized-identical streams.

- [ ] **Step 4: Verify worker, package and golden export**

Run: `pnpm install --lockfile-only && pnpm install --frozen-lockfile && pnpm --filter @comic-canvas/worker-media test && pnpm exec playwright test tests/e2e/specs/export-golden.spec.ts`<br>
Expected: both modes always deliver byte-identical same-source SRT; burn-in mode passes caption pixel/layout QC and sidecar-only MP4 has zero caption glyph overlay while still passing SRT QC; ZIP/Manifest/disclosure exact-byte checksums match; each MP4 file hash is recorded but reproducibility gates its decoded RGB24/PCM hashes plus frame/sample counts, which match across all three renders; AI disclosure matches the signed target profile in both modes; all applicable QC gates pass; Worker variant/policy reselection count is 0; download authorization is exact and Q/M route/receipt/processor are registered.

- [ ] **Step 5: Commit**

```bash
git add apps/worker-media apps/api/src/exports apps/api/src/app.module.ts apps/web/src/exports tests/e2e pnpm-lock.yaml
git commit -m "feat: render and quality check complete comic packages"
```

## Wave F：硬化与封测发布

### Task 46: 保留、GC、软删除与内容申诉

**Files:**
- Create: `packages/contracts/src/retention.ts`, `packages/contracts/src/retention.contract.test.ts`
- Modify: `packages/contracts/src/index.ts`
- Modify: `packages/db/src/schema/retention.ts`
- Create: `packages/db/src/asset-reference-fence.ts`, `packages/db/src/asset-reference-catalog.ts`, `packages/db/test/asset-reference-fence.integration.test.ts`, `packages/db/test/asset-reference-catalog.integration.test.ts`, `packages/db/migrations/0020_retention_appeals.sql`
- Modify: `packages/db/src/schema/index.ts`
- Create: `apps/api/src/retention/retention.module.ts`, `apps/api/src/retention/trash.controller.ts`, `apps/api/src/retention/appeals.controller.ts`, `apps/api/src/retention/retention.service.ts`, `apps/api/src/retention/retention.e2e-spec.ts`
- Modify: `apps/api/src/app.module.ts`
- Create: `apps/worker-media/src/processors/retention-gc.ts`, `apps/worker-media/src/processors/retention-gc.test.ts`, `apps/worker-media/src/processors/reap-quarantine-orphans.ts`, `apps/worker-media/src/processors/reap-quarantine-orphans.test.ts`, `apps/worker-media/src/processors/reap-rejected-quarantine.ts`, `apps/worker-media/src/processors/reap-rejected-quarantine.test.ts`
- Modify: `apps/worker-media/src/processor-registry.ts`, `apps/worker-media/src/main.ts`
- Modify: `packages/queue/src/media-queue.ts`, `packages/queue/src/index.ts`
- Create: `apps/web/src/history/trash-view.tsx`, `apps/web/src/governance/appeal-view.tsx`
- Modify: `apps/web/src/app/router.tsx`

**Interfaces:** Produces 30-day project trash/restore, retention/legal holds, moderation appeal, a database-enforced reference fence installed from exhaustive `ASSET_VERSION_REFERENCE_CATALOG`, convenience `assertAssetVersionReferenceable(tx,projectScope,versionId)`, and idempotent object GC plan/execute phases plus separate quarantine-orphan/rejected reapers.

**Integration Gate:** `C/D/A/M/W/Q` Modify; `R/G/T` N/A.

- [ ] **Step 1: Write retention/schema introspection tests and create legal comment-only `0020`**

Build the live set from ReferenceBinding, current/history Selection and Approval, every Job input/output/detached result, Timeline/Manifest exact inputs, comments/Issues/ReviewRequest/Decision, named review/share/ProjectSnapshot members, Rights/Moderation evidence, QC reports, open appeal/legal/retention holds and Yjs projection beyond compacted throughSeq. `ASSET_VERSION_REFERENCE_CATALOG` lists every physical table/column/role plus semantic owner; introspection enumerates all composite foreign keys and normalized asset-reference rows and fails for any uncataloged writer or catalog entry without the migration-installed constraint trigger. Asset IDs may not hide only inside unchecked JSON. Planner CASes AssetVersion `ready|rejected -> deleting`. A BEFORE INSERT/UPDATE deferred-capable constraint trigger on every cataloged reference locks the AssetVersion and rejects `deleting/deleted`; planner uses the conflicting row lock, so database serialization, not voluntary service calls, closes every writer race. Convenience service guard gives earlier errors but is not the authority. Restore/new hold during planned deletion invalidates execute. Ledger/audit/legal records follow signed retention policy, not project trash. Quarantine bytes that never formed an AssetVersion and rejected quarantine bytes use separate age/hold reapers; 7-day multipart cleanup remains independent.

- [ ] **Step 2: Run RED**

Run: `pnpm --filter @comic-canvas/db test:migration -- 0020_retention_appeals.sql`<br>
Expected: the comment-only migration loads on Task 41's core holds, then FAILS `TRASH_ENTRY_TABLE_MISSING`; no failure comes from a missing file.

- [ ] **Step 3: Implement two-phase GC and appeal workflow**

Migration 0020 creates/installs the catalog-backed trigger function and trigger on every asset-reference table that exists through migration 0019; function uses fully qualified names, immutable tenant comparison and the AssetVersion row lock. The catalog test compares schema foreign keys, trigger definitions and an explicit normalized-reference allowlist, so adding a new reference table without updating both catalog and trigger fails Task 48. Planner locks the AssetVersion, records exact object/version/live-set proof and earliestDeleteAt, then CASes it to `deleting`; optional service guards call the same DB function for fast feedback. Executor locks it again, recomputes the complete live set, aborts/returns to the appropriate state if any reference/restore/hold appeared, otherwise deletes immutable storage object and only then appends tombstone. Partial storage failure stays `deleting` and is retryable without losing DB proof. Q/M receipts make plan/execute/reapers idempotent. Appeal links moderation record, evidence, decision and reviewer separation.

- [ ] **Step 4: Verify migration, restore races and processor registration**

Run: `pnpm --filter @comic-canvas/db test:migration -- 0020_retention_appeals.sql && pnpm --filter @comic-canvas/db test -- asset-reference-catalog.integration.test.ts asset-reference-fence.integration.test.ts && pnpm --filter @comic-canvas/api test:e2e -- retention.e2e-spec.ts && pnpm --filter @comic-canvas/worker-media test -- retention-gc.test.ts reap-quarantine-orphans.test.ts reap-rejected-quarantine.test.ts`<br>
Expected: reference catalog equals 100% of schema writers and every entry has the DB trigger; every live-set category blocks deletion; 100 races through every writer yield either a valid reference or a deleting plan but never both; eligible objects delete once; orphan/rejected reapers never touch live assets; restore/appeal/audit histories remain intact and Q/M routes/processors are reachable.

- [ ] **Step 5: Commit**

```bash
git add packages/contracts packages/db packages/queue apps/api/src/retention apps/api/src/app.module.ts apps/worker-media apps/web/src/history apps/web/src/governance apps/web/src/app/router.tsx
git commit -m "feat: retain referenced assets and recover trash"
```

---

### Task 47: 端到端观测、脱敏、备份恢复与运行手册

**Files:**
- Create: `packages/contracts/src/analytics.ts`, `packages/contracts/src/analytics.contract.test.ts`
- Modify: `packages/contracts/src/index.ts`
- Modify: `packages/db/src/schema/analytics.ts`, `packages/db/src/schema/index.ts`
- Create: `packages/db/src/analytics/metric-catalog.ts`, `packages/db/src/analytics/metrics-v1.sql`, `packages/db/test/metric-authority.fixture.test.ts`
- Create: `packages/observability/src/logger.ts`, `packages/observability/src/tracing.ts`, `packages/observability/src/metrics.ts`, `packages/observability/src/redaction.ts`, `packages/observability/src/redaction.test.ts`
- Modify: `packages/observability/src/index.ts`, `packages/observability/package.json`, `package.json`, `pnpm-lock.yaml`
- Create: `packages/queue/src/analytics-queue.ts`, `packages/queue/src/analytics-queue.test.ts`
- Modify: `packages/queue/src/index.ts`
- Create: `apps/api/src/analytics/analytics.module.ts`, `apps/api/src/analytics/analytics.service.ts`, `apps/api/src/analytics/analytics-reconciler.ts`, `apps/api/src/analytics/analytics-retention.ts`, `apps/api/src/analytics/analytics.integration.test.ts`
- Create: `apps/web/src/analytics/analytics-client.ts`, `apps/web/src/analytics/active-time.ts`, `apps/web/src/analytics/active-time.test.ts`
- Modify: `apps/api/src/app.module.ts`, `apps/api/src/main.ts`, `apps/collab/src/main.ts`, `apps/worker-generation/src/main.ts`, `apps/worker-media/src/main.ts`, `apps/web/src/main.tsx`
- Modify: `apps/api/src/projects/projects.service.ts`, `apps/api/src/narrative/scripts.service.ts`, `apps/api/src/generation/generation.service.ts`, `apps/api/src/selections/selections.service.ts`, `apps/api/src/storyboard/triage.service.ts`, `apps/api/src/timeline/storyboard-sync.ts`, `apps/api/src/reviews/reviews.service.ts`, `apps/api/src/reviews/review-request.service.ts`, `apps/api/src/exports/exports.service.ts`
- Modify: `apps/worker-generation/src/job-processor.ts`, `apps/worker-media/src/processors/qc-export.ts`, `apps/worker-media/src/processors/render-export.ts`
- Modify: `apps/collab/src/persistence.ts`, `apps/collab/src/flush-reader.ts`, `apps/web/src/offline/collab-provider.ts`
- Create: `infra/monitoring/prometheus.yml`, `infra/monitoring/grafana/provisioning/datasources.yml`, `infra/monitoring/grafana/provisioning/dashboards.yml`, `infra/monitoring/grafana/dashboards/platform.json`, `infra/monitoring/grafana/dashboards/providers.json`, `infra/monitoring/grafana/dashboards/canvas.json`, `infra/monitoring/grafana/dashboards/media.json`
- Modify: `infra/docker/compose.yml`, `infra/deploy/kubernetes/base/config.yaml`, `infra/deploy/kubernetes/overlays/staging/kustomization.yaml`, `infra/deploy/kubernetes/overlays/production/kustomization.yaml`
- Create: `infra/deploy/kubernetes/observability/kustomization.yaml`, `infra/deploy/kubernetes/observability/otel-collector.yaml`, `infra/deploy/kubernetes/observability/prometheus.yaml`, `infra/deploy/kubernetes/observability/grafana.yaml`, `infra/deploy/kubernetes/observability/network-policies.yaml`
- Create: `docs/runbooks/provider-outage.md`, `docs/runbooks/reconciliation.md`, `docs/runbooks/backup-restore.md`, `docs/runbooks/security-incident.md`, `docs/runbooks/release-rollback.md`
- Create: `tests/integration/backup-restore.test.ts`, `tests/integration/trace-propagation.test.ts`

**Interfaces:** One traceId spans browser/API/Outbox/BullMQ/provider/Media; metrics use bounded labels; redaction removes prompt, script, URL query, media, token and secret fields. Produces the exact 15 Tier-1 schemas from blueprint 23.2, each at its authoritative effect producer; versioned metric source/eligible/filter/window SQL; transactional/two-phase-safe emission through Outbox; pseudonymous analytics storage; active-time calculation; daily authority reconciliation; 90-day raw/13-month aggregate retention; and trust-state metrics. Canvas save start/ack share `(canvasId,saveCycleId)` and review events share `(reviewRequestId,subjectVersionId)`.

**Integration Gate:** `C/D/A/G/M/Q` Modify; Collab and Web main entrypoints also change outside the fixed-point catalog; `W` N/A because analytics bootstrap adds no route; `R/T` N/A. Add exact `@opentelemetry/sdk-node@0.203.0`, `@sentry/node@10.8.0`, `@sentry/react@10.8.0` and update lockfile.

- [ ] **Step 1: Write canary-redaction, trace and restore tests**

Inject unique secret/script/prompt/media URL/name canaries into success/error/provider/analytics paths and assert none appear in logs/traces/Sentry/analytics payloads. Validate all 15 Tier-1 schemas: `project_created`, `script_revision_saved`, `generation_job_confirmed`, `generation_job_terminal`, `asset_selection_recorded`, `asset_approval_recorded`, `triage_item_completed`, `timeline_preview_ready`, `review_request_created`, `review_decision_recorded`, `export_qc_completed`, `export_job_terminal`, `review_issue_reopened`, `canvas_save_cycle_started`, `canvas_durable_ack`. Require schemaVersion, pseudonymous tenant/actor, project/episode/session/appVersion/source and event-specific dedupe fields; reject forbidden content. Duplicate eventId is idempotent. Each producer test crashes before/after authority effect and proves one event bound to that effect, never a later analytics-only transaction.

For Canvas, first server receipt of an update/flush for a new saveCycleId persists `canvas_save_cycle_started`; only the durable append/flush marker permits `canvas_durable_ack` with the same ID. Replay, owner routing and failover produce one pair, while an offline-only IndexedDB save produces neither. Simulate visible/hidden and >5-minute inactivity to verify active-time rules. `metric-catalog.ts` maps every product metric to blueprint 23.1 authoritative tables, dedupe key/server clock, versioned SQL, window timezone and fixture numerator/denominator; analytics events never override authority. Daily reconciliation compares each event type to PostgreSQL authority, marks dashboards untrusted over 0.5% count difference or any ledger amount difference. One generation trace matches across Web/API/Dispatcher/Generation/Media and one collaboration trace matches Web/Collab/PostgreSQL projection/API read. Backup PostgreSQL+object version+Yjs full update, destroy test environment, restore and compare snapshot/ledger/asset hashes to signed RPO/RTO.

- [ ] **Step 2: Run RED**

Run: `pnpm --filter @comic-canvas/observability test -- redaction.test.ts`<br>
Expected: FAIL because redaction policy is absent.

- [ ] **Step 3: Implement instrumentation, alerts and executable runbooks**

Add structured logger/OTel/Sentry hooks, provider circuit breaker metrics, queue/Yjs/media/cost dashboards and alerts from blueprint 19.2. Wire each named producer in `Files`: project/script/job confirm/selection/approval/triage/timeline preview/review request-decision-issue/export command use their existing authority transaction; Generation terminal uses its Job effect transaction; Media QC/export terminal and Collab durable save use the Task 09 durable-marker then receipt pattern before analytics terminalization. Q delivers analytics idempotently; no central service guesses events by polling. Store no script/prompt/media URL/name/provider secret, retain raw pseudonymous events 90 days and aggregates 13 months, and execute deletion through pseudonymous mapping. Versioned SQL calculates every metric only from the cataloged authority source and outputs numerator/denominator/eligible/window/version; Reconciler publishes 95% interval, freshness/coverage/duplicate rates and explicit trusted/untrusted. Add a Compose `observability` profile and a Kubernetes observability overlay; all six Task 02 entrypoints export health/metrics/traces internally, collectors use bounded queues and NetworkPolicy, and dashboards receive no public ingress or embedded credentials. Runbooks name owner, trigger, diagnostic query, safe action, escalation, recovery proof and postmortem evidence; commands use scoped IDs, never broad deletes.

- [ ] **Step 4: Verify full trace and disaster recovery**

Run: `pnpm install --lockfile-only && pnpm install --frozen-lockfile && pnpm --filter @comic-canvas/contracts test -- analytics.contract.test.ts && pnpm --filter @comic-canvas/db test -- metric-authority.fixture.test.ts && pnpm --filter @comic-canvas/observability test -- redaction.test.ts && pnpm --filter @comic-canvas/queue test -- analytics-queue.test.ts && pnpm --filter @comic-canvas/api test -- analytics.integration.test.ts && pnpm --filter @comic-canvas/web test -- active-time.test.ts && pnpm vitest run tests/integration/trace-propagation.test.ts tests/integration/backup-restore.test.ts`<br>
Expected: canary leaks 0; 15/15 Tier-1 schemas emit exactly once at their authority effect; saveCycle start/ack correlation survives two-replica failover; every metric fixture returns signed numerator/denominator from its cataloged source; retention/reconciliation/trust rules pass; one trace spans all hops; Compose and both deployment overlays render the internal-only observability path for all five images; restored reference/ledger/full-update hashes match 100% and measured RPO/RTO meet ADR-0006.

- [ ] **Step 5: Commit**

```bash
git add packages/contracts packages/db packages/queue packages/observability apps infra/docker/compose.yml infra/deploy/kubernetes infra/monitoring docs/runbooks tests/integration package.json pnpm-lock.yaml
git commit -m "feat: observe and recover the production workflow"
```

---

### Task 48: 完整 CI、安全与兼容门禁

**Files:**
- Modify: root `package.json`
- Modify: `.github/workflows/ci.yml`
- Create: `.github/workflows/provider-contracts.yml`, `.github/workflows/browser-matrix.yml`, `.github/workflows/release.yml`
- Create: `scripts/run-ci-gates.mjs`, `scripts/verify-migrations.mjs`, `scripts/verify-registrations.mjs`, `scripts/verify-openapi.mjs`, `scripts/verify-fixtures.mjs`, `scripts/verify-security-license.mjs`, `scripts/generate-sbom.mjs`, `scripts/verify-sbom.mjs`, `scripts/verify-release.mjs`
- Create: `tests/fixtures/repository/missing-worker-registration.json`
- Create: `docs/runbooks/ci-failures.md`

**Interfaces:** CI stages are preflight -> workspace/format/lint/boundary/type -> unit/property -> migration/RLS/integration -> provider recorded contracts -> Playwright Tier A/B/Mobile -> axe/security/license -> build/image/SBOM. Produces root `ci:local`, a machine-readable `ci-gates.json`, CycloneDX JSON plus SPDX JSON for each of the five images, vulnerability/license decisions and an explicit managed-runner evidence manifest. A gate is exactly `PASS`, blocking `FAIL`, or named `MANAGED_ONLY_SKIP`; no silent omission is legal.

**Integration Gate:** `C/D/A/W/R/G/M/T/Q` N/A because this task adds no runtime registration; the verifier inspects every existing fixed point.

- [ ] **Step 1: Write repository verifiers and deliberate failing fixtures**

Each verifier has a committed negative fixture proving it fails for missing AppModule import, Worker processor, route, node renderer, contract export, migration number, rights checksum or lockfile drift. Normal repository scans explicitly exclude `tests/fixtures/repository/**`; only verifier self-tests pass those files through `--fixture`. `verify-openapi` boots Task 04's `buildOpenApiDocument`, maps every controller method to capability plus request/response Zod schema and fails drift; it does not generate the first API description in Task 48. Keep the invalid fixture permanently so future verifier regressions retain a RED oracle.

- [ ] **Step 2: Run RED on one controlled violation**

Run: `node scripts/verify-registrations.mjs --fixture tests/fixtures/repository/missing-worker-registration.json`<br>
Expected: FAIL `WORKER_PROCESSOR_UNREGISTERED: render-export`.

- [ ] **Step 3: Implement fixed-version CI jobs**

Use Node/pnpm/FFmpeg/k6/browser versions from ADR-0006, least-privilege service accounts and concurrency cancellation by branch. `run-ci-gates.mjs` owns one ordered stage registry used by local and hosted CI, captures command/version/duration/exit status/artifact hash, and rejects an unknown or unreported stage. The local path runs Prettier check, dependency-cruiser boundaries, all static verifiers, unit/property/migration/RLS/integration suites, recorded provider contracts, locally available Chromium/Firefox/WebKit plus mobile-emulation projects, the axe suite, containerized pinned secret/advisory/license scanners, builds, all five OCI image checks, all six runtime-entrypoint checks and per-image SBOM generation/validation. Serious/critical axe, high/critical reachable dependency advisory, secret scan, prohibited/copyleft-incompatible license, RLS/schema drift, provider contract, P0 browser, mutable image, root container or SBOM/provenance failure blocks merge. Recorded provider tests never require production secrets.

Only a browser/OS/device combination that ADR-0006 proves cannot run on the current host may emit `MANAGED_ONLY_SKIP`; each skip contains the exact matrix cell, workflow job name and expected artifact schema. Hosted `browser-matrix.yml` must produce those signed artifacts, and `verify-release` treats any unresolved skip, stale SHA, unsigned result or missing device evidence as failure. Security/license/SBOM tooling runs from digest-pinned images in ADR-0006; generated reports bind package/image digest, scanner DB digest and `RELEASE_SHA`.

- [ ] **Step 4: Verify the complete local CI equivalent**

Run: `pnpm ci:local -- --evidence-dir test-results/ci-local`<br>
Expected: exit 0 only after every locally executable stage reports `PASS`; format and dependency boundaries are clean; 20 migrations are contiguous; every fixed registration is present; OpenAPI/contracts and golden hashes align; recorded provider, E2E/mobile-emulation and axe suites pass; secret/advisory/license findings are below the signed policy; exactly five non-root healthy images build; ten valid SBOM documents bind those image digests. `ci-gates.json` may contain only the ADR-0006 allowlisted `MANAGED_ONLY_SKIP` matrix cells and names the hosted artifact required to resolve each one; injecting one unregistered skip makes this command fail.

- [ ] **Step 5: Commit**

```bash
git add package.json .github scripts docs/runbooks/ci-failures.md tests/fixtures/repository
git commit -m "ci: enforce complete delivery gates"
```

---

### Task 49: 固定负载性能、SSE 与画布发布门禁

**Files:**
- Create: `tests/performance/k6/api-read.js`, `tests/performance/k6/api-write.js`, `tests/performance/k6/sse.js`, `tests/performance/k6/job-create.js`, `tests/performance/k6/batch-control.js`
- Modify: `tests/performance/canvas-spike.spec.ts`
- Create: `tests/performance/performance-budget.json`, `tests/performance/run-performance.mjs`, `tests/performance/seed-performance.mjs`, `tests/performance/auth-performance.mjs`, `scripts/compare-performance.mjs`
- Create: `tests/fixtures/performance/sample.json`, `tests/fixtures/performance/impossible-budget.json`
- Modify: `.github/workflows/ci.yml`, `docs/adr/0002-canvas-renderer-and-scale.md`, `docs/adr/0006-deployment-ci-release.md`

**Interfaces:** Produces a hermetic performance runner that starts the pinned stack, migrates, seeds two tenants/projects, obtains non-production OIDC tokens for exact roles, runs k6/Playwright, stores raw artifacts and tears down; emits machine-readable PASS/FAIL for release hard gates and non-blocking 5000/10000 trends.

**Integration Gate:** `C/D/A/W/R/G/M/T/Q` N/A because this task adds no product registration; performance tests exercise the existing `A/W/R/G/M/Q` paths and fixed schemas from `C/D`, while `T` is unchanged.

- [ ] **Step 1: Encode exact scenarios and thresholds**

Create all scenario files, both deterministic sample/budget fixtures and a complete `scripts/compare-performance.mjs` before the RED run. Comparator parses two explicit JSON paths, validates schema/version/workload identity, compares nearest-rank latency/FPS/heap/error/loss/leak/duplicate metrics against every signed absolute budget, prints one stable `PERF_BUDGET_EXCEEDED <metric> actual=<n> limit=<n>` per breach and exits 1 for any breach or missing metric; it never silently defaults a threshold.

API read: 50 VUs/5m, P95 <=300ms, error <1%. Write/idempotency: 20 VUs/5m, P95 <=500ms, duplicate mutations 0. Job create with non-production Fake: 20 VUs/5m, P95 <=800ms, queue acceptance >=99%, duplicate charge 0. Project SSE: 500 authorized connections/10m spread across seeded projects, delivery P95 <2s, replay-gap reset/reconnect event loss 0, cross-project leak 0, connection error <0.5%. Batch controls: 20 VUs/5m, P95 <=800ms, illegal transition 0. Canvas 500/1000 uses blueprint FPS/start/heap gates over five cold/five warm runs. Runner refuses production URLs and records image/seed/auth-fixture hashes.

- [ ] **Step 2: Run RED against an intentionally impossible comparison budget**

Run: `node scripts/compare-performance.mjs tests/fixtures/performance/sample.json tests/fixtures/performance/impossible-budget.json`<br>
Expected: FAIL listing start/FPS/heap/API/SSE threshold breaches.

- [ ] **Step 3: Implement collection, percentile and baseline rules**

Use k6 `1.0.0`, the Task 02 Compose profile plus pinned app images, deterministic migrator/seed, Keycloak test realm/client and short role tokens, fixed baseline machine/network/cache, nearest-rank percentiles and raw samples. Readiness checks wait for API/Collab/Dispatcher/Generation Worker/Media Worker/Redis/PostgreSQL/MinIO; teardown preserves only signed artifacts. 500/1000 and API/Project-SSE are blocking; 5000/10000 record cold open/search/heap/failure mode only and cannot fail MVP. Regression comparison uses signed absolute budgets, not a moving best run.

- [ ] **Step 4: Run all release performance gates**

Run: `node tests/performance/run-performance.mjs --profile release`<br>
Expected: the runner proves non-production target, starts/health-checks/seeds/authenticates the full stack, every k6 threshold PASS, and teardown exits 0.<br>
Run: `pnpm exec playwright test tests/performance/canvas-spike.spec.ts --grep "^canvas (500|1000) logical nodes$"`<br>
Expected: exactly the two hard-size tests PASS; 5000/10000 are not selected and raw cold/warm artifacts are retained.

- [ ] **Step 5: Commit**

```bash
git add tests/performance tests/fixtures/performance scripts/compare-performance.mjs .github/workflows/ci.yml docs/adr/0002-canvas-renderer-and-scale.md docs/adr/0006-deployment-ci-release.md
git commit -m "perf: enforce fixed production budgets"
```

---

### Task 50: 黄金链路、封测证据与发布开关

**Files:**
- Create: `tests/e2e/specs/golden-comic-production.spec.ts`, `tests/e2e/specs/failure-recovery.spec.ts`, `tests/e2e/specs/snapshot-restore.spec.ts`, `tests/e2e/specs/tenant-security.spec.ts`
- Create: `scripts/record-release-candidate.mjs`, `scripts/collect-release-evidence.mjs`, `scripts/verify-golden-output.mjs`, `scripts/manage-beta-access.mjs`, `scripts/run-beta-release.mjs`
- Create: `docs/releases/mvp-beta-checklist.md`, `docs/releases/human-usability-evidence.md`, `docs/releases/continuity-review-evidence.md`, `docs/releases/mvp-beta-attestation.md`, `docs/runbooks/beta-operations.md`
- Modify: `.github/workflows/release.yml`, `scripts/verify-release.mjs`

**Interfaces:** Produces `test-results/release-candidate.json {schemaVersion,commitSha,createdAt,imageManifestPath?}` as the cross-shell candidate authority and a signed release evidence bundle tied to that immutable commit/image digests, six ADRs, automated/human test reports, golden output hashes, migration head and approvers. Every later command consumes `--candidate-file`; no shell environment variable carries the SHA. Release uses Task 08's persisted/audited invitation allowlist, explicit beta mode and rollback target; the later documentation-attestation commit is never substituted for the deployed SHA.

**Integration Gate:** `C/D/A/W/R/G/M/T/Q` N/A because no new feature registration is allowed here; the final verifier checks every existing registration plus all package manifests/migrations.

- [ ] **Step 1: Write exact browser scenarios and release-evidence assertions**

Golden scenario uses visible Web UI for every creator/reviewer command: login, project/Episode, 1000-2000-char source, 3 scenes/12 shots, Character/Location/Style/Prop Approval, 12-image batch with two injected failures, retry-failed only, 4-candidate Triage, video/TTS/static fallback, five Storyboard diff dispositions, ProjectSnapshot restore, review Issue and QC-pass MP4/SRT/ZIP/Manifest. Playwright API may seed failure timing and query assertions only; it cannot create domain rows or invoke workflow commands. Recovery covers refresh/offline/Collab crash/all Worker checkpoints/duplicate webhook/all recovery results; tenant scenario attacks HTTP/WS/project-SSE/upload/share/signed URL including same-tenant/no-Project-membership. Release verifier also requires signed human usability and continuity schemas tied to one candidate SHA.

- [ ] **Step 2: Run the release-evidence RED gate**

Run: `node scripts/verify-release.mjs --commit HEAD --environment staging --evidence-dir test-results/release-empty`<br>
Expected: FAIL with stable codes `RELEASE_CANDIDATE_NOT_RECORDED`, `HUMAN_USABILITY_EVIDENCE_MISSING` and `CONTINUITY_REVIEW_EVIDENCE_MISSING`; it must not fail because the verifier or schema is absent.

- [ ] **Step 3: Implement gates and freeze the release candidate commit**

Implement the four browser suites, candidate recorder, golden verifier, allowlist administration with dry-run/audit/revoke, release workflow and evidence schemas. `record-release-candidate.mjs` resolves `HEAD` through argument-array process spawn, validates a clean application/test/config tree, writes canonical JSON atomically, and later tools reject a missing/stale/changed commit or image manifest. Human usability evidence requires cohort/numerator/denominator/raw checksum and proves core completion `>=90%`, status recognition within 5 seconds `>=90%`, golden Triage wrong Selection/Approval 0 plus separate `>=100` corpus error `<=1%`, SUS `>=80`, per-core-task SEQ `>=5.5/7`; continuity evidence requires two independent reviewers, mean `>=4.0`, no main-character shot `<3`, weighted Kappa `>=0.60`. Both require Product/Design/QA signatures and pseudonymized sources.

Run focused schema/list tests, then commit all application/test/workflow/runbook changes. Record the resulting immutable commit and image set as `RELEASE_SHA`; after this point any application/test/config change creates a new candidate SHA and restarts Step 4 from the beginning.

```bash
git add tests/e2e scripts/record-release-candidate.mjs scripts/collect-release-evidence.mjs scripts/verify-golden-output.mjs scripts/manage-beta-access.mjs scripts/run-beta-release.mjs scripts/verify-release.mjs docs/releases/mvp-beta-checklist.md docs/runbooks/beta-operations.md .github/workflows/release.yml
git commit -m "test: define invitation beta release gates"
node scripts/record-release-candidate.mjs --commit HEAD --out test-results/release-candidate.json
```

- [ ] **Step 4: Verify, deploy and rehearse the exact candidate SHA**

Run Task 48's complete `ci:local` registry, resolve every `MANAGED_ONLY_SKIP` with signed hosted browser/OS/device artifacts for the candidate JSON's commit, then run Task 49's hermetic performance runner, golden exact-byte/decoded-stream verifier and Task 47 restore/reconciliation. Execute the signed usability/continuity protocol on that candidate and store the two evidence files with raw-artifact checksums. `verify-release --candidate-file test-results/release-candidate.json` passes only with Task 00-49 evidence, 20 migrations, nine fixed registrations, RPO/RTO, zero unresolved CI skips, browser matrix, k6 and 500/1000 gates, analytics trust, five digest-bound image/SBOM/provenance sets, rights/legal/operations/human approvals and rollback artifact.

Release workflow first runs no-charge Fake smoke in an isolated staging build where the test adapter is injected; it then proves the production image/registry contains no Fake, deploys exactly the signed production image digests recorded for the candidate with `BETA_ACCESS_MODE=off`, migrates as owner and starts the five least-privilege runtime DB roles. Production runs `/health`, a no-charge estimate/dry-run and one explicitly approved rights-cleared real-provider smoke. Seed the audited allowlist with `manage-beta-access.mjs`, switch to `allowlist`, verify an invited and a denied account, then rehearse flag-off plus rollback to the named prior image without down-migration. Expected: evidence/image/deployment commit all equal the candidate JSON's `commitSha`, existing Jobs remain recoverable, and read-only access returns within ADR-0006 RTO.

Run: `pnpm ci:local -- --candidate-file test-results/release-candidate.json --evidence-dir test-results/ci-local`<br>
Expected: every local gate reports PASS, only ADR-approved managed matrix cells report `MANAGED_ONLY_SKIP`, 0 failed tests, 0 axe serious/critical, 0 duplicate charges, 0 cross-project access, exactly five image/SBOM sets and build provenance equals candidate `commitSha`; the candidate JSON is augmented/verified with the immutable image manifest path/hash.<br>
Run: `node tests/performance/run-performance.mjs --profile release --candidate-file test-results/release-candidate.json && node scripts/verify-golden-output.mjs tests/fixtures/golden/expected.json test-results/golden && node scripts/collect-release-evidence.mjs --candidate-file test-results/release-candidate.json --ci-evidence test-results/ci-local --out test-results/release && node scripts/verify-release.mjs --candidate-file test-results/release-candidate.json --environment staging --evidence-dir test-results/release`<br>
Expected: all automated, hosted-matrix and signed human thresholds pass; evidence bundle reports one SHA, zero unresolved CI skips and zero untrusted analytics.<br>
Run: `node scripts/run-beta-release.mjs --candidate-file test-results/release-candidate.json --mode allowlist --rollback-rehearsal`<br>
Expected: staging Fake, production-no-Fake, dry-run, approved real smoke, allowlist allow/deny and rollback checks all PASS against the same image digests.

- [ ] **Step 5: Commit the docs-only signed attestation**

```bash
git add docs/releases/human-usability-evidence.md docs/releases/continuity-review-evidence.md docs/releases/mvp-beta-attestation.md
git commit -m "release: attest invitation beta candidate"
```

The attestation names `RELEASE_SHA`, image digests, evidence hashes, allowlist audit ID, real-provider smoke charge and rollback result. It is documentation-only, excluded from every image build context, and does not change or relabel the deployed candidate SHA.

---

### Task 51: Skill 市场基础架构

**Consumes:** Task 07 (PostgreSQL RLS), Task 08 (OIDC + project authorization), Task 23 (provider SDK + capability catalog), Task 24 (integer micro-unit ledger).

**Produces:** `Skill` domain model and repository; `SkillPublishController` in `apps/api` with `/api/skills` CRUD; sandbox test runner; install workflow that clones templates into tenant projects with isolated Job/Attempt execution.

**Files:**
- Create: `packages/skill-market/src/skill-model.ts`
- Create: `packages/skill-market/src/skill-repository.ts`
- Create: `packages/skill-market/src/skill-audit.ts`
- Create: `packages/skill-market/src/skill-sandbox.ts`
- Create: `packages/skill-market/package.json`
- Create: `packages/skill-market/tsconfig.json`
- Create: `packages/skill-market/src/index.ts`
- Create: `apps/api/src/modules/skill-market/skill-market.module.ts`
- Create: `apps/api/src/modules/skill-market/skill-market.controller.ts`
- Create: `apps/api/src/modules/skill-market/dtos/skill-publish.dto.ts`
- Create: `apps/api/src/modules/skill-market/dtos/skill-install.dto.ts`
- Create: `apps/api/src/modules/skill-market/dtos/skill-execute.dto.ts`
- Create: `packages/db/migrations/0021_skill-market.sql`
- Create: `packages/db/src/schema/skill-market.ts`
- Create: `packages/skill-market/src/skill-model.test.ts`
- Create: `packages/skill-market/src/skill-repository.test.ts`
- Create: `tests/e2e/specs/skill-market-publish.spec.ts`
- Create: `tests/e2e/specs/skill-market-install.spec.ts`
- Create: `tests/e2e/specs/skill-market-security.spec.ts`

**Integration Gate:**
| Point | Action |
|-------|--------|
| C (Controller) | Modify: register `SkillMarketController` in `apps/api` with `/api/skills` routes |
| D (DB/Schema/Migration) | Modify: `packages/db/src/schema/skill-market.ts` + `packages/db/migrations/0021_skill-market.sql` with FORCE RLS |
| A (Asset) | N/A: skills are templates, not media assets |
| W (Worker) | N/A: skill execution reuses existing BullMQ workers |
| R (Router) | Modify: register skill routes in API router |
| G (Generation Worker/Provider Registry) | N/A: skill execution reuses existing generation workers |
| M (Module) | Modify: add skill-market module to monorepo |
| T (Test) | Modify: add unit + e2e tests |
| Q (Queue) | N/A: no new queue types |

**Security boundary:** All skill tables FORCE RLS. Cross-tenant skill access denied. Skill templates signed with sha256 on publish. Execution reuses Job/Attempt/Batch model with UsageReservation. No frontend direct provider calls; skill execution routes through API.

- [ ] **Step 1: Write RED test for skill repository and controller contract**

Write `packages/skill-market/src/skill-model.test.ts` that imports the skill schema (not yet existing), validates field types, enum values, and RLS policy. Write `packages/skill-market/src/skill-repository.test.ts` that imports repository methods (not yet existing), verifies CRUD through RLS-scoped context. Write `tests/e2e/specs/skill-market-security.spec.ts` that hits `/api/skills` endpoints (not yet implemented) and expects 501 Not Implemented or module-not-found errors.

- [ ] **Step 2: Run RED against missing skill market**

Run: `pnpm exec vitest run packages/skill-market/src/skill-model.test.ts packages/skill-market/src/skill-repository.test.ts`
Expected: FAIL with import errors — `packages/skill-market` does not exist yet.
Run: `pnpm exec playwright test tests/e2e/specs/skill-market-security.spec.ts`
Expected: FAIL with route-not-found errors — `/api/skills` controller not registered.

- [ ] **Step 3: Implement Skill model, repository, sandbox, and API module**

Create `packages/db/migrations/0021_skill-market.sql`: `skills` table with `skillId, tenantId, name, description, category, schemaVersion, parameterSchema JSONB, dependencyList JSONB, priceMicro INTEGER, license TEXT, auditStatus TEXT CHECK IN (sandbox_pending, sandbox_passed, approved, rejected), publishedAt TIMESTAMP, publishedBy TEXT, executionCount INTEGER`. All columns except id non-nullable with defaults. FORCE RLS on `skills`. Foreign key `(tenantId) REFERENCES tenants(tenantId)`.

Create Skill model with Zod validation. Repository with RLS-scoped CRUD. Sandbox runner that executes template against fixture inputs, asserts output matches `expectedSchema`. Controller with publish (submit + sandbox + audit), install (preview + clone to tenant project), execute (validate params + estimate cost + create Job). Cross-tenant checks deny access. All API calls require OIDC auth and project scope.

- [ ] **Step 4: Verify skill lifecycle and security**

Run: `pnpm exec vitest run packages/skill-market/src/`
Expected: All unit tests PASS — model validation, repository CRUD, sandbox execution.
Run: `pnpm exec playwright test tests/e2e/specs/skill-market-publish.spec.ts tests/e2e/specs/skill-market-install.spec.ts tests/e2e/specs/skill-market-security.spec.ts`
Expected: Publish flow PASS. Install flow PASS. Cross-tenant access denied. Parameter validation rejects invalid input. Cost estimation before execution. Force RLS enforced.

- [ ] **Step 5: Commit**

```bash
git add packages/skill-market/package.json packages/skill-market/tsconfig.json packages/skill-market/src/index.ts packages/skill-market/src/skill-model.ts packages/skill-market/src/skill-repository.ts packages/skill-market/src/skill-audit.ts packages/skill-market/src/skill-sandbox.ts packages/skill-market/src/skill-model.test.ts packages/skill-market/src/skill-repository.test.ts apps/api/src/modules/skill-market/skill-market.module.ts apps/api/src/modules/skill-market/skill-market.controller.ts apps/api/src/modules/skill-market/dtos/skill-publish.dto.ts apps/api/src/modules/skill-market/dtos/skill-install.dto.ts apps/api/src/modules/skill-market/dtos/skill-execute.dto.ts packages/db/migrations/0021_skill-market.sql packages/db/src/schema/skill-market.ts tests/e2e/specs/skill-market-publish.spec.ts tests/e2e/specs/skill-market-install.spec.ts tests/e2e/specs/skill-market-security.spec.ts
pnpm --filter @comic-canvas/db test:migration -- 0021_skill-market.sql
git commit -m "feat: skill market infrastructure with RLS, sandbox, and cost estimation"
```

---

### Task 52: 导演台

**Consumes:** Task 08 (OIDC + project authorization), Task 10 (project/episode/Canvas session), Task 12 (Yjs document + canvas nodes), Task 23 (provider SDK + capability catalog), Task 28 (batch generation), Task 11 (Rights/Moderation/ApprovalGate), Task 31 (ReferenceBinding authority).

**Produces:** `DirectorRoute` at `/director` with three panels (character, scene, style); `DirectorStore` connecting to canvas nodes via ReferenceBinding; reference grid with weighted multi-image inputs; character 3-view generation through existing Job/Attempt pipeline.

**Files:**
- Create: `apps/web/src/routes/director/director-route.tsx`
- Create: `apps/web/src/components/director/character-panel.tsx`
- Create: `apps/web/src/components/director/scene-panel.tsx`
- Create: `apps/web/src/components/director/style-panel.tsx`
- Create: `apps/web/src/components/director/reference-grid.tsx`
- Create: `apps/web/src/components/director/character-3view.tsx`
- Create: `apps/web/src/stores/director-store.ts`
- Create: `apps/web/src/stores/director-store.test.ts`
- Create: `tests/e2e/specs/director-panel.spec.ts`
- Modify: `apps/web/src/app/router.tsx`

**Integration Gate:**
| Point | Action |
|-------|--------|
| C (Controller) | N/A: director is UI-only, data flows through existing canvas/project controllers |
| D (DB/Schema/Migration) | N/A: uses existing domain models (Character, Scene, Style, Asset, ReferenceBinding) |
| A (Asset) | N/A: references existing immutable assets via signed URLs |
| W (Worker) | N/A: generation jobs use existing workers |
| R (Router) | Modify: add `/director` route in `apps/web` route config |
| G (Generation Worker/Provider Registry) | N/A: no new generation workers |
| M (Module) | Modify: add director components to web app |
| T (Test) | Modify: unit + e2e tests |
| Q (Queue) | N/A: no new queue types |

**Security boundary:** No frontend direct provider calls. All generation triggered via `/api/jobs` with project scope and capability permission check. Assets accessed through signed URLs only. ReferenceBinding writes go through canvas mutation API with project scope. Stale propagation follows existing model — upstream changes mark downstream stale without auto-regeneration or auto-charging. Does not copy LibTV brand, icons, layout, or copy.

- [ ] **Step 1: Write RED test for director store contract and e2e route existence**

Write `apps/web/src/stores/director-store.test.ts` that imports `DirectorStore` (not yet existing), verifies initial state, panel actions, and reference grid state. Write `tests/e2e/specs/director-panel.spec.ts` that navigates to `/director` (not yet registered) and expects route-not-found.

- [ ] **Step 2: Run RED against missing director**

Run: `pnpm exec vitest run apps/web/src/stores/director-store.test.ts`
Expected: FAIL with module-not-found — `director-store.ts` does not exist.
Run: `pnpm exec playwright test tests/e2e/specs/director-panel.spec.ts`
Expected: FAIL with `/director` route not registered in router.

- [ ] **Step 3: Implement director route, three panels, store, reference grid, and 3-view**

Register `/director` route requiring OIDC auth and project membership. Character panel lists approved characters from existing Character domain, shows reference images as signed URLs, triggers 3-view generation via `/api/jobs` with character consistency parameters. Scene panel manages scene settings and background library. Style panel manages presets and consistency scoring. Reference grid (3x3) supports weighted multi-image reference combination with weight sliders; output feeds into image generation Job as structured reference parameters. All panels read/write canvas state through ReferenceBinding — no direct provider or asset access.

- [ ] **Step 4: Verify panel rendering, interactions, and security**

Run: `pnpm exec vitest run apps/web/src/stores/director-store.test.ts`
Expected: All store unit tests PASS — initial state, panel actions, reference grid state.
Run: `pnpm exec playwright test tests/e2e/specs/director-panel.spec.ts`
Expected: All three panels render. Reference grid creates weighted references. 3-view generation triggers Jobs through API (not direct provider call). Consistency scoring updates. Unauthorized access to `/director` denied.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/routes/director/director-route.tsx apps/web/src/components/director/character-panel.tsx apps/web/src/components/director/scene-panel.tsx apps/web/src/components/director/style-panel.tsx apps/web/src/components/director/reference-grid.tsx apps/web/src/components/director/character-3view.tsx apps/web/src/stores/director-store.ts apps/web/src/stores/director-store.test.ts tests/e2e/specs/director-panel.spec.ts apps/web/src/app/router.tsx
git commit -m "feat: director panels for character, scene, style with ReferenceBinding"
```

---

### Task 53: 逐帧拉片

**Consumes:** Task 10 (project/episode/Canvas session), Task 39 (Timeline revision + clip references), Task 40 (Timeline UI), Task 45 (FFmpeg export with QC), Task 21 (immutable assets + signed URLs).

**Produces:** `FrameInspector` component with frame-level seek and markers; `FrameCompare` mode showing storyboard image alongside video frame; `useFrameSeek` and `useFrameMarkers` hooks; duration adjustment with stale propagation; subtitle alignment tool linking text segments to frame ranges.

**Files:**
- Create: `apps/web/src/components/timeline/frame-inspector.tsx`
- Create: `apps/web/src/components/timeline/frame-compare.tsx`
- Create: `apps/web/src/hooks/use-frame-seek.ts`
- Create: `apps/web/src/hooks/use-frame-markers.ts`
- Create: `apps/web/src/hooks/use-frame-seek.test.ts`
- Create: `apps/web/src/hooks/use-frame-markers.test.ts`
- Create: `tests/e2e/specs/frame-inspector.spec.ts`
- Modify: `apps/web/src/timeline/timeline-page.tsx`

**Integration Gate:**
| Point | Action |
|-------|--------|
| C (Controller) | N/A: frame inspection is UI-layer; clip modifications route through existing timeline API |
| D (DB/Schema/Migration) | N/A: frame markers are UI-state, not persisted domain entities |
| A (Asset) | N/A: references existing immutable assets via signed URLs |
| W (Worker) | N/A: no new workers |
| R (Router) | N/A: frame inspector is embedded in existing timeline route |
| G (Generation Worker/Provider Registry) | N/A: no new generation workers |
| M (Module) | Modify: add frame components to timeline module in web app |
| T (Test) | Modify: unit + e2e tests |
| Q (Queue) | N/A: no new queue types |

**Security boundary:** Frame inspection uses signed URLs from existing media asset pipeline (Task 21). No direct object storage access. Duration adjustment writes timeline clip state through existing API with project scope. Manifest references preserved — frame markers are UI annotations, not asset mutations.

- [ ] **Step 1: Write RED test for frame seek hook and e2e component rendering**

Write `apps/web/src/hooks/use-frame-seek.test.ts` that imports `useFrameSeek` (not yet existing), verifies frame-precision calculation from FPS. Write `apps/web/src/hooks/use-frame-markers.test.ts` that imports `useFrameMarkers` (not yet existing), verifies marker CRUD operations. Write `tests/e2e/specs/frame-inspector.spec.ts` that loads timeline route (existing from Task 40) and expects frame-inspector component not found.

- [ ] **Step 2: Run RED against missing frame components**

Run: `pnpm exec vitest run apps/web/src/hooks/use-frame-seek.test.ts apps/web/src/hooks/use-frame-markers.test.ts`
Expected: FAIL with module-not-found — hooks do not exist.
Run: `pnpm exec playwright test tests/e2e/specs/frame-inspector.spec.ts`
Expected: FAIL with frame-inspector component not rendered in the timeline page.

- [ ] **Step 3: Implement frame inspector, compare mode, seek/markers hooks**

Frame seek uses video element `currentTime` with frame-precision rounding (offset / FPS). Comparison mode splits viewport: storyboard image (signed URL) left, video frame right. Duration drag modifies timeline clip end time through existing timeline API — stale propagation follows canonical model. Subtitle alignment shows waveform + frame markers, links text segments to frame ranges. Frame marker model: `(shotId, frameOffset, label, notes)`. All state is UI-local; clip modifications persist through existing API with project scope.

- [ ] **Step 4: Verify frame operations**

Run: `pnpm exec vitest run apps/web/src/hooks/use-frame-seek.test.ts apps/web/src/hooks/use-frame-markers.test.ts`
Expected: Frame precision calculation correct. Marker CRUD operations correct.
Run: `pnpm exec playwright test tests/e2e/specs/frame-inspector.spec.ts`
Expected: Frame seek accuracy verified. Comparison mode renders storyboard and video side by side. Duration adjustment propagates stale to downstream clips. Subtitle alignment shows waveform + markers.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/timeline/frame-inspector.tsx apps/web/src/components/timeline/frame-compare.tsx apps/web/src/hooks/use-frame-seek.ts apps/web/src/hooks/use-frame-markers.ts apps/web/src/hooks/use-frame-seek.test.ts apps/web/src/hooks/use-frame-markers.test.ts tests/e2e/specs/frame-inspector.spec.ts apps/web/src/timeline/timeline-page.tsx
git commit -m "feat: frame-by-frame inspection and comparison tools on timeline"
```

---

### Task 54: AutoLink

**Consumes:** Task 10 (project/episode/Canvas session), Task 31 (ReferenceBinding authority), Task 12 (Yjs document + canvas graph projection), Task 32 (Prompt Compiler + stale invalidation).

**Produces:** `AutoLinkEngine` that traverses canvas graph downstream from Script nodes to find broken reference chains; `StaleAnalyzer` that computes downstream impact scope; `AutoLinkSuggestion` UI component showing non-intrusive badges on nodes with missing or stale references. AutoLink only suggests — user must confirm before any ReferenceBinding is written. Suggestions never auto-destroy existing references.

**Files:**
- Create: `packages/canvas-core/src/autolink/autolink-engine.ts`
- Create: `packages/canvas-core/src/autolink/stale-analyzer.ts`
- Create: `packages/canvas-core/src/autolink/autolink-engine.test.ts`
- Create: `packages/canvas-core/src/autolink/stale-analyzer.test.ts`
- Create: `apps/web/src/components/canvas/autolink-suggestion.tsx`
- Modify: `packages/canvas-core/src/graph-validator.ts`

**Integration Gate:**
| Point | Action |
|-------|--------|
| C (Controller) | N/A: autolink runs client-side; confirmed bindings write through existing canvas mutation API |
| D (DB/Schema/Migration) | N/A: uses existing domain models (ReferenceBinding, stale state) |
| A (Asset) | N/A: no asset creation |
| W (Worker) | N/A: client-side graph analysis |
| R (Router) | N/A: embedded in existing canvas route |
| G (Generation Worker/Provider Registry) | N/A: no new generation workers |
| M (Module) | Modify: add autolink package to canvas module |
| T (Test) | Modify: unit tests for engine + analyzer |
| Q (Queue) | N/A: no queue interaction |

**Security boundary:** AutoLink reads canvas graph state only. Suggestions are UI annotations — no server-side effect. User confirmation writes ReferenceBinding through existing canvas mutation API with project scope and capability permission. AutoLink never breaks existing references, never auto-generates Jobs, never auto-charges. Stale analysis reads downstream edges but does not mutate them.

- [ ] **Step 1: Write RED test for autolink engine contract**

Write `packages/canvas-core/src/autolink/autolink-engine.test.ts` that imports `AutoLinkEngine` (not yet existing), builds test graphs with broken chains, verifies suggestion ranking by type compatibility and temporal proximity. Write `packages/canvas-core/src/autolink/stale-analyzer.test.ts` that imports `StaleAnalyzer` (not yet existing), verifies downstream scope calculation matches expected nodes.

- [ ] **Step 2: Run RED against missing autolink**

Run: `pnpm exec vitest run packages/canvas-core/src/autolink/autolink-engine.test.ts packages/canvas-core/src/autolink/stale-analyzer.test.ts`
Expected: FAIL with module-not-found — autolink files do not exist.

- [ ] **Step 3: Implement autolink engine, stale analyzer, and UI suggestion component**

Engine traverses canvas graph from Script nodes downstream. For each node, checks input references: missing (no ReferenceBinding), stale (upstream version changed). Produces ranked suggestion list sorted by type compatibility, temporal proximity, semantic similarity. StaleAnalyzer computes downstream impact: all nodes that transitively depend on a changed upstream node. UI component shows suggestions as non-intrusive badges on nodes. User clicks to preview connection, confirms to create ReferenceBinding via existing canvas mutation API. Suggestions are ephemeral — discarded on undo or canvas reset.

- [ ] **Step 4: Verify autolink accuracy and safety**

Run: `pnpm exec vitest run packages/canvas-core/src/autolink/autolink-engine.test.ts packages/canvas-core/src/autolink/stale-analyzer.test.ts`
Expected: Correct suggestions for test graphs with broken chains. No false positives on complete graphs. Stale analysis matches expected downstream scope. Suggestions never break existing references. Confirmed bindings create ReferenceBinding with correct bindingId.

- [ ] **Step 5: Commit**

```bash
git add packages/canvas-core/src/autolink/autolink-engine.ts packages/canvas-core/src/autolink/stale-analyzer.ts packages/canvas-core/src/autolink/autolink-engine.test.ts packages/canvas-core/src/autolink/stale-analyzer.test.ts apps/web/src/components/canvas/autolink-suggestion.tsx packages/canvas-core/src/graph-validator.ts
git commit -m "feat: autolink engine for reference chain repair with user confirmation"
```

---

### Task 55: 视频合成

**Consumes:** Task 21 (immutable assets + signed URLs), Task 14 (offline canvas + draft), Task 45 (FFmpeg export pipeline + QC), Task 28 (batch generation + versioning), Task 23 (provider SDK + adapter layer).

**Produces:** `VideoComposer` in Media Worker that accepts multi-track composition spec (video clips, audio tracks, subtitle track), builds FFmpeg filter graph, produces preview (lower quality) and final render (production presets). `ExportComposerController` at `/api/export/compose` that creates composition Jobs through existing BullMQ queue with cost estimation. Composition output passes through existing QC pipeline (Task 45) and registers in Manifest (Task 44).

**Files:**
- Create: `apps/worker-media/src/video-composer.ts`
- Create: `apps/worker-media/src/ffmpeg-pipeline.ts`
- Create: `apps/worker-media/src/video-composer.test.ts`
- Create: `apps/api/src/export/export-composer.controller.ts`
- Create: `apps/api/src/export/dtos/composition-spec.dto.ts`
- Create: `tests/e2e/specs/video-composition.spec.ts`
- Modify: `apps/worker-media/src/processor-registry.ts`
- Modify: `apps/worker-media/src/main.ts`

**Integration Gate:**
| Point | Action |
|-------|--------|
| C (Controller) | Modify: register `ExportComposerController` at `/api/export/compose` in `apps/api` |
| D (DB/Schema/Migration) | N/A: composition uses existing Job/Attempt/Batch model |
| A (Asset) | Modify: composition output written to S3 with versioning, quarantined for scanning, signed URL for access |
| W (Worker) | Modify: add `video-composer` worker to BullMQ queue registry |
| R (Router) | Modify: add `/api/export/compose` route to API router |
| G (Generation Worker/Provider Registry) | N/A: no new generation workers; reuses FFmpeg worker |
| M (Module) | Modify: add composer to media-worker module |
| T (Test) | Modify: unit + e2e tests |
| Q (Queue) | Modify: add `composition` queue type to BullMQ with job envelope per Global Constraints |

**Security boundary:** Composition runs server-side in Media Worker — no frontend direct FFmpeg or provider calls. Input assets accessed via signed URLs from existing asset pipeline (Task 21). Output written to S3 with versioning and quarantined for virus scanning (Task 21). Composition Job uses existing UsageReservation + UsageLedger for cost estimation. FFmpeg binary checksum verified at startup. No object storage bypass. BullMQ envelope carries opaque `eventId/route/payloadHash` — worker bootstraps scope from database.

- [ ] **Step 1: Write RED test for video composer contract**

Write `apps/worker-media/src/video-composer.test.ts` that imports `VideoComposer` (not yet existing), verifies track model, FFmpeg filter graph construction, output validation. Test expects module-not-found.

- [ ] **Step 2: Run RED against missing composer**

Run: `pnpm exec vitest run apps/worker-media/src/video-composer.test.ts`
Expected: FAIL with module-not-found — `video-composer.ts` does not exist.
Run: `pnpm exec playwright test tests/e2e/specs/video-composition.spec.ts`
Expected: FAIL with `/api/export/compose` route not found.

- [ ] **Step 3: Implement FFmpeg pipeline, video composer, and API controller**

`ffmpeg-pipeline.ts`: builds FFmpeg filter graph from composition spec. Supports multi-input mixing (video + audio tracks), subtitle overlay (burn-in via ass filter or sidecar SRT generation), H.264 encoding at 1080x1920. Preview mode uses fast presets and lower bitrate. Final render uses production presets matching blueprint §19.1 quality targets. FFmpeg 7.1.1 binary checksum verified at startup.

`video-composer.ts`: accepts `CompositionSpec { tracks: [{ type: video|audio|subtitle, assetId, startTime, endTime, volume?, effects? }] }`. Resolves assetIds to signed URLs via existing asset service. Builds FFmpeg command. Writes output to S3 with versioning. Registers output in Manifest. Triggers quarantine scan.

`export-composer.controller.ts`: validates composition spec, estimates cost via UsageReservation, creates Job in BullMQ `composition` queue. Uses existing Job/Attempt model. Consumer receipt via outbox pattern.

- [ ] **Step 4: Verify composition end-to-end**

Run: `pnpm exec vitest run apps/worker-media/src/video-composer.test.ts`
Expected: Multi-track composition produces valid MP4. Subtitle alignment correct. Audio mixing levels match spec. FFmpeg checksum verified.
Run: `pnpm exec playwright test tests/e2e/specs/video-composition.spec.ts`
Expected: Composition job created and completed. Output passes QC. Cost estimation accurate. Manifest updated. Signed URL accessible. Unauthorized access denied.

- [ ] **Step 5: Commit**

```bash
git add apps/worker-media/src/video-composer.ts apps/worker-media/src/ffmpeg-pipeline.ts apps/worker-media/src/video-composer.test.ts apps/api/src/export/export-composer.controller.ts apps/api/src/export/dtos/composition-spec.dto.ts tests/e2e/specs/video-composition.spec.ts apps/worker-media/src/processor-registry.ts apps/worker-media/src/main.ts
git commit -m "feat: multi-track video composition with FFmpeg pipeline and QC"
```

---

### Task 56: 社区功能

**Consumes:** Task 08 (OIDC + project membership + capability permissions), Task 10 (project/episode), Task 42 (ApprovalGate + project snapshot), Task 43 (revoke share), Task 46 (GC + soft delete), Task 51 (skill market infrastructure).

**Produces:** `ShareController` at `/api/share` with time-limited, revocable share tokens; `ProfileController` at `/api/community/profile` for creator profiles and public project listings; `SharePage` and `ProfilePage` UI components. Share has modes: read-only (view only) and copyable (clone project structure without assets). Includes privacy controls, revoke, report, and audit trail.

**Files:**
- Create: `apps/api/src/community/share.controller.ts`
- Create: `apps/api/src/community/share.service.ts`
- Create: `apps/api/src/community/profile.controller.ts`
- Create: `apps/api/src/community/dtos/share-create.dto.ts`
- Create: `apps/api/src/community/dtos/report.dto.ts`
- Create: `apps/api/src/community/community.module.ts`
- Create: `packages/db/migrations/0022_community.sql`
- Create: `packages/db/src/schema/community.ts`
- Create: `apps/api/src/community/share.service.test.ts`
- Create: `apps/web/src/routes/community/share-page.tsx`
- Create: `apps/web/src/routes/community/profile-page.tsx`
- Create: `tests/e2e/specs/community-share.spec.ts`
- Create: `tests/e2e/specs/community-privacy.spec.ts`

**Integration Gate:**
| Point | Action |
|-------|--------|
| C (Controller) | Modify: register `ShareController` and `ProfileController` in `apps/api` |
| D (DB/Schema/Migration) | Modify: `packages/db/src/schema/community.ts` + `packages/db/migrations/0022_community.sql` with FORCE RLS |
| A (Asset) | N/A: share does not copy assets; copyable mode clones structure only |
| W (Worker) | N/A: no new workers |
| R (Router) | Modify: register share/profile routes in API router |
| G (Generation Worker/Provider Registry) | N/A: no new generation workers |
| M (Module) | Modify: add community module to monorepo |
| T (Test) | Modify: add unit + e2e tests |
| Q (Queue) | N/A: no new queue types |

**Security boundary:** All community tables FORCE RLS. Share tokens are time-limited and revocable. Share page renders read-only view — no edit capability, no asset download, no export. Copy mode clones project structure (nodes, connections, settings) without copying assets. Report feature creates auditable entries with actor identity. No LibTV brand/assets/copy/layout copied. Share tokens validated server-side — no client-side trust.

- [ ] **Step 1: Write RED test for share service and e2e share endpoint**

Write `apps/api/src/community/share.service.test.ts` that imports `ShareService` (not yet existing), verifies share token creation, validation, revocation, expiry. Write `tests/e2e/specs/community-share.spec.ts` that hits `/api/share` (not yet registered) expecting route-not-found. Write `tests/e2e/specs/community-privacy.spec.ts` that verifies unauthorized share access denied.

- [ ] **Step 2: Run RED against missing community module**

Run: `pnpm exec vitest run apps/api/src/community/share.service.test.ts`
Expected: FAIL with module-not-found — share service does not exist.
Run: `pnpm exec playwright test tests/e2e/specs/community-share.spec.ts`
Expected: FAIL with `/api/share` route not found.

- [ ] **Step 3: Implement share service, controllers, migration, UI pages**

`packages/db/migrations/0022_community.sql`: `project_shares` table with `shareId, projectId, tenantId, mode, expiresAt, revokedAt, createdBy, createdAt`. `project_reports` table with `reportId, projectId, reportType, description, reportedBy, reviewedAt, reviewedBy, resolved`. FORCE RLS on both.

`ShareService`: creates time-limited tokens, validates token (checks expiry, revocation, project membership), revokes tokens. Copy mode creates new project with cloned node structure (no assets). Share page shows read-only canvas. Profile page shows creator's public projects and skills. Report creates auditable entry. All API calls require OIDC auth.

- [ ] **Step 4: Verify share lifecycle, privacy, and security**

Run: `pnpm exec vitest run apps/api/src/community/share.service.test.ts`
Expected: Token creation PASS. Validation PASS. Revocation PASS. Expiry enforced. Copy mode clones structure only.
Run: `pnpm exec playwright test tests/e2e/specs/community-share.spec.ts tests/e2e/specs/community-privacy.spec.ts`
Expected: Share link works. Read-only view correct. Copy creates new project without assets. Unauthorized access denied. Revoked share returns 403. Report creates audit entry.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/community/share.controller.ts apps/api/src/community/share.service.ts apps/api/src/community/profile.controller.ts apps/api/src/community/dtos/share-create.dto.ts apps/api/src/community/dtos/report.dto.ts apps/api/src/community/community.module.ts apps/api/src/community/share.service.test.ts packages/db/migrations/0022_community.sql packages/db/src/schema/community.ts apps/web/src/routes/community/share-page.tsx apps/web/src/routes/community/profile-page.tsx tests/e2e/specs/community-share.spec.ts tests/e2e/specs/community-privacy.spec.ts
pnpm --filter @comic-canvas/db test:migration -- 0022_community.sql
git commit -m "feat: community share links, profiles, and report system with RLS"
```

---

### Task 57: Blender 插件

**Consumes:** Task 08 (OIDC + project scope), Task 10 (project/episode), Task 31 (ReferenceBinding + scene data), Task 21 (immutable assets + signed URLs).

**Produces:** Blender 3.x+ Python plugin that authenticates via API OAuth, exports comic scene data as FBX/GLTF with material and light mapping. API endpoint `/api/blender/export` generates signed URL for download. Sync endpoint `/api/blender/sync` compares versions and applies deltas. All data transfer uses authenticated API with signed URLs — no direct object storage access.

**Files:**
- Create: `packages/blender-plugin/__init__.py`
- Create: `packages/blender-plugin/export.py`
- Create: `packages/blender-plugin/sync.py`
- Create: `packages/blender-plugin/auth.py`
- Create: `packages/blender-plugin/tests/test_export.py`
- Create: `apps/api/src/blender/blender-export.controller.ts`
- Create: `apps/api/src/blender/blender-export.service.ts`
- Create: `apps/api/src/blender/blender.module.ts`
- Create: `docs/blender-plugin/README.md`

**Integration Gate:**
| Point | Action |
|-------|--------|
| C (Controller) | Modify: register `BlenderExportController` at `/api/blender` in `apps/api` |
| D (DB/Schema/Migration) | N/A: uses existing scene/asset domain models |
| A (Asset) | Modify: export produces FBX/GLTF served via signed URL |
| W (Worker) | N/A: synchronous export (no queue) |
| R (Router) | Modify: add `/api/blender` routes |
| G (Generation Worker/Provider Registry) | N/A: no new generation workers |
| M (Module) | Modify: add blender module to API; blender-plugin to monorepo |
| T (Test) | Modify: Python tests for plugin |
| Q (Queue) | N/A: synchronous API |

**Security boundary:** Blender plugin authenticates via API OAuth (OIDC from Task 08). All data transfer through authenticated API with signed URLs. No direct object storage access from plugin. Export uses project scope — plugin can only export scenes from authenticated user's projects. Sync compares versions and requires user confirmation before applying deltas. No LibTV brand/assets copied.

- [ ] **Step 1: Write RED test for Blender plugin export and API endpoint**

Write `packages/blender-plugin/tests/test_export.py` that imports `export.py` (not yet existing), verifies FBX/GLTF export contract with mock API responses. Test expects import error.

- [ ] **Step 2: Run RED against missing Blender plugin**

Run: `python -m pytest packages/blender-plugin/tests/test_export.py -v`
Expected: FAIL with import error — `export.py` does not exist.

- [ ] **Step 3: Implement Blender plugin and API endpoints**

`auth.py`: OAuth flow via API. Plugin stores OAuth token in Blender preferences. Token refresh on expiry.

`export.py`: fetches scene data from `/api/projects/{id}/scenes` with project scope. Maps scene materials (color, texture) and lights (key/fill/rim) to FBX/GLTF equivalents. Generates file and uploads to S3 via API endpoint. Returns signed URL for download.

`sync.py`: compares local Blender version with API version using hash comparison. Applies deltas with user confirmation. Reports sync status.

`blender-export.service.ts`: renders scene data as FBX/GLTF format. Generates signed URL for download. Compares versions via hash.

- [ ] **Step 4: Verify export, authentication, and sync**

Run: `python -m pytest packages/blender-plugin/tests/test_export.py -v`
Expected: FBX export produces valid file structure. GLTF export produces valid file structure. Material mapping preserves colors. Light mapping exports key/fill/rim. OAuth authentication works. Sync detects version changes. Unauthorized requests denied.

- [ ] **Step 5: Commit**

```bash
git add packages/blender-plugin/__init__.py packages/blender-plugin/export.py packages/blender-plugin/sync.py packages/blender-plugin/auth.py packages/blender-plugin/tests/test_export.py apps/api/src/blender/blender-export.controller.ts apps/api/src/blender/blender-export.service.ts apps/api/src/blender/blender.module.ts docs/blender-plugin/README.md
git commit -m "feat: Blender plugin for 3D scene export with authenticated API"
```

---

### Task 58: 长视频导出

**Consumes:** Task 21 (immutable assets + signed URLs), Task 14 (offline canvas + draft), Task 28 (batch generation + versioning), Task 45 (FFmpeg export pipeline + QC), Task 55 (video composition + FFmpeg pipeline).

**Produces:** `LongVideoSegmenter` that detects timeline clips exceeding provider 18s limit and splits at natural boundaries (scene/shot transitions); `LongVideoMerger` that combines segments with crossfade transitions; export Job that passes through existing QC pipeline (Task 45) and registers in Manifest (Task 44). Supports segment-level recovery — failed segment requeues without re-generating successful segments.

**Files:**
- Create: `apps/worker-media/src/long-video-segmenter.ts`
- Create: `apps/worker-media/src/long-video-merger.ts`
- Create: `apps/worker-media/src/long-video-segmenter.test.ts`
- Create: `apps/worker-media/src/long-video-merger.test.ts`
- Create: `tests/e2e/specs/long-video-export.spec.ts`
- Modify: `apps/worker-media/src/processor-registry.ts`

**Integration Gate:**
| Point | Action |
|-------|--------|
| C (Controller) | N/A: uses existing export controller at `/api/export` |
| D (DB/Schema/Migration) | N/A: uses existing Job/Attempt/Batch model with segment tracking |
| A (Asset) | Modify: segment outputs written to S3 with versioning, merged output quarantined and signed |
| W (Worker) | Modify: add `long-video-segmenter` and `long-video-merger` workers to BullMQ queue registry |
| R (Router) | N/A: existing export routes handle long-video option |
| G (Generation Worker/Provider Registry) | N/A: no new generation workers |
| M (Module) | Modify: add segmenter/merger to media-worker module |
| T (Test) | Modify: unit + e2e tests |
| Q (Queue) | Modify: add `long-video-segment` and `long-video-merge` queue types with job envelope per Global Constraints |

**Security boundary:** Segmentation and merge run server-side in Media Worker. Input assets accessed via signed URLs. Output segments and merged video written to S3 with versioning. Segment-level recovery requeues failed segments via existing BullMQ queue with UsageReservation for cost. No frontend direct FFmpeg. QC pipeline validates merged output before registering in Manifest.

- [ ] **Step 1: Write RED test for segmenter and merger contracts**

Write `apps/worker-media/src/long-video-segmenter.test.ts` that imports `LongVideoSegmenter` (not yet existing), verifies split points at shot boundaries, segment duration within 18s limit. Write `apps/worker-media/src/long-video-merger.test.ts` that imports `LongVideoMerger` (not yet existing), verifies crossfade transition insertion, encoding parameter consistency across segments.

- [ ] **Step 2: Run RED against missing segmenter/merger**

Run: `pnpm exec vitest run apps/worker-media/src/long-video-segmenter.test.ts apps/worker-media/src/long-video-merger.test.ts`
Expected: FAIL with module-not-found — segmenter and merger do not exist.
Run: `pnpm exec playwright test tests/e2e/specs/long-video-export.spec.ts`
Expected: FAIL with long-video export route missing or returning error.

- [ ] **Step 3: Implement segmenter, merger, and long-video export flow**

`long-video-segmenter.ts`: analyzes timeline, detects clips exceeding 18s provider limit. Splits at natural boundaries (scene changes, shot transitions) to produce segments each under 18s. Each segment generates independently via existing pipeline. Failed segments requeue with cost estimation; successful segments are never regenerated.

`long-video-merger.ts`: receives completed segments, combines with crossfade transitions (1s overlap). Validates encoding parameters (resolution, codec, bitrate) are consistent across segments. Produces final merged video.

Export flow: user requests long video export → segmenter creates segment Jobs → each segment generates → merger combines → output passes QC → registered in Manifest with segment metadata.

- [ ] **Step 4: Verify long video output and recovery**

Run: `pnpm exec vitest run apps/worker-media/src/long-video-segmenter.test.ts apps/worker-media/src/long-video-merger.test.ts`
Expected: Split points at shot boundaries. Segment duration under 18s. Crossfade transitions correct. Encoding consistency verified.
Run: `pnpm exec playwright test tests/e2e/specs/long-video-export.spec.ts`
Expected: Video >18s exports correctly. Transitions smooth between segments. Quality consistent across segments. Failed segment recovery requeues only failed segment. QC passes. Manifest updated.

- [ ] **Step 5: Commit**

```bash
git add apps/worker-media/src/long-video-segmenter.ts apps/worker-media/src/long-video-merger.ts apps/worker-media/src/long-video-segmenter.test.ts apps/worker-media/src/long-video-merger.test.ts tests/e2e/specs/long-video-export.spec.ts apps/worker-media/src/processor-registry.ts
git commit -m "feat: long video export with segmentation, merge, and segment-level recovery"
```

---

### Task 59: Agent 自动导演

**Consumes:** Task 08 (OIDC + project authorization), Task 10 (project/episode/Canvas session), Task 12 (Yjs document + canvas graph), Task 23 (provider SDK + capability catalog), Task 28 (batch generation), Task 11 (Rights/Moderation/ApprovalGate), Task 24 (UsageLedger), Task 31 (ReferenceBinding), Task 39 (Timeline revision).

**Produces:** `AutoDirector` agent that receives a script and orchestrates the full pipeline: script parsing → scene decomposition → character/scene assignment → storyboard generation → batch image/video generation → candidate selection → timeline assembly. Agent is reviewable at each stage — user can approve or reject before proceeding. Agent is cancelable at any point with partial results preserved. All generation uses existing Job/Attempt/Batch model with ApprovalGate — Agent cannot bypass approval or auto-charge without user confirmation.

**Files:**
- Create: `packages/agent/src/auto-director.ts`
- Create: `packages/agent/src/script-parser.ts`
- Create: `packages/agent/src/scene-decomposer.ts`
- Create: `packages/agent/src/consistency-checker.ts`
- Create: `packages/agent/src/timeline-assembler.ts`
- Create: `packages/agent/package.json`
- Create: `packages/agent/tsconfig.json`
- Create: `packages/agent/src/index.ts`
- Create: `packages/agent/src/auto-director.test.ts`
- Create: `packages/agent/src/script-parser.test.ts`
- Create: `apps/api/src/agent/agent.controller.ts`
- Create: `apps/api/src/agent/agent.module.ts`
- Create: `apps/api/src/agent/dtos/agent-start.dto.ts`
- Create: `tests/e2e/specs/auto-director.spec.ts`
- Create: `tests/e2e/specs/agent-safety.spec.ts`

**Integration Gate:**
| Point | Action |
|-------|--------|
| C (Controller) | Modify: register `AgentController` at `/api/agent` in `apps/api` |
| D (DB/Schema/Migration) | N/A: no new migration (agent state in application memory + existing Job model) |
| A (Asset) | N/A: agent orchestrates existing generation pipeline |
| W (Worker) | N/A: agent runs in API process, triggers existing BullMQ workers |
| R (Router) | Modify: add `/api/agent` routes |
| G (Generation Worker/Provider Registry) | N/A: no new generation workers |
| M (Module) | Modify: add agent module to monorepo |
| T (Test) | Modify: unit + e2e tests |
| Q (Queue) | N/A: agent triggers existing generation queues |

**Security boundary:** Agent cannot bypass ApprovalGate — each pipeline stage requires user confirmation before proceeding. Agent cannot bypass Job/Attempt/Batch model — all generation goes through existing pipeline with UsageReservation. Agent is cancelable — user can stop at any point, partial results preserved. Agent is auditable — all decisions logged with timestamps. No frontend direct provider calls. Agent does not auto-charge; cost estimation shown before each stage. Does not copy LibTV brand/assets/copy/layout.

- [ ] **Step 1: Write RED test for agent architecture and safety constraints**

Write `packages/agent/src/auto-director.test.ts` that imports `AutoDirector` (not yet existing), verifies pipeline stage transitions, approval gate enforcement, cancellation handling. Write `packages/agent/src/script-parser.test.ts` that imports `ScriptParser` (not yet existing), verifies scene/shot extraction from test scripts. Write `tests/e2e/specs/agent-safety.spec.ts` that verifies agent cannot bypass approval gates and cannot generate without user confirmation.

- [ ] **Step 2: Run RED against missing agent**

Run: `pnpm exec vitest run packages/agent/src/auto-director.test.ts packages/agent/src/script-parser.test.ts`
Expected: FAIL with module-not-found — agent files do not exist.
Run: `pnpm exec playwright test tests/e2e/specs/auto-director.spec.ts tests/e2e/specs/agent-safety.spec.ts`
Expected: FAIL with `/api/agent` route not found.

- [ ] **Step 3: Implement agent pipeline with approval gates and cancellation**

`script-parser.ts`: uses LLM to extract scenes, shots, characters, locations from script text. Outputs structured scene decomposition.

`scene-decomposer.ts`: creates shot list with camera directions, dialogue, and visual descriptions per scene.

`consistency-checker.ts`: validates character appearance consistency across generated shots using existing character reference data.

`auto-director.ts`: orchestrates pipeline: parse → decompose → assign → generate storyboards → batch generate images/videos → review/select → assemble timeline. Each stage pauses for user approval. Cost estimation shown before each generation stage. Cancellation at any point preserves partial results.

`timeline-assembler.ts`: builds timeline from selected candidates with transitions and audio placement.

`agent.controller.ts`: starts agent pipeline, returns pipeline status, accepts user approval/rejection at each stage, handles cancellation.

- [ ] **Step 4: Verify agent pipeline, safety, and traceability**

Run: `pnpm exec vitest run packages/agent/src/auto-director.test.ts packages/agent/src/script-parser.test.ts`
Expected: Script parsing correct. Scene decomposition accurate. Approval gates enforced between stages. Cancellation preserves partial results. Cost estimation before generation.
Run: `pnpm exec playwright test tests/e2e/specs/auto-director.spec.ts tests/e2e/specs/agent-safety.spec.ts`
Expected: Agent pipeline completes through all stages with user approvals. Agent cannot bypass ApprovalGate. Agent cannot auto-charge. Cancellation preserves results. All decisions auditable.

- [ ] **Step 5: Commit**

```bash
git add packages/agent/package.json packages/agent/tsconfig.json packages/agent/src/index.ts packages/agent/src/auto-director.ts packages/agent/src/script-parser.ts packages/agent/src/scene-decomposer.ts packages/agent/src/consistency-checker.ts packages/agent/src/timeline-assembler.ts packages/agent/src/auto-director.test.ts packages/agent/src/script-parser.test.ts apps/api/src/agent/agent.controller.ts apps/api/src/agent/agent.module.ts apps/api/src/agent/dtos/agent-start.dto.ts tests/e2e/specs/auto-director.spec.ts tests/e2e/specs/agent-safety.spec.ts
git commit -m "feat: auto-director agent with approval gates, cancellation, and audit trail"
```

---

### Task 60: 安全与合规扩展

**Consumes:** Task 07 (PostgreSQL RLS), Task 08 (OIDC + audit), Task 21 (immutable assets + lifecycle), Task 24 (UsageLedger + billing), Task 11 (Rights/Moderation), Task 45 (FFmpeg QC), Task 46 (retention + GC + deletion), Task 47 (observability + backup), Task 48 (CI/CD + infra).

**Produces:** `AiLabelService` that embeds visible and invisible watermarks in output media per regional regulation; `RetentionService` that enforces configurable data retention policies per jurisdiction with automatic cleanup; `AuditLogService` that records all significant events (user actions, generation jobs, access events, admin actions) as immutable entries. Cross-region compliance checks validate data residency requirements. Abuse detection flags suspicious patterns. User data deletion and appeal workflows.

**Files:**
- Create: `apps/api/src/compliance/ai-label.service.ts`
- Create: `apps/api/src/compliance/retention.service.ts`
- Create: `apps/api/src/compliance/audit-log.service.ts`
- Create: `apps/api/src/compliance/abuse-detector.ts`
- Create: `apps/api/src/compliance/data-deletion.service.ts`
- Create: `apps/api/src/compliance/ai-label.service.test.ts`
- Create: `apps/api/src/compliance/retention.service.test.ts`
- Create: `apps/api/src/compliance/compliance.module.ts`
- Create: `apps/api/src/compliance/compliance.controller.ts`
- Create: `packages/db/migrations/0023_compliance.sql`
- Create: `packages/db/src/schema/compliance.ts`
- Create: `tests/e2e/specs/compliance-ai-label.spec.ts`
- Create: `tests/e2e/specs/compliance-retention.spec.ts`
- Create: `tests/e2e/specs/compliance-audit.spec.ts`

**Integration Gate:**
| Point | Action |
|-------|--------|
| C (Controller) | Modify: register `ComplianceController` at `/api/compliance` in `apps/api` |
| D (DB/Schema/Migration) | Modify: `packages/db/src/schema/compliance.ts` + `packages/db/migrations/0023_compliance.sql` with FORCE RLS |
| A (Asset) | Modify: AI labels embedded in output media during QC (Task 45) |
| W (Worker) | Modify: add `retention-cleanup` scheduled worker to BullMQ |
| R (Router) | Modify: add `/api/compliance` routes |
| G (Generation Worker/Provider Registry) | N/A: no new generation workers |
| M (Module) | Modify: add compliance module to monorepo |
| T (Test) | Modify: unit + e2e tests |
| Q (Queue) | Modify: add `retention-cleanup` queue type for scheduled retention jobs |

**Security boundary:** Audit log is append-only — entries cannot be modified or deleted (only read with proper admin scope). Retention cleanup respects jurisdiction-specific policies and cannot bypass RLS. AI label embedding runs server-side during QC — no frontend involvement. Abuse detection logs actor identity and evidence. Data deletion workflows preserve audit trail (deletion event logged before data removed). Cross-region checks validate data residency at API level. No LibTV brand/assets copied.

- [ ] **Step 1: Write RED test for compliance service contracts**

Write `apps/api/src/compliance/ai-label.service.test.ts` that imports `AiLabelService` (not yet existing), verifies watermark embedding produces detectable markers. Write `apps/api/src/compliance/retention.service.test.ts` that imports `RetentionService` (not yet existing), verifies retention policy evaluation and cleanup scheduling.

- [ ] **Step 2: Run RED against missing compliance**

Run: `pnpm exec vitest run apps/api/src/compliance/ai-label.service.test.ts apps/api/src/compliance/retention.service.test.ts`
Expected: FAIL with module-not-found — compliance services do not exist.
Run: `pnpm exec playwright test tests/e2e/specs/compliance-ai-label.spec.ts`
Expected: FAIL with `/api/compliance` route not found.

- [ ] **Step 3: Implement compliance services, migration, and controller**

`packages/db/migrations/0023_compliance.sql`: `audit_log` table (append-only, `logId, eventType, actorId, resourceId, resourceName, timestamp, metadata JSONB, immutable`). `retention_policies` table (`policyId, jurisdiction, dataType, retentionDays, createdAt`). `abuse_reports` table (`reportId, reportedBy, targetId, targetType, category, description, reviewedAt, reviewedBy, resolved`). FORCE RLS on audit_log and abuse_reports. audit_log is append-only via trigger.

`ai-label.service.ts`: embeds visible watermark (text overlay per regional requirement) and invisible marker (metadata flag) in output media during QC pipeline. Supports configurable regional templates.

`retention.service.ts`: evaluates retention policies per jurisdiction. Schedules cleanup jobs in BullMQ `retention-cleanup` queue. Anonymizes or deletes expired data. Logs deletion events in audit_log before removal.

`audit-log.service.ts`: records all significant events with actor identity, timestamp, resource, and metadata. Append-only via database trigger. Admin read access with scope filtering.

`abuse-detector.ts`: flags suspicious patterns (rapid generation, repeated failed payments, content violations). Creates abuse report entries. Does not auto-block — creates auditable flag for human review.

`data-deletion.service.ts`: processes user data deletion requests. Preserves audit trail. Removes personal data while keeping aggregate stats. Logs deletion event.

- [ ] **Step 4: Verify compliance features end-to-end**

Run: `pnpm exec vitest run apps/api/src/compliance/`
Expected: AI label embedding produces detectable markers. Retention policy evaluation correct. Audit log append-only enforced. Abuse detection flags suspicious patterns. Data deletion preserves audit trail.
Run: `pnpm exec playwright test tests/e2e/specs/compliance-ai-label.spec.ts tests/e2e/specs/compliance-retention.spec.ts tests/e2e/specs/compliance-audit.spec.ts`
Expected: AI labels present in exports. Retention cleanup works. Audit log complete and immutable. Abuse reports created. Data deletion preserves audit trail. Cross-region checks validate residency.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/compliance/ai-label.service.ts apps/api/src/compliance/retention.service.ts apps/api/src/compliance/audit-log.service.ts apps/api/src/compliance/abuse-detector.ts apps/api/src/compliance/data-deletion.service.ts apps/api/src/compliance/ai-label.service.test.ts apps/api/src/compliance/retention.service.test.ts apps/api/src/compliance/compliance.module.ts apps/api/src/compliance/compliance.controller.ts packages/db/migrations/0023_compliance.sql packages/db/src/schema/compliance.ts tests/e2e/specs/compliance-ai-label.spec.ts tests/e2e/specs/compliance-retention.spec.ts tests/e2e/specs/compliance-audit.spec.ts
pnpm --filter @comic-canvas/db test:migration -- 0023_compliance.sql
git commit -m "feat: compliance services — AI labeling, retention, audit, abuse detection, data deletion"
```

---

## Self-Review Gate Before Execution

Before assigning Task 00, the plan owner must run all checks below against this document and the blueprint:

1. Map every MVP capability in blueprint 4.1/4.4 and every release assertion in section 25 to at least one Task and exact test command; P1/P2 capabilities map to none.
2. Search both documents for placeholder language, undefined “same as another task”, missing test output, and symbols used before their producing task.
3. Verify every workspace has a manifest in Task 01, every fixture/helper/page driver is produced in Task 03 before use, and every external dependency has an exact version plus lockfile modification.
4. Verify fixed registration points `C/D/A/W/R/G/M/T/Q`, all AppModule/Worker/router/renderer smoke tests and migration sequence: Task 00-50 release gate checks `0001` through `0020`; LibTV full-competition extension gate (Task 51-60) checks `0021` through `0023`; overall full commercial plan checks `0001` through `0023` contiguous.
5. Verify terminology and state interfaces: Job/Attempt/Batch, per-Project `eventId` vs per-Job `jobSequence`, `reconciling`, ReferenceBinding vs reference edge, integer frame vs ms, Selection vs Approval/Gate, durable Yjs revision and snapshot restore.
6. Run Markdown fence balance, duplicate create-path scan, package-manifest coverage, terminology scan and `git diff --check`; resolve every failure before execution.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-23-ai-comic-canvas-mvp.md`. Two execution options after Task 00 evidence is genuinely signed:

1. **Subagent-Driven (recommended):** use `subagent-driven-development`, dispatch a fresh implementer per Task and run spec/compliance review before the next Task.
2. **Inline Execution:** use the plan execution skill in batches, stopping at Wave boundaries for product, architecture, security and design checkpoints.

Do not start either option by generating the full repository at once. Task boundaries are the review and rollback units.
