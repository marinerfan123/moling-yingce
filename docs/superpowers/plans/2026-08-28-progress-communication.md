# 进度汇报与人工干预通讯方案实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为无限画布建立可追踪的进度汇报、人工干预提醒和人工响应闭环，并支持微信公众号服务通知等外部渠道而不让外部渠道成为业务状态的权威来源。

**Architecture:** 业务状态仍由 Job/Attempt、审核/审批和审计记录负责；沟通服务只把这些权威状态转换为可去重的 `CommunicationEvent`。站内通知通过现有项目事件流实时展示，微信公众号服务通知、企业微信/飞书/钉钉/邮件通过现有 Outbox 可靠投递；人工点击外部消息中的鉴权回链回到 API 完成确认、处理、重试或升级。所有外部发送均为 at-least-once，依靠 `(communicationEventId, channelId)` 投递记录和 provider message identity 去重。

**Tech Stack:** TypeScript、Zod contracts、PostgreSQL FORCE RLS、现有 transactional outbox、Redis/BullMQ Dispatcher、API SSE、微信公众号服务通知和企业微信机器人 Webhook；首版不增加第三方 SDK，渠道适配器使用受控 HTTPS client。

## Global Constraints

- 站内事件流是状态事实来源，微信、邮件和其他渠道只负责提醒、确认和回链。
- 只有服务端权威状态转换才能产生沟通事件；客户端、Webhook payload 和外部消息正文不能直接改变 Job/Attempt 状态。
- Outbox envelope 只能携带 opaque `eventId/route/payloadHash`；实际消息内容由 Dispatcher 按 event ID 在受保护的租户上下文中读取。
- 所有沟通表启用并强制 FORCE RLS；跨租户查询、发送、确认和回链均拒绝。
- 消息只包含脱敏标题、状态摘要、项目/任务 opaque ID 和短期鉴权回链，不包含剧本文本、提示词、媒体 URL、姓名、供应商密钥或原始 Webhook 数据。
- `action_required` 和 `critical` 事件必须有确认、处理人、处理动作和审计记录；发送失败不能使业务事件变成已处理。
- 进度消息按事件合并和限频，人工干预消息不得被普通进度消息覆盖。
- 个人微信提醒通过微信公众号服务通知实现；需要在微信内直接回复并驱动业务时，二期再接官方回调能力。
- 个人微信号本身不作为生产自动化通道：非官方自动化不可审计、容易失效，并存在账号和隐私风险。

---

## 通讯渠道决策

| 渠道                  |             首版 | 用途                                                 | 局限与处理                                                           |
| --------------------- | ---------------: | ---------------------------------------------------- | -------------------------------------------------------------------- |
| 站内通知中心/任务托盘 |             必须 | 全量进度、人工干预详情、历史、确认和处理             | 是唯一事实来源；通过项目事件流实时更新                               |
| 微信公众号服务通知    | 推荐（个人微信） | 把关键节点、失败、需要人工介入、升级提醒送到个人微信 | 用户必须关注公众号并完成账号绑定；模板和频率受平台规则约束           |
| 企业微信群机器人      |             推荐 | 关键节点、失败、需要人工介入、升级提醒               | 单向发送；按钮/链接回到站内完成操作                                  |
| 企业微信自建应用      |             二期 | 群/成员定向通知、回调、消息状态和交互卡片            | 需要企业主体、应用凭据、可信 IP/域名和回调验签                       |
| 飞书机器人/应用       |             可选 | 团队已使用飞书时替换企业微信                         | 复用同一 channel port，不改业务事件模型                              |
| 钉钉机器人/应用       |             可选 | 团队已使用钉钉时替换企业微信                         | 复用同一 channel port，注意签名和限流                                |
| 邮件                  |         必须兜底 | `critical`、连续投递失败、每日汇总                   | 延迟较高；不承载直接业务操作                                         |
| 短信/电话             |             后续 | P0 长时间未确认的升级                                | 成本高，只用于升级，不发送普通进度                                   |
| 个人微信号自动化      | 禁止作为生产依赖 | 不纳入服务端自动化                                   | `wxauto`、`itchat` 等桌面/非官方自动化不稳定且有封号、隐私和审计风险 |

