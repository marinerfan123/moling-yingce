# Qwen3.6-27B 接力断点与执行手册

> 目标：让 Qwen3.6-27B 在没有完整上下文、推理能力较弱的情况下，也能从当前断点继续推进“商业化漫剧无限画布”，并尽量保持质量。

最后更新：2026-08-25 00:35 Asia/Shanghai
当前工作区：`C:\Users\Administrator\Documents\ChatGPT\无限画布`
当前断点：Task 25 已完成并通过全局质量门；下一步从 Task 26 开始。

---

## 0. 绝对规则

1. 不要提交 git，除非用户明确说“提交/commit”。
2. 不要伪造 Task 00 的真实证据、访谈、审批、法务材料。
3. 不要把任何 API key、`sk-...`、Authorization、Bearer token 写入代码、文档、测试快照或日志。
4. 用户给过测试 key，但当前代码不能直接硬编码；后续 provider 接入必须走环境变量 / KMS reference / secret ref。
5. 不要做单机玩具版。所有实现必须保持多租户、项目权限、队列、账本、审计、可恢复的商业化架构。
6. 每完成一个 Task，必须运行该 Task 指定验证命令；如果改动跨包，还要运行全局质量门。
7. 遇到失败先找根因，不要猜测式乱改。
8. 保持现有轻量代码风格：很多 API 不是完整 Nest wiring，而是 controller/service/module registry + Vitest e2e 的商业契约骨架。

---

## 1. 当前已完成范围

已经完成并通过验证：

- Task 18：Canvas editing / command bridge / broken-edge recovery
- Task 19：Outline / search / layout / accessibility
- Task 20：Vertical comic template / quick insert
- Task 21：Immutable assets / quarantine / signed access
- Task 22：Upload / remote ingest / media worker chain / abandoned reaper
- Task 23：Provider SDK、能力目录、Fake Provider、KMS 依赖
- Task 24：整数微单位账本、预算 reserve/settle/release/expire、Billing API
- Task 25：Durable Generation Job、estimate/jobs/cancel、Outbox/queue、Selections、Worker consumer、Web single-job confirmation

最后一次完整质量门结果：全部通过。

已通过命令：

```powershell
corepack pnpm typecheck
corepack pnpm format:check
corepack pnpm lint
corepack pnpm test
corepack pnpm build
corepack pnpm verify:workspaces
corepack pnpm verify:fixed-points
corepack pnpm verify:boundaries
```

注意：在当前 Windows 沙箱里，`apps/web` 的 Vite/Vitest、`apps/api` e2e、`packages/db` migration test 有时会因为 `Access is denied` 失败。遇到这种不是代码断言失败，而是沙箱读配置限制。应使用提权运行同一命令。

---

## 2. 当前已知“失败但正常”的东西

`node scripts/verify-preflight.mjs` 仍然失败，这是预期状态。

原因：Task 00 的真实证据还没补，包括真实访谈、审批人、法务/品牌/原型/供应商测试证据。

不要为了让 preflight 通过而伪造材料。

当前预期摘要：

- Missing files: 0
- Files with errors: 16
- Placeholders: 0
- GATE: FAILED
- 错误主要是 `STALE_EVIDENCE`、`ADR_APPROVER_NOT_NAMED`、`ADR_STATUS_NOT_ACCEPTED`、真实 checksum/link/访谈/原型证据不足。

---

## 3. 当前 git 状态说明

仓库仍有大量 untracked scaffold，这是项目从零搭建过程中的正常状态。不要 `git clean`、不要 `git reset --hard`。

最近 `git status --short` 大致会看到：

```text
 M docs/product/ai-comic-canvas-blueprint.md
 M docs/superpowers/plans/2026-08-23-ai-comic-canvas-mvp.md
?? .dependency-cruiser.cjs
?? .dockerignore
?? .editorconfig
?? .env.example
?? .gitignore
?? apps/
?? docs/adr/
?? docs/research/
?? docs/runbooks/
?? eslint.config.mjs
?? infra/
?? package.json
?? packages/
?? playwright.config.ts
?? pnpm-lock.yaml
?? pnpm-workspace.yaml
?? prettier.config.mjs
?? scripts/
?? tests/
?? tsconfig.base.json
?? turbo.json
?? vitest.integration.ts
?? vitest.workspace.ts
```

这不是错误。不要清理。

---

## 4. 接手前必须读的文件

Qwen 接手后，先读这些文件，不要直接开写：

