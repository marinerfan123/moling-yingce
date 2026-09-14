import { expect, test } from "bun:test";

test("WeChat and Douyin login providers are wired through settings, buttons, and callbacks", async () => {
    const [authAPI, walletAPI, accessPanel, loginPage, registerPage, backendAuth, backendHandler, viteConfig, nginxConfig] = await Promise.all([
        Bun.file(new URL("../src/services/api/auth.ts", import.meta.url)).text(),
        Bun.file(new URL("../src/services/api/wallet.ts", import.meta.url)).text(),
        Bun.file(new URL("../src/pages/admin/components/access-settings-panel.tsx", import.meta.url)).text(),
        Bun.file(new URL("../src/pages/auth/login.tsx", import.meta.url)).text(),
        Bun.file(new URL("../src/pages/auth/register.tsx", import.meta.url)).text(),
        Bun.file(new URL("../../backend/internal/auth/social_login.go", import.meta.url)).text(),
        Bun.file(new URL("../../backend/internal/handler/auth.go", import.meta.url)).text(),
        Bun.file(new URL("../vite.config.ts", import.meta.url)).text(),
        Bun.file(new URL("../../nginx.conf", import.meta.url)).text(),
    ]);

    expect(authAPI).toContain("wechatEnabled");
    expect(authAPI).toContain("douyinEnabled");
    expect(authAPI).toContain("weChatLoginURL");
    expect(authAPI).toContain("douyinLoginURL");
    expect(walletAPI).toContain("getAdminWeChatSetting");
    expect(walletAPI).toContain("getAdminDouyinSetting");
    expect(accessPanel).toContain('id="admin-access-wechat"');
    expect(accessPanel).toContain('id="admin-access-douyin"');
    expect(loginPage).toContain("使用微信登录");
    expect(loginPage).toContain("使用抖音登录");
    expect(registerPage).toContain("使用微信注册 / 登录");
    expect(registerPage).toContain("使用抖音注册 / 登录");
    expect(backendAuth).toContain('wechatSettingKey = "wechat_oauth"');
    expect(backendAuth).toContain('douyinSettingKey = "douyin_oauth"');
    expect(backendHandler).toContain('r.GET("/auth/wechat/start"');
    expect(backendHandler).toContain('r.GET("/auth/douyin/start"');
    expect(viteConfig).toContain('"/oauth/wechat/callback"');
    expect(viteConfig).toContain('"/oauth/douyin/callback"');
    expect(nginxConfig).toContain("location ~ ^/oauth/(linuxdo|wechat|douyin)/callback$");
});
