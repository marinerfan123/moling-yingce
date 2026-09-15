# tv.moling.fun 部署手册

本手册部署仓库中的完整影策应用（`backend/` Go 服务、`web/` Bun/Vite 前端、PostgreSQL 和 Redis），部署目录为 `/opt/comic-canvas-tv`。它不停止、不删除、不复用已有的 `/opt/moling` 项目。

## 运行拓扑

- 宿主机 Nginx：TLS、HTTP 到 HTTPS 跳转、反代到 `127.0.0.1:3300`
- `web`：完整 React 工作台和内部 Nginx；把 `/api/` 转发到 Compose 内的 `backend:8080`
- `backend`：完整 Go API、任务 worker、登录和模型渠道接口
- `migrate`：一次性 PostgreSQL schema migration
- `postgres`、`redis`：仅 Compose 网络可见，不绑定宿主机端口

生产 Compose 文件是 `infra/docker/compose.production.yml`。当前仓库的 `apps/` 和 `packages/` 参考工作区仍然保留，但不参与这个完整影策生产镜像。

## 首次部署

服务器要求 Docker、Docker Compose、Nginx、Certbot 和 `tv.moling.fun` 的 A 记录已指向 `8.217.12.36`。先将当前工作树（包含未提交的合并文件，但不包含 `.env`、`.git`、缓存和构建产物）传到 `/opt/comic-canvas-tv`，再执行：

```sh
cd /opt/comic-canvas-tv
umask 077
cp infra/docker/.env.production.example infra/docker/.env.production
postgres_password="$(openssl rand -hex 32)"
sed -i "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$postgres_password/" infra/docker/.env.production
sed -i "s#^DATABASE_URL=.*#DATABASE_URL=postgresql://open_ai_canvas:$postgres_password@postgres:5432/open_ai_canvas?sslmode=disable#" infra/docker/.env.production
chmod 600 infra/docker/.env.production

docker compose --env-file infra/docker/.env.production \
  -f infra/docker/compose.production.yml config --quiet
docker compose --env-file infra/docker/.env.production \
  -f infra/docker/compose.production.yml build
docker compose --env-file infra/docker/.env.production \
  -f infra/docker/compose.production.yml up -d postgres redis
docker compose --env-file infra/docker/.env.production \
  -f infra/docker/compose.production.yml run --rm migrate
docker compose --env-file infra/docker/.env.production \
  -f infra/docker/compose.production.yml up -d backend web
```

不要用没有 `--env-file` 的 `docker compose config`，因为它会把插值后的秘密打印到终端。后续更新使用同一组 `build` 和 `up -d backend web` 命令；不要删除带有用户数据的 Compose volumes。

## TLS 和 Nginx

先确认 DNS 与监听状态：

```sh
getent hosts tv.moling.fun
docker compose --env-file infra/docker/.env.production \
  -f infra/docker/compose.production.yml ps
curl -fsS http://127.0.0.1:3300/
```

如果宿主机 Nginx 已经占用 80/443，使用本仓库脚本提供 ACME webroot：

```sh
sh /opt/comic-canvas-tv/infra/deploy/host/install-tv.sh --acme-bootstrap
certbot certonly --webroot -w /var/www/tv-moling-fun-acme \
  -d tv.moling.fun --agree-tos --no-eff-email --non-interactive \
  -m admin@moling.fun
sh /opt/comic-canvas-tv/infra/deploy/host/install-tv.sh --acme-cleanup
sh /opt/comic-canvas-tv/infra/deploy/host/install-tv.sh
```

脚本只安装 `tv.moling.fun` 文件；发现同名但不属于本域名的配置时会拒绝覆盖。若替换已有站点，脚本会在同一 Nginx 目录保留带时间戳的 `tv.moling.fun.conf.backup.*` 备份。安装前后都运行 `nginx -t`，并重新检查 `https://tv.moling.fun/`。

## 首个管理员

生产模板默认 `CANVAS_REGISTRATION_ENABLED=false`，避免公网开放注册。首次管理员需要在受控网络中把该项临时改为 `true`，注册完成后立即改回 `false`，然后重启 `backend`：

```sh
sed -i 's/^CANVAS_REGISTRATION_ENABLED=.*/CANVAS_REGISTRATION_ENABLED=true/' infra/docker/.env.production
docker compose --env-file infra/docker/.env.production -f infra/docker/compose.production.yml up -d backend
# 在受控网络完成唯一管理员注册后：
sed -i 's/^CANVAS_REGISTRATION_ENABLED=.*/CANVAS_REGISTRATION_ENABLED=false/' infra/docker/.env.production
docker compose --env-file infra/docker/.env.production -f infra/docker/compose.production.yml up -d backend
```

不要在仓库、聊天记录、Shell 历史或公开日志中写入管理员密码、模型 API Key、数据库密码或证书私钥。

## 验收

```sh
curl -fsS http://127.0.0.1:3300/
curl -fsS http://127.0.0.1:3300/api/health/ready
curl -fsSI https://tv.moling.fun/
curl -fsS https://tv.moling.fun/api/health/ready
docker compose --env-file infra/docker/.env.production \
  -f infra/docker/compose.production.yml ps
```

预期：Web 返回 HTML，API readiness 返回成功，HTTPS 返回 `200`，Compose 中 `postgres`、`redis`、`backend`、`web` 为运行/健康状态。模型生成能否真正工作还取决于登录后在管理界面配置供应商渠道和 API Key；部署不会内置或伪造任何供应商凭据。

## 回滚和边界

更新前备份服务器专用的 `infra/docker/.env.production`，保留旧源码目录或镜像标签。应用回滚只恢复旧的完整应用源码并重新执行 `build`/`up -d`；不要执行 `down -v`。如果必须撤销站点，先从 Nginx 目录中选择脚本生成的 `tv.moling.fun.conf.backup.*`，恢复为 `tv.moling.fun.conf`，再 `nginx -t && nginx -s reload`（面板环境）或 `systemctl reload nginx`。整个流程不触碰 `/opt/moling`。