1. `docs/superpowers/plans/2026-08-23-ai-comic-canvas-mvp.md`
2. `packages/contracts/src/generation.ts`
3. `packages/contracts/src/billing.ts`
4. `packages/provider-sdk/src/types.ts`
5. `packages/provider-sdk/src/adapter.ts`
6. `packages/db/src/provider-event-scope.ts`
7. `packages/db/src/ledger.ts`
8. `packages/queue/src/generation-queue.ts`
9. `apps/api/src/generation/generation.service.ts`
10. `apps/api/src/generation/job-cancellation.service.ts`
11. `apps/worker-generation/src/generation-consumer.ts`
12. `apps/web/src/generation/single-job-confirmation.tsx`

---

## 5. 每次恢复时先运行的命令

从中断处恢复时，先运行：

```powershell
git status --short
corepack pnpm typecheck
corepack pnpm format:check
corepack pnpm lint
```

如果这些失败：

- 先修当前失败；
- 不要开始新 Task；
- 不要改无关文件；
- 修完后重跑失败命令。

---

## 6. 下一步：Task 26

从这里继续。

在主计划文件中定位：

```powershell
rg -n "^### Task 26:|^### Task 27:" docs/superpowers/plans/2026-08-23-ai-comic-canvas-mvp.md
```

抽取 Task 26：