### 推荐运行方式

首版按下面的链路运行：

```text
Job/审核/供应商恢复状态
        |
        | 同一业务事务写 CommunicationEvent + communication.dispatch Outbox
        v
站内事件流 ------------------------------+
        |                                |
        v                                v
任务托盘/通知中心                    Dispatcher
                                         |
                 +-----------------------+------------------+
                 v                       v                  v
             微信公众号/企业微信        邮件兜底          其他渠道适配器
                 |                       |                  |
                 +---------- 短期鉴权回链/登录 ------------+
                                         |
                                         v
                              API ACK/Resolve/Snooze
                                         |
                                  审计 + 状态投影
```

站内展示可以接入蓝图已定义的 `/v1/projects/*/events` SSE；沟通事件的类型建议使用 `communication.created`、`communication.updated`、`communication.acknowledged` 和 `communication.resolved`。如果当前 SSE 还未落地，首版可以先提供通知查询 API，再接入同一事件流，不额外创建第二套长连接协议。

## 个人微信落地边界

如果目标是“消息出现在用户的个人微信”，推荐实现微信公众号服务通知，而不是登录个人微信账号代发：

1. 用户在公众号内点击绑定，系统将已登录的 `userId` 与公众号 `openid` 绑定，并记录撤销和换绑审计。
2. 后端通过微信官方服务通知接口发送模板消息；模板只放脱敏标题、任务摘要、事件 ID 和站内处理链接。
3. 用户点击消息后回到系统完成登录和授权；微信消息本身不直接执行审批、重试或费用操作。
4. 用户未关注、未绑定、拒收或微信接口失败时，事件仍进入站内通知中心，并按规则转邮件或企业微信。

这条路径能到达个人微信，但它不是“给任意个人微信号发消息”：需要公众号主体、用户关注、账号绑定、模板审核和平台调用额度。若不具备公众号主体，短期可使用合规的消息中转服务，但只允许传递 opaque event ID 和短期回链，不能把剧本、提示词、媒体地址或个人信息交给中转方。直接控制个人微信客户端的桌面自动化只适合开发联调，不作为生产通讯方案。

## 事件和时效规则

| 事件级别          | 触发条件                                                         | 站内     | 企业微信                 | 邮件                | 目标响应                    |
| ----------------- | ---------------------------------------------------------------- | -------- | ------------------------ | ------------------- | --------------------------- |
| `info`            | 任务开始、阶段完成、正常完成、批次达到 25/50/75/100%             | 实时     | 默认不发；可配置汇总     | 不发                | 无需响应                    |
| `warning`         | 可自动恢复失败、排队超过阈值、供应商降级、stale 影响             | 实时     | 5 分钟内合并一次         | 连续 2 次未恢复时发 | 4 小时内关注                |
| `action_required` | 审批门、版权/内容审核、`unknown` 对账、取消结果不确定、死信修复  | 实时     | 立即                     | 15 分钟未确认则兜底 | 30 分钟内确认，4 小时内处理 |
| `critical`        | 跨租户风险、账单不一致、数据恢复异常、关键任务阻断、渠道全部失败 | 实时置顶 | 立即并每 15 分钟升级一次 | 立即                | 15 分钟内确认，1 小时内处置 |

### 进度汇报策略

- 任务创建：发送一次“已受理”，包含任务 ID、当前阶段和预计下一节点；不承诺供应商最终耗时。
- 阶段切换：发送一次，例如 `queued -> running`、`running -> uploading`、`uploading -> moderating`。
- 长任务：每 10 分钟最多一次，且只有进度百分比或阶段发生变化才发送；同一任务同一阶段使用 dedupe key 合并。
- 批次任务：单项进度在站内展示，外部渠道只发送批次摘要和失败数量，避免刷屏。
- 终态：成功、失败、取消、需要人工对账各发送一次；late success 仍按独立事件记录。
- 外部渠道在同一事件 5 分钟内只保留最后一条 `info/warning`；`action_required/critical` 独立保留。

