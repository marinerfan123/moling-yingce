# 漫剧无限画布

本仓库当前处于产品与工程规划阶段。工作名为“漫剧无限画布”，最终品牌名在视觉设计启动前确定。

## 规划文档

- [产品、体验与技术蓝图](docs/product/ai-comic-canvas-blueprint.md)
- [MVP 逐任务实施计划](docs/superpowers/plans/2026-08-23-ai-comic-canvas-mvp.md)

## 当前结论

首版面向独立创作者和 3 至 10 人漫剧工作室，优先打通“剧本导入 -> 设定锁定 -> 分镜 -> 图片 -> 视频/配音 -> 时间线 -> 竖屏成片导出”的完整闭环。画布负责生产依赖，时间线负责成片顺序；所有生成结果采用非破坏版本，任何上游修改只标记下游过期，不自动重生成或扣费。

开始编码前，先完成蓝图第 20 节的决策门和第 21 节的前期准备清单。

## 完整影策运行时

本仓库同时保留 `apps/` 与 `packages/` 下的漫剧无限画布参考工作区，并补齐了完整影策应用所需的 `backend/`、`web/`、`assets/` 和 `plugin-packages/`。完整应用使用 Go 后端与 Bun/Vite 前端；生产部署配置位于 `infra/docker/compose.production.yml`，域名反代配置位于 `infra/deploy/host/`。

完整应用的本地开发要求 Bun 与 Go 1.25：

```bash
cd web && bun install --frozen-lockfile && bun run dev
cd backend && go test ./...
```

生产部署请阅读 [tv.moling.fun 部署手册](docs/runbooks/tv-moling-fun-deployment.md)。首次管理员注册应在受控网络完成，公网运行时保持 `CANVAS_REGISTRATION_ENABLED=false`；不要把任何 API 密钥、数据库密码或证书私钥写入仓库。