```powershell
$p='docs/superpowers/plans/2026-08-23-ai-comic-canvas-mvp.md'
$lines=Get-Content -LiteralPath $p
$start=($lines | Select-String -Pattern '^### Task 26:' | Select-Object -First 1).LineNumber
$end=($lines | Select-String -Pattern '^### Task 27:' | Select-Object -First 1).LineNumber
$lines[($start-1)..($end-2)] -join "`n"
```

执行原则：

- 先写测试，再实现。
- 每个新接口必须有权限边界。
- Queue payload 仍然只能是 `{ eventId, route, payloadHash }` 风格，不能塞 URL、prompt、secret、原始 payload。
- Provider 提交必须遵守 Task 23 的 recover/cancel union，不要把 `accepted` 当 Job terminal。
- Billing 必须用 decimal string micros / bigint，不准 float。
- Webhook 必须 raw-body 验签后才能 bootstrap provider event scope；pre-signature 阶段不能拿 tenant/project/attempt。

---

## 7. Task 26 预计目标

Task 26 应该把 Task 25 的 Job/Attempt 骨架继续推进到 provider dispatch 执行层。

重点不是“调通一个假生成”，而是保证商业化生成链路的安全语义：

- submissionKey 持久化且全局唯一。
- network submit 前已创建 Attempt 和 billable subject。
- ambiguous timeout / 5xx 走 recovery/reconciling，不盲目重试。
- provider idempotency 支持时复用同一 Attempt。
- 无 idempotency 且状态未知时不能创建二次扣费风险。
- recover 只接受 `found | definitively_absent | unknown | unsupported` 的穷尽处理。
- cancel 只接受 `accepted | already_terminal | unknown | unsupported` 的穷尽处理。
- webhook 先 raw verify，再写 provider-event Outbox。
- 不记录 prompt 原文、secret、URL locator 到队列或日志。

---

## 8. Qwen 执行模板

每个 Task 固定这样做：

### 8.1 读计划

只抽取当前 Task，不要读完整超长计划后乱总结。

```powershell
$task=26
$next=27
$p='docs/superpowers/plans/2026-08-23-ai-comic-canvas-mvp.md'
$lines=Get-Content -LiteralPath $p
$start=($lines | Select-String -Pattern "^### Task $task:" | Select-Object -First 1).LineNumber
$end=($lines | Select-String -Pattern "^### Task $next:" | Select-Object -First 1).LineNumber
$lines[($start-1)..($end-2)] -join "`n"
```

### 8.2 写 RED 测试

先创建计划要求的测试文件。测试必须明确断言：

- 权限失败；
- 幂等；
- replay 不重复；
- queue payload 不含敏感数据；
- billing 不用 number/float；
- terminal/nonterminal 状态不混淆；
- webhook/cancel/recover 的 union 穷尽处理。

### 8.3 跑 RED

运行 Task 指定命令。预期失败必须是缺实现，不是语法错/路径错。

### 8.4 实现

按现有代码风格做“小而闭环”的实现。不要引入大型框架或真实 provider 网络请求，除非该 Task 明确要求。

### 8.5 跑定向验证

先跑 Task 指定验证命令。

### 8.6 跑全局质量门

```powershell
corepack pnpm typecheck
corepack pnpm format:check
corepack pnpm lint
corepack pnpm test
corepack pnpm build
corepack pnpm verify:workspaces
corepack pnpm verify:fixed-points
corepack pnpm verify:boundaries
```

如果 `test/build` 因 Web/API/DB config 出现 `Access is denied`，用提权重跑同一命令。

---

## 9. 后续任务路线

### Task 26：Provider dispatch / recovery / webhook bootstrap

目标：让 Generation Worker 从 Outbox/Queue 安全拿到 event，进入 provider submit/poll/recover/cancel/webhook 处理。

必须保持：

- 不把 prompt、URL、secret 放进 queue。
- `accepted` cancel 只是 provider 收到取消请求，不代表 Job canceled。
- webhook 必须通过 Task 25 的 verified provider scope。
- timeout/ambiguous provider response 进入 reconciling。

验证建议：

```powershell
corepack pnpm --filter @comic-canvas/worker-generation test -- provider-dispatcher.test.ts
corepack pnpm --filter @comic-canvas/api test:e2e -- provider-webhook.e2e-spec.ts
corepack pnpm --filter @comic-canvas/db test -- provider-event-scope.integration.test.ts
```

### Task 27：Generation result persistence / asset promotion binding

目标：provider output 不能直接成为可用素材，必须进入 quarantine / moderation / immutable asset flow。

必须保持：

- provider output locator 不进浏览器，不进公开 URL。
- 输出先进入 Task 21/22 的 asset quarantine。
- moderation/rights/provenance 绑定后才能 selection。

### Task 28：Batch generation / versioning

目标：多镜头/多节点批量生成，有预算上限、取消、局部失败恢复。

必须保持：

- batch 不是一次大事务；每个 Job/Attempt 可恢复。
- 预算 reserve 必须逐项或按 policy 明确。
- 部分失败不污染成功 output。

### Task 29：Timeline / storyboard binding

目标：把生成结果稳定绑定到镜头、时间线、storyboard current candidate。

必须保持：

- Selection/current pointer 不等于 Approval。
- 审批状态仍由 governance/approval gate 控制。

### Task 30：Export preparation

目标：为后续 FFmpeg/export pipeline 准备 timeline-eligible assets。

必须保持：

- 视频必须满足 Task 22 CFR mezzanine 才可 timeline/export。

### Task 31+：ReferenceBinding / prompt compiler / provider-specific adapters

目标：进入真实 AI 漫剧生产能力。不要跳过前面的权限、账本、素材、审核链路。

---

## 10. 常见坑

### 10.1 不要把测试 Fake 带进生产 registry

Task 23 已有测试保证 Fake 不进 production registry。后续如果加 provider registry，继续保持这个规则。

### 10.2 不要绕过账本

所有 generation job 都必须先 estimate/reserve，再 dispatch。不能“先生成后补账”。

### 10.3 不要把 cancel 当 delete

取消不是删除 Job；取消可能仍有 late bill、late output、provider terminal evidence。

### 10.4 不要让 Selection 变成 Approval

Selection 只是“当前候选/基线指针”，Approval 是 governance。

### 10.5 不要让 offline intent 自动花钱

离线恢复后 estimate/model/input/price 变化必须重新确认。

### 10.6 不要尝试修 Task 00 preflight

除非用户提供真实证据。网上资料可用于竞品参考，但不能伪装成用户访谈、审批、法律签字。

---

## 11. 当前质量基线

如果 Qwen 开始前基线坏了，应先修基线。

当前已知通过：

```powershell
corepack pnpm typecheck
corepack pnpm format:check
corepack pnpm lint
corepack pnpm test
corepack pnpm build
corepack pnpm verify:workspaces
corepack pnpm verify:fixed-points
corepack pnpm verify:boundaries
```

当前已知预期失败：

```powershell
node scripts/verify-preflight.mjs
```

预期：`GATE: FAILED`，因为真实证据后补。

---

## 12. 给 Qwen 的工作口令

可以直接把下面这段发给 Qwen：

```text
你接手这个仓库时，先读取 docs/runbooks/2026-08-25-qwen-handoff.md。
不要提交 git。
不要伪造 Task 00 证据。
不要写入任何 API key。
当前断点：Task 25 已完成并通过 typecheck/format/lint/test/build/workspace/fixed-points/boundaries。
从 Task 26 开始，只抽取 Task 26 的计划文本，先写 RED 测试，再实现，再跑 Task 26 定向验证和全局质量门。
如果遇到 Access is denied 且是 Vitest/Vite/esbuild 读取配置问题，用提权重跑同一命令。
如果任何质量门失败，先修失败，不要开始新 Task。
保持商业化架构：多租户、项目权限、队列只传 eventId/route/payloadHash、账本 decimal string micros/bigint、provider secret 不落库明文、不进日志、不进队列。
```

---

## 13. 断点完成标记

本断点文件创建后，下次恢复以本文件为准。

当前下一步：Task 26。