### 必须人工干预的条件

1. 供应商返回 `unknown`、`unsupported` 或提交结果无法确认，进入人工对账。
2. Provider webhook 验签、重复事件或外部任务映射异常。
3. 费用 currency、实际扣费和预估不一致，或 reservation/ledger 无法对账。
4. Rights、Moderation、ApprovalGate 阻断下游继续。
5. Outbox 达到死信阈值，尤其是 `canvas-projection`、`generation.submit` 和沟通投递本身。
6. 任务持续超过配置的阶段超时，且自动恢复次数已用尽。
7. 快照恢复、租户隔离、权限或数据完整性检查失败。

每个上述事件必须说明：发生了什么、影响范围、需要谁做什么、截止时间、可选动作、详情链接、事件 ID 和当前责任人。通知内容不能只写“任务失败”或“请处理”。

## 人工响应闭环

外部消息中的“查看并处理”链接指向已登录的通知详情页。短期 token 只用于定位通知，不包含租户权限；API 仍按 OIDC 身份、项目成员关系和操作权限重新授权。对于群机器人单向消息，不能把“点击链接”误认为“已处理”：

- `acknowledge`：人工已看到，记录 actor、时间和备注，不改变业务状态。
- `assign`：把事件分配给项目成员或 Operations 角色。
- `resolve`：人工完成对账/修复/审批后，调用对应业务命令，再由业务结果关闭沟通事件。
- `snooze`：延后提醒，必须给出下次提醒时间，不能关闭事件。
- `retry`：只允许重试有明确幂等契约的动作；Outbox 死信必须走现有 `requeue_outbox(eventId, expectedAttempt, reason)` 审批流程。
- `escalate`：超过 SLA 或处理失败后提升级别并通知备援人员。

沟通事件不能通过“resolve”直接伪造 Job 成功或取消。人工修复完成后，原业务服务必须产生新的权威状态事件；通知服务观察到该事件后再把原沟通事件标记为 `resolved`。

## 消息格式

企业微信文本消息建议保持在一屏内，卡片或链接内容统一如下：

```text
[需要处理] 任务 job_xxxxxxxx
项目 project_xxxxxxxx · 阶段：供应商结果对账
原因：提交结果未知，系统不会自动重提，避免重复计费
影响：本镜头暂不能进入资产库；其他镜头不受影响
建议：打开详情，核对供应商任务后选择“确认成功 / 确认失败 / 继续观察”
截止：2026-08-28 16:30 (Asia/Shanghai)
事件：comm_xxxxxxxx
查看并处理：<authenticated-link>
```

结构化 `CommunicationEvent` 至少包含：

```ts
type CommunicationEvent = Readonly<{
  eventId: string;
  tenantId: string;
  projectId: string;
  subjectType: "job" | "batch" | "review_issue" | "outbox" | "system";
  subjectId: string;
  kind: "progress" | "human_intervention" | "terminal" | "digest";
  severity: "info" | "warning" | "action_required" | "critical";
  title: string;
  summary: string;
  impact: string;
  actionUrl: string;
  dedupeKey: string;
  requiresAck: boolean;
  expiresAt: string | null;
  occurredAt: string;
}>;
```

消息模板只接受上述已脱敏字段；不得让调用方把任意 HTML、Markdown、URL 或原始异常堆栈直接传给渠道适配器。所有模板渲染在服务端测试长度、控制字符、链接域名和敏感字段。

## 数据模型和可靠性

建议新增 `0024_communication.sql`，包括：

- `communication_events`：权威沟通事件、subject、级别、dedupe key、确认要求、截止时间、解决状态。
- `communication_channels`：租户级渠道类型、目标引用、secret reference、启用状态和验证时间；不保存明文 Token。
- `communication_deliveries`：事件与渠道的投递状态、attempt count、provider message ID、退避时间、最后错误摘要；唯一键为 `(event_id, channel_id)`。
- `communication_acks`：actor、动作、备注、时间和 trace ID；动作 append-only。
- `communication_preferences`：用户/项目级进度通知偏好；不得关闭 `action_required` 和 `critical` 的站内提醒，只能配置外部渠道。

