import { expect, test } from "bun:test";

function compactSource(source: string) {
    return source.replace(/\s+/g, " ").trim();
}

test("registration page follows email and phone verification switches", async () => {
    const [registerSource, authSource, authSceneSource, accessSource, phoneSource] = await Promise.all([
        Bun.file(new URL("../src/pages/auth/register.tsx", import.meta.url)).text(),
        Bun.file(new URL("../src/services/api/auth.ts", import.meta.url)).text(),
        Bun.file(new URL("../src/pages/auth/auth-scene.tsx", import.meta.url)).text(),
        Bun.file(new URL("../src/pages/admin/components/access-settings-panel.tsx", import.meta.url)).text(),
        Bun.file(new URL("../src/pages/admin/components/phone-verification-settings-panel.tsx", import.meta.url)).text(),
    ]);
    const register = compactSource(registerSource);

    expect(authSource).toContain("emailCodeRequired: boolean");
    expect(authSource).toContain("phoneCodeRequired: boolean");
    expect(register).toContain("const requireCode = Boolean(settings && !settings.firstUser && settings.emailCodeRequired);");
    expect(register).toContain("const requirePhoneCode = Boolean(settings && !settings.firstUser && settings.phoneCodeRequired);");
    expect(register).toContain("{requireCode ? (");
    expect(register).toContain("{requirePhoneCode ? (");
    expect(register).toContain("sendRegistrationEmailCode");
    expect(register).toContain("sendRegistrationPhoneCode");
    expect(register).toContain("const disabled = registrationClosed || mailUnavailable || phoneUnavailable;");
    expect(authSceneSource).toContain("registrationEnabled");
    expect(authSceneSource).toContain("const authTabs = registrationEnabled === false ? [AUTH_TABS[0]] : AUTH_TABS;");
    expect(authSceneSource).toContain("正在读取注册设置");
    expect(accessSource).toContain("<PhoneVerificationSettingsPanel />");
    expect(phoneSource).toContain('value: "aliyun"');
    expect(phoneSource).toContain('value: "standard"');
    expect(phoneSource).toContain("短信开关已开启，但配置尚未完整，注册暂不可用");
});
