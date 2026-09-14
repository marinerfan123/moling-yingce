# 登录会话修复更新说明

日期：2026-09-14

提交：`a8e7643 fix: persist auth across browser refresh`

## 更新内容

- 修复登录后刷新页面被要求重新登录的问题。
- 登录成功后由 API 将已验证的 OIDC access token 交换为服务端 opaque session。
- 使用 `HttpOnly`、`SameSite=Lax` Cookie 保存会话，浏览器端不再持久化 access token 或 refresh token。
- 页面启动时请求 `/v1/auth/session`，通过 Cookie 恢复登录状态。
- 未登录时只挂载登录页面，避免直接进入受保护页面。
- 增加 OIDC issuer/JWKS 校验，拒绝未经验证的 token。
- 本地 Vite 开发环境增加 `/v1` 到 API `3001` 端口的代理。

## 使用说明

配置 API 环境变量：

```env
OIDC_ISSUER=http://127.0.0.1:8080/realms/comic-canvas
OIDC_AUDIENCE=comic-api
# 可选；默认使用 Keycloak 的标准 JWKS 地址
# OIDC_JWKS_URL=http://127.0.0.1:8080/realms/comic-canvas/protocol/openid-connect/certs
```

修改服务端代码或配置后，需要重启 API 和 Vite 开发服务一次。之后普通浏览器刷新不需要重新登录。

## 验证结果

- API 测试：21 个通过。
- Web 测试：40 个通过。
- Workspace 类型检查：17 个通过。
- Web/API 生产构建通过。

## 注意事项

当前默认会话存储为内存存储，浏览器刷新可以保持登录，但 API 进程重启后会话会清空。生产环境应注入 Redis 或 PostgreSQL 等持久化 `AuthSessionStore`。