写入规则：业务事务同时写 `communication_events` 和 `outbox_events(route = 'communication.dispatch')`。Dispatcher 只接收 `{ eventId, route, payloadHash }`，读取沟通事件和目标渠道后投递。投递成功、失败、重试、死信和升级均写 delivery/audit；投递死信不关闭沟通事件。

重试规则：连接失败、429、5xx 使用指数退避和 jitter；4xx 鉴权失败暂停渠道并产生 `critical` 运维事件；同一渠道连续 3 次失败触发邮件兜底；全部外部渠道失败时站内事件仍保持可见并在本地 Operations health 中告警。

## 实施任务

### Task 1: 沟通契约和模板安全

**Files:**

- Create: `packages/contracts/src/communication.ts`
- Modify: `packages/contracts/src/index.ts`
- Create: `packages/contracts/src/communication.test.ts`

**Interfaces:**

- Produces `CommunicationEventSchema`, `CommunicationAckSchema`, `CommunicationChannelSchema` and `renderCommunicationMessage(event, channelKind)`.
- `renderCommunicationMessage` 只接受结构化字段，返回 `{ title, body, actionUrl }`，并拒绝非 `PUBLIC_BASE_URL` 域名、控制字符和未脱敏字段。

- [ ] **Step 1: Write tests** for all severities, dedupe keys, required ACK, invalid URL, overlong text and forbidden sensitive markers.
- [ ] **Step 2: Run** `pnpm exec vitest run packages/contracts/src/communication.test.ts` and verify it fails before implementation.
- [ ] **Step 3: Implement** strict Zod schemas and deterministic templates for WeCom text, email text and in-app summary.
- [ ] **Step 4: Run** the focused test and `pnpm --filter @comic-canvas/contracts typecheck`.

### Task 2: PostgreSQL 沟通记录和 RLS

**Files:**

- Create: `packages/db/migrations/0024_communication.sql`
- Create: `packages/db/src/schema/communication.ts`
- Modify: `packages/db/src/schema/index.ts`
- Modify: `packages/db/src/migrator.ts`
- Create: `packages/db/test/communication-migration.integration.test.ts`

**Interfaces:**

- Produces tables and indexes described in “数据模型和可靠性”.
- Produces narrow functions `app.create_communication_event`, `app.claim_communication_delivery`, `app.record_communication_delivery`, and `app.record_communication_ack` with caller checks and CAS semantics.

- [ ] **Step 1: Write migration tests** for table presence, FORCE RLS, tenant/project foreign keys, `(event_id, channel_id)` uniqueness and append-only ACKs.
- [ ] **Step 2: Run** `pnpm exec vitest run packages/db/test/communication-migration.integration.test.ts` and verify the new migration assertions fail.
- [ ] **Step 3: Implement** migration, schema registry version 10 and narrow SECURITY DEFINER functions; secret columns hold references only.
- [ ] **Step 4: Run** focused DB tests plus `pnpm --filter @comic-canvas/db typecheck`.

### Task 3: API 通知中心和人工响应

**Files:**

- Create: `apps/api/src/communication/communication.service.ts`
- Create: `apps/api/src/communication/communication.controller.ts`
- Create: `apps/api/src/communication/communication.module.ts`
- Modify: `apps/api/src/app.module.ts`
- Modify: `apps/api/src/main.ts`
- Create: `apps/api/src/communication/communication.e2e-spec.ts`

**Interfaces:**

- `GET /v1/projects/:projectId/communications?status=open&limit=50`
- `GET /v1/projects/:projectId/communications/:eventId`
- `POST /v1/projects/:projectId/communications/:eventId/ack` with `{ action: "acknowledge" | "assign" | "snooze" | "escalate", note?: string, nextAt?: string }`.
- `POST /v1/projects/:projectId/communications/:eventId/resolve` only accepts a business result reference; it does not accept an arbitrary success state.
- `GET /v1/projects/:projectId/events` emits communication projection events with Last-Event-ID replay and the existing heartbeat policy.
- `CommunicationService.emit(input, transaction): Promise<CommunicationEvent>` accepts a `CommunicationEventInsert` that omits `eventId`, `occurredAt`, `actionUrl` and delivery state; the transaction argument is the same command transaction that writes the authoritative state.

- [ ] **Step 1: Write e2e tests** for project authorization, cross-tenant rejection, idempotent ACK, stale token rejection, resolve audit and SSE replay.
- [ ] **Step 2: Run** `pnpm --filter @comic-canvas/api test:e2e -- communication.e2e-spec.ts` and verify missing routes fail.
- [ ] **Step 3: Implement** service/controller, idempotency protection and append-only audit integration.
- [ ] **Step 4: Run** focused e2e tests and `pnpm --filter @comic-canvas/api typecheck`.

### Task 4: Dispatcher 与企业微信/邮件适配器

**Files:**

- Create: `packages/queue/src/communication-dispatcher.ts`
- Modify: `packages/queue/src/index.ts`
- Create: `packages/queue/src/communication-dispatcher.test.ts`
- Create: `apps/worker-generation/src/channels/wechat-official-account.ts`
- Create: `apps/worker-generation/src/channels/wecom-bot.ts`
- Create: `apps/worker-generation/src/channels/email.ts`
- Modify: `apps/worker-generation/src/dispatcher-main.ts`
- Modify: `apps/worker-generation/src/index.ts`
- Create: `apps/worker-generation/src/channels.test.ts`

**Interfaces:**

- `CommunicationChannel.send(message): Promise<{ providerMessageId?: string }>`.
- `CommunicationDispatcher.dispatch(eventId): Promise<"sent" | "retry" | "dead_letter">`.
- `WeComBotChannel` accepts only a secret resolver and HTTPS client; it verifies response status, redacts response bodies and maps 429/5xx to retry.

- [ ] **Step 1: Write tests** for idempotent delivery, 429/5xx backoff, permanent 4xx pause, provider message ID persistence, message redaction and email fallback after three failures.
- [ ] **Step 2: Run** `pnpm exec vitest run packages/queue/src/communication-dispatcher.test.ts apps/worker-generation/src/channels.test.ts` and verify new imports fail.
- [ ] **Step 3: Implement** channel port, delivery CAS, WeChat Official Account service-notification adapter, WeCom robot adapter, SMTP/API email adapter and `communication.dispatch` route registration. The WeChat adapter must require a bound `openid`, refresh access tokens through a secret reference, and map invalid recipient/template errors to a non-retryable delivery state.
- [ ] **Step 4: Run** focused tests and confirm dispatcher still rejects provider/KMS credentials.

### Task 5: Web 通知中心、任务托盘和偏好设置

**Files:**

- Create: `apps/web/src/communications/notification-center.tsx`
- Create: `apps/web/src/communications/notification-center.css`
- Create: `apps/web/src/communications/communication-client.ts`
- Create: `apps/web/src/communications/notification-center.test.tsx`
- Modify: `apps/web/src/workspace/workspace-shell.tsx`
- Modify: `apps/web/src/workspace/workspace-shell.css`
- Modify: `apps/web/src/app/router.tsx`

**Interfaces:**

- `CommunicationClient.list(projectId)`, `CommunicationClient.ack(eventId, command)`, `CommunicationClient.subscribe(projectId, lastEventId)`.
- `NotificationCenter` renders open action items first, then warnings and progress; mobile review keeps the same acknowledge/resolve actions without requiring the full desktop dock.

- [ ] **Step 1: Write component tests** for severity order, unread count, connection loss, ACK pending state, keyboard focus return and mobile single-column layout.
- [ ] **Step 2: Run** `pnpm --filter @comic-canvas/web test -- notification-center.test.tsx` and verify the component is missing.
- [ ] **Step 3: Implement** notification center, task-tray badge, SSE reconnect with Last-Event-ID and accessible action controls.
- [ ] **Step 4: Run** focused tests, existing workspace tests and the responsive Playwright suite.

### Task 6: 事件接入、运维配置和真实渠道验收

**Files:**

- Modify: `apps/api/src/generation/generation.service.ts`
- Modify: `apps/api/src/governance/approval-gate-policy.service.ts`
- Modify: `apps/api/src/governance/moderation.controller.ts`
- Modify: `apps/api/src/governance/rights.service.ts`
- Modify: `apps/worker-generation/src/recovery-service.ts`
- Modify: `apps/worker-generation/src/billing-reconciler.ts`
- Modify: `.env.example`
- Modify: `infra/docker/compose.yml`
- Modify: `infra/deploy/kubernetes/base/config.yaml`
- Create: `tests/e2e/specs/communication.spec.ts`
- Create: `docs/runbooks/communication-channel-operations.md`

**Interfaces:**

- A source service calls `CommunicationService.emit(input)` inside the same transaction as the authoritative status transition.
- Environment fields are `WECHAT_OFFICIAL_APP_ID`, `WECHAT_OFFICIAL_SECRET_REF`, `WECOM_BOT_WEBHOOK_SECRET_REF`, `COMMUNICATION_PUBLIC_BASE_URL`, `COMMUNICATION_DEFAULT_CHANNEL`, `COMMUNICATION_EMAIL_FALLBACK_ENABLED`, `COMMUNICATION_PROGRESS_MIN_INTERVAL_SECONDS` and `COMMUNICATION_ESCALATION_MINUTES`.

- [ ] **Step 1: Write integration tests** covering generation success/failure, provider `unknown`, approval gate, dead-letter, dedupe, external delivery failure and manual ACK.
- [ ] **Step 2: Run** the focused integration test against PostgreSQL/Redis test services and verify each source currently produces no communication event.
- [ ] **Step 3: Implement** source event mapping, environment validation, local fake channel and deployment secret references; keep real webhook URLs out of Git.
- [ ] **Step 4: Run** `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm test:e2e`, `pnpm run verify:boundaries`, and the network/deployment verification scripts.
- [ ] **Step 5: Perform staging canary** with a test WeCom group, force a provider `unknown` and an outbox retry, confirm message arrival, link authorization, ACK audit, retry behavior and email fallback.

## 上线验收

上线前必须满足：

- 普通 30 分钟任务外部渠道不超过 4 条进度消息，最终状态恰好 1 条；站内事件完整。
- `action_required` 从产生到微信公众号/企业微信投递 P95 不超过 60 秒；站内实时事件 P95 不超过 5 秒。
- 微信公众号/企业微信失败、Redis 重启、Dispatcher 重启和重复投递不丢事件，不产生重复业务动作。
- 人工确认可追溯到 actor、时间、事件、项目、trace ID 和备注；未确认事件按 SLA 升级。
- `unknown`、费用不一致、死信和审核门事件不能被进度偏好关闭，且不能通过通知接口直接伪造为成功。
- 租户隔离、回链授权、secret reference、敏感字段脱敏、Webhook/渠道响应日志脱敏测试全部通过。
- 真实微信渠道不通时，站内通知中心仍可独立使用，邮件兜底可验证；个人微信号自动化不出现在生产依赖清单中。

## 分阶段落地

1. **MVP（个人微信目标）：** 站内通知中心、进度合并、人工干预事件、微信公众号服务通知、邮件兜底、鉴权回链和审计；如果已有团队企业微信，再并行启用群机器人。
2. **二期：** 企业微信自建应用交互卡片、成员定向路由、回调验签和直接 ACK；按同一 `CommunicationChannel` 接口加入飞书或钉钉。
3. **三期：** PagerDuty/电话/SMS 升级、值班表、SLA 报表和跨项目运营大盘。

个人微信号本身不建议直接接入生产系统；如果必须触达个人微信，使用“公众号服务通知 + 用户绑定”是正式方案。若团队当前只使用团队微信，注册企业微信并把机器人加入指定群是最低成本的正式方案；若已有飞书或钉钉组织，则只替换渠道适配器，事件模型、人工回链、审计和兜底策略保持不变。
