import { App, Button, Form, Input, Select, Skeleton, type FormInstance } from "antd";
import { Switch } from "@/components/ui/base/switch";
import { AlertTriangle, BadgeCheck, ChevronDown, CirclePlay, Globe2, KeyRound, LockKeyhole, MessageCircle, RefreshCw, RotateCcw, Save, ShieldCheck, UserPlus, UsersRound } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useBlocker } from "react-router";

import { cn } from "@/lib/utils";
import {
    getAdminDouyinSetting,
    getAdminLinuxDOSetting,
    getAdminRegistrationSetting,
    getAdminWeChatSetting,
    updateAdminDouyinSetting,
    updateAdminLinuxDOSetting,
    updateAdminRegistrationSetting,
    updateAdminWeChatSetting,
    type DouyinSetting,
    type LinuxDOSetting,
    type RegistrationSetting,
    type SocialLoginSetting,
    type WeChatSetting,
} from "@/services/api/wallet";
import { AdminStatusBadge, configuredSecretText, SettingsSectionCard } from "./admin-ui";
import PhoneVerificationSettingsPanel from "./phone-verification-settings-panel";

type LinuxDOFormValues = Omit<LinuxDOSetting, "hasClientSecret" | "updatedAt">;
type SocialLoginFormValues = Omit<SocialLoginSetting, "hasClientSecret" | "updatedAt">;
type SocialProvider = "wechat" | "douyin";

export default function AccessSettingsPanel() {
    const { message, modal } = App.useApp();
    const [linuxdo, setLinuxdo] = useState<LinuxDOSetting | null>(null);
    const [wechat, setWechat] = useState<WeChatSetting | null>(null);
    const [douyin, setDouyin] = useState<DouyinSetting | null>(null);
    const [registration, setRegistration] = useState<RegistrationSetting | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [savingLinuxDO, setSavingLinuxDO] = useState(false);
    const [savingWechat, setSavingWechat] = useState(false);
    const [savingDouyin, setSavingDouyin] = useState(false);
    const [savingRegistration, setSavingRegistration] = useState(false);
    const [linuxdoDirty, setLinuxdoDirty] = useState(false);
    const [wechatDirty, setWechatDirty] = useState(false);
    const [douyinDirty, setDouyinDirty] = useState(false);
    const [draftLinuxDOEnabled, setDraftLinuxDOEnabled] = useState(false);
    const [draftWechatEnabled, setDraftWechatEnabled] = useState(false);
    const [draftDouyinEnabled, setDraftDouyinEnabled] = useState(false);
    const [loadError, setLoadError] = useState("");
    const [saveError, setSaveError] = useState("");
    const [form] = Form.useForm<LinuxDOFormValues>();
    const [wechatForm] = Form.useForm<SocialLoginFormValues>();
    const [douyinForm] = Form.useForm<SocialLoginFormValues>();
    const requestVersionRef = useRef(0);
    const navigationConfirmOpenRef = useRef(false);
    const navigationTriggerRef = useRef<HTMLElement | null>(null);
    const dirty = linuxdoDirty || wechatDirty || douyinDirty;
    const savingProvider = savingLinuxDO || savingWechat || savingDouyin;

    const load = useCallback(
        async (initial = false, announce = false) => {
            const requestVersion = ++requestVersionRef.current;
            if (initial) setLoading(true);
            else setRefreshing(true);
            setLoadError("");
            try {
                const [linuxdoData, registrationData, wechatData, douyinData] = await Promise.all([getAdminLinuxDOSetting(), getAdminRegistrationSetting(), getAdminWeChatSetting(), getAdminDouyinSetting()]);
                if (requestVersion !== requestVersionRef.current) return;
                setLinuxdo(linuxdoData.setting);
                setRegistration(registrationData.setting);
                setWechat(wechatData.setting);
                setDouyin(douyinData.setting);
                form.setFieldsValue(toLinuxDOFormValues(linuxdoData.setting));
                wechatForm.setFieldsValue(toSocialLoginFormValues(wechatData.setting));
                douyinForm.setFieldsValue(toSocialLoginFormValues(douyinData.setting));
                setDraftLinuxDOEnabled(linuxdoData.setting.enabled);
                setDraftWechatEnabled(wechatData.setting.enabled);
                setDraftDouyinEnabled(douyinData.setting.enabled);
                setLinuxdoDirty(false);
                setWechatDirty(false);
                setDouyinDirty(false);
                setSaveError("");
                if (announce) message.success("已重新读取当前登录与注册配置");
            } catch (error) {
                if (requestVersion !== requestVersionRef.current) return;
                const errorMessage = error instanceof Error ? error.message : "读取登录与注册配置失败";
                setLoadError(errorMessage);
                if (!initial) message.error(errorMessage);
            } finally {
                if (requestVersion === requestVersionRef.current) {
                    setLoading(false);
                    setRefreshing(false);
                }
            }
        },
        [douyinForm, form, message, wechatForm],
    );

    useEffect(() => {
        void load(true);
        return () => {
            requestVersionRef.current += 1;
        };
    }, [load]);

    useEffect(() => {
        if (loading || !linuxdo || !registration || !wechat || !douyin) return;
        form.setFieldsValue(toLinuxDOFormValues(linuxdo));
        wechatForm.setFieldsValue(toSocialLoginFormValues(wechat));
        douyinForm.setFieldsValue(toSocialLoginFormValues(douyin));
        setDraftLinuxDOEnabled(linuxdo.enabled);
        setDraftWechatEnabled(wechat.enabled);
        setDraftDouyinEnabled(douyin.enabled);
    }, [douyin, douyinForm, form, linuxdo, loading, registration, wechat, wechatForm]);

    const blocker = useBlocker(dirty && !savingProvider);

    useEffect(() => {
        const beforeUnload = (event: BeforeUnloadEvent) => {
            if (!dirty || savingProvider) return;
            event.preventDefault();
        };
        window.addEventListener("beforeunload", beforeUnload);
        return () => window.removeEventListener("beforeunload", beforeUnload);
    }, [dirty, savingProvider]);

    useEffect(() => {
        if (blocker.state !== "blocked" || navigationConfirmOpenRef.current) return;
        navigationConfirmOpenRef.current = true;
        navigationTriggerRef.current = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
        modal.confirm({
            title: "放弃未保存的登录调整？",
            content: "当前登录表单有尚未保存的调整，离开后这些内容会丢失。用户注册状态不受影响。",
            okText: "放弃并离开",
            cancelText: "继续编辑",
            okButtonProps: { danger: true },
            onOk: () => {
                navigationConfirmOpenRef.current = false;
                navigationTriggerRef.current = null;
                blocker.proceed();
            },
            onCancel: () => {
                navigationConfirmOpenRef.current = false;
                blocker.reset();
                window.requestAnimationFrame(() => {
                    const fallback = document.querySelector<HTMLButtonElement>(".admin-access-command-actions button");
                    const target = navigationTriggerRef.current?.isConnected ? navigationTriggerRef.current : fallback;
                    target?.focus();
                    navigationTriggerRef.current = null;
                });
            },
        });
    }, [blocker, modal]);

    const resetLinuxDODraft = () => {
        if (!linuxdo || savingLinuxDO) return;
        form.setFieldsValue(toLinuxDOFormValues(linuxdo));
        form.setFields([]);
        setDraftLinuxDOEnabled(linuxdo.enabled);
        setLinuxdoDirty(false);
        setSaveError("");
        message.info("已撤销 Linux.do 登录的未保存调整");
    };

    const resetSocialDraft = (provider: SocialProvider) => {
        const setting = provider === "wechat" ? wechat : douyin;
        const socialForm = provider === "wechat" ? wechatForm : douyinForm;
        if (!setting || savingProvider) return;
        socialForm.setFieldsValue(toSocialLoginFormValues(setting));
        socialForm.setFields([]);
        if (provider === "wechat") {
            setDraftWechatEnabled(setting.enabled);
            setWechatDirty(false);
        } else {
            setDraftDouyinEnabled(setting.enabled);
            setDouyinDirty(false);
        }
        setSaveError("");
        message.info(`已撤销${socialProviderName(provider)}登录的未保存调整`);
    };

    const requestRefresh = () => {
        if (!dirty) {
            void load(false, true);
            return;
        }
        modal.confirm({
            title: "放弃调整并重新读取？",
            content: "重新读取会丢弃当前登录表单中的未保存内容，并以服务端配置为准。",
            okText: "放弃并刷新",
            cancelText: "继续编辑",
            okButtonProps: { danger: true },
            onOk: () => load(false, true),
        });
    };

    const toggleRegistration = async (enabled: boolean) => {
        setSavingRegistration(true);
        try {
            const data = await updateAdminRegistrationSetting(enabled);
            setRegistration(data.setting);
            message.success(enabled ? "用户注册已开启" : "用户注册已关闭");
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "更新注册设置失败";
            message.error(errorMessage);
            throw error;
        } finally {
            setSavingRegistration(false);
        }
    };

    const requestRegistrationChange = (enabled: boolean) => {
        if (!registration || enabled === registration.enabled || savingRegistration) return;
        void toggleRegistration(enabled).catch(() => undefined);
    };

    const saveLinuxDO = async (values: LinuxDOFormValues) => {
        const expected = normalizeLinuxDOFormValues(values);
        setSavingLinuxDO(true);
        setSaveError("");
        try {
            const result = await updateAdminLinuxDOSetting(expected);
            if (!linuxDOResponseMatches(result.setting, expected)) throw new Error("服务端返回的 Linux.do 配置与本次保存内容不一致，请重新读取后核对");
            setLinuxdo(result.setting);
            setLinuxdoDirty(false);
            message.success("Linux.do 登录配置已保存");
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "保存 Linux.do 配置失败";
            setSaveError(`${errorMessage}。未自动重试，请重新读取当前配置后再决定是否保存。`);
            message.error(errorMessage);
            throw error;
        } finally {
            setSavingLinuxDO(false);
        }
    };

    const saveSocial = async (provider: SocialProvider, values: SocialLoginFormValues) => {
        const expected = normalizeSocialLoginFormValues(values);
        const name = socialProviderName(provider);
        if (provider === "wechat") setSavingWechat(true);
        else setSavingDouyin(true);
        setSaveError("");
        try {
            const result = provider === "wechat" ? await updateAdminWeChatSetting(expected) : await updateAdminDouyinSetting(expected);
            if (!socialLoginResponseMatches(result.setting, expected)) throw new Error(`服务端返回的${name}配置与本次保存内容不一致，请重新读取后核对`);
            if (provider === "wechat") {
                setWechat(result.setting);
                setWechatDirty(false);
            } else {
                setDouyin(result.setting);
                setDouyinDirty(false);
            }
            message.success(`${name}登录配置已保存`);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : `保存${name}登录配置失败`;
            setSaveError(`${errorMessage}。未自动重试，请重新读取当前配置后再决定是否保存。`);
            message.error(errorMessage);
            throw error;
        } finally {
            if (provider === "wechat") setSavingWechat(false);
            else setSavingDouyin(false);
        }
    };

    const submitLinuxDOSave = async () => {
        let values: LinuxDOFormValues;
        try {
            values = await form.validateFields();
        } catch {
            return;
        }
        const validationError = validateLinuxDODraft(values, linuxdo);
        if (validationError) {
            message.error(validationError);
            return;
        }
        try {
            await saveLinuxDO(values);
        } catch {
            // 保存错误已在 saveLinuxDO 中就地提示。
        }
    };

    const toggleLinuxDO = (enabled: boolean) => {
        if (!linuxdo || savingLinuxDO) return;
        form.setFieldValue("enabled", enabled);
        setDraftLinuxDOEnabled(enabled);
        setLinuxdoDirty(hasLinuxDOChanges({ ...form.getFieldsValue(true), enabled }, linuxdo));
        setSaveError("");
    };

    const toggleSocial = (provider: SocialProvider, enabled: boolean) => {
        const setting = provider === "wechat" ? wechat : douyin;
        const socialForm = provider === "wechat" ? wechatForm : douyinForm;
        if (!setting || (provider === "wechat" ? savingWechat : savingDouyin)) return;
        socialForm.setFieldValue("enabled", enabled);
        const values = { ...socialForm.getFieldsValue(true), enabled };
        if (provider === "wechat") {
            setDraftWechatEnabled(enabled);
            setWechatDirty(hasSocialLoginChanges(values, setting));
        } else {
            setDraftDouyinEnabled(enabled);
            setDouyinDirty(hasSocialLoginChanges(values, setting));
        }
        setSaveError("");
    };

    if (loading && (!linuxdo || !registration || !wechat || !douyin)) {
        return (
            <div className="admin-settings-stack admin-access-settings" aria-label="正在读取登录与注册配置" role="status">
                <div className="admin-access-loading-card">
                    <Skeleton active paragraph={{ rows: 6 }} />
                </div>
            </div>
        );
    }

    if (!linuxdo || !registration || !wechat || !douyin) {
        return (
            <div className="admin-settings-stack admin-access-settings">
                <div className="admin-access-load-error" role="alert">
                    <span className="admin-access-load-error-icon">
                        <AlertTriangle className="size-5" aria-hidden="true" />
                    </span>
                    <div>
                        <h2>无法读取登录与注册配置</h2>
                        <p>{loadError || "当前没有可显示的配置，请稍后重试。"}</p>
                    </div>
                    <Button icon={<RefreshCw className="size-4" />} loading={refreshing} onClick={() => void load(false, true)}>
                        重新读取
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <div className="admin-settings-stack admin-access-settings">
            <div className={cn("admin-access-command-bar", dirty && "is-dirty")}>
                <div className="admin-access-command-copy" aria-live="polite">
                    <span className="admin-access-command-icon">
                        <ShieldCheck className="size-4" aria-hidden="true" />
                    </span>
                    <div>
                        <strong>{dirty ? `${dirtyProviderNames(linuxdoDirty, wechatDirty, douyinDirty)}有未保存的调整` : "登录与注册设置"}</strong>
                        <p>
                            {dirty
                                ? "完成接入信息后保存生效。"
                                : `新用户注册${registration.enabled ? "已开放" : "已关闭"} · Linux.do ${linuxdo.enabled ? "已启用" : "未启用"} · 微信 ${wechat.enabled ? "已启用" : "未启用"} · 抖音 ${douyin.enabled ? "已启用" : "未启用"}`}
                        </p>
                    </div>
                </div>
                <div className="admin-access-command-actions">
                    {dirty ? (
                        <Button
                            icon={<RotateCcw className="size-4" />}
                            disabled={savingProvider}
                            onClick={() => {
                                resetLinuxDODraft();
                                resetSocialDraft("wechat");
                                resetSocialDraft("douyin");
                            }}
                        >
                            撤销调整
                        </Button>
                    ) : null}
                    <Button icon={<RefreshCw className="size-4" />} loading={refreshing} disabled={savingProvider || savingRegistration} onClick={requestRefresh}>
                        刷新状态
                    </Button>
                </div>
            </div>

            {loadError || saveError ? (
                <div className="admin-access-inline-alert" role="alert">
                    <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
                    <span>{saveError || `${loadError}。页面仍显示上一次成功读取的配置。`}</span>
                </div>
            ) : null}

            <div id="admin-access-registration" className="admin-settings-anchor">
                <SettingsSectionCard
                    className="admin-access-section admin-access-registration-section"
                    icon={<UserPlus className="size-4" aria-hidden="true" />}
                    title="1. 是否允许创建新账号"
                    description="先决定是否开放注册。关闭后已有账号仍可登录，已有数据不会删除。"
                    status={<AdminStatusBadge label={registration.enabled ? "已开放" : "已关闭"} tone={registration.enabled ? "success" : "neutral"} />}
                >
                    <div className="admin-access-registration-policy">
                        <span className="admin-access-policy-icon">
                            <UsersRound className="size-5" aria-hidden="true" />
                        </span>
                        <div className="admin-access-policy-copy">
                            <div className="flex flex-wrap items-center gap-2">
                                <strong>允许创建新账号</strong>
                                <AdminStatusBadge label="切换即保存" tone="info" />
                            </div>
                            <p>关闭后，本地注册和未绑定账号的第三方首次登录都会被拒绝；已有账号及已绑定身份仍可继续登录。</p>
                            <span>{formatSettingTime(registration.updatedAt, "当前来自部署环境默认值")}</span>
                        </div>
                        <Switch checked={registration.enabled} loading={savingRegistration} disabled={loading || refreshing || savingProvider} onChange={requestRegistrationChange} aria-label="允许创建新账号，切换后立即生效" />
                    </div>
                </SettingsSectionCard>
            </div>

            <PhoneVerificationSettingsPanel />

            <div id="admin-access-linuxdo" className="admin-settings-anchor">
                <SettingsSectionCard
                    className="admin-access-section admin-access-linuxdo-section"
                    icon={<KeyRound className="size-4" aria-hidden="true" />}
                    title="3. 是否开放 Linux.do 登录"
                    description="先决定是否在登录与注册页展示 Linux.do。开启后再填写 OAuth 接入信息。"
                    status={<AdminStatusBadge label={draftLinuxDOEnabled ? (linuxdoDirty ? "待启用" : "运行中") : linuxdoDirty && linuxdo.enabled ? "待停用" : "未启用"} tone={linuxdoDirty ? "warning" : draftLinuxDOEnabled ? "success" : "neutral"} />}
                    footer={
                        <>
                            <div className="admin-access-footer-note">
                                <BadgeCheck className="size-4" aria-hidden="true" />
                                <span>{draftLinuxDOEnabled ? "完整填写 OAuth 接入信息后保存" : "关闭后隐藏入口，已有账号绑定不受影响"}</span>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                {linuxdoDirty ? (
                                    <Button icon={<RotateCcw className="size-4" />} disabled={savingLinuxDO} onClick={resetLinuxDODraft}>
                                        撤销
                                    </Button>
                                ) : null}
                                <Button type="primary" icon={<Save className="size-4" />} loading={savingLinuxDO} disabled={!linuxdoDirty || loading || refreshing || savingWechat || savingDouyin} onClick={() => void submitLinuxDOSave()}>
                                    {draftLinuxDOEnabled ? "保存并启用" : "保存并关闭"}
                                </Button>
                            </div>
                        </>
                    }
                >
                    <Form
                        form={form}
                        layout="vertical"
                        requiredMark={false}
                        disabled={loading || refreshing || savingProvider}
                        onValuesChange={() => {
                            const values = form.getFieldsValue(true);
                            setDraftLinuxDOEnabled(Boolean(values.enabled));
                            setLinuxdoDirty(hasLinuxDOChanges(values, linuxdo));
                            setSaveError("");
                        }}
                    >
                        <div className="admin-access-provider-toggle">
                            <span className="admin-access-policy-icon">
                                <ShieldCheck className="size-5" aria-hidden="true" />
                            </span>
                            <div className="admin-access-policy-copy">
                                <div className="flex flex-wrap items-center gap-2">
                                    <strong>在登录与注册页显示 Linux.do</strong>
                                    <AdminStatusBadge label="保存后生效" tone="info" />
                                </div>
                                <p>开启后显示第三方登录入口；首次登录是否能创建账号仍受上方注册开关控制。</p>
                                {!draftLinuxDOEnabled ? <span>当前关闭，因此 OAuth 凭据和端点配置已收起。</span> : null}
                            </div>
                            <Form.Item noStyle name="enabled" valuePropName="checked">
                                <Switch aria-label="在登录与注册页显示 Linux.do" onChange={toggleLinuxDO} />
                            </Form.Item>
                        </div>

                        {draftLinuxDOEnabled ? (
                            <>
                                <div className="admin-access-form-section">
                                    <FormSectionTitle icon={<KeyRound className="size-4" />} title="应用凭据" description="填写 Linux.do OAuth 应用的客户端信息；密钥只保存在服务端。" />
                                    <div className="admin-access-form-grid is-credentials">
                                        <Form.Item name="clientAuthMethod" label="Token 请求鉴权方式" rules={[{ required: true, message: "请选择鉴权方式" }]} extra="应用未特别要求时使用 Client Secret Post。">
                                            <Select
                                                options={[
                                                    { label: "Client Secret Post（推荐）", value: "client_secret_post" },
                                                    { label: "Client Secret Basic", value: "client_secret_basic" },
                                                ]}
                                            />
                                        </Form.Item>
                                        <Form.Item name="clientId" label="Client ID">
                                            <Input autoComplete="off" placeholder="Linux.do OAuth 应用的 Client ID" />
                                        </Form.Item>
                                        <Form.Item name="clientSecret" label={linuxdo.hasClientSecret ? `Client Secret（${configuredSecretText}）` : "Client Secret"}>
                                            <Input.Password autoComplete="new-password" placeholder={linuxdo.hasClientSecret ? "留空保留原密钥" : "Linux.do OAuth 应用的 Client Secret"} />
                                        </Form.Item>
                                    </div>
                                </div>

                                <div className="admin-access-form-section">
                                    <FormSectionTitle icon={<Globe2 className="size-4" />} title="OAuth 连接地址" description="授权、Token 和用户资料端点必须使用 HTTPS；本地回环回调可使用 HTTP。" />
                                    <div className="admin-access-form-grid">
                                        <Form.Item name="authorizationUrl" label="授权地址">
                                            <Input inputMode="url" placeholder="https://connect.linux.do/oauth2/authorize" />
                                        </Form.Item>
                                        <Form.Item name="tokenUrl" label="Token 地址">
                                            <Input inputMode="url" placeholder="https://connect.linux.do/oauth2/token" />
                                        </Form.Item>
                                        <Form.Item name="userInfoUrl" label="用户资料地址">
                                            <Input inputMode="url" placeholder="https://connect.linux.do/api/user" />
                                        </Form.Item>
                                        <Form.Item name="redirectUrl" label="本站回调地址" extra="必须与 Linux.do OAuth 应用登记值完全一致；推荐使用 /oauth/linuxdo/callback。">
                                            <Input inputMode="url" placeholder="https://你的域名/oauth/linuxdo/callback" />
                                        </Form.Item>
                                        <Form.Item name="scopes" label="授权范围（Scopes）" className="admin-access-form-span-full" extra="通常使用 openid、profile、email；按 Linux.do 应用实际授权范围填写。">
                                            <Select mode="tags" tokenSeparators={[",", " "]} placeholder="输入后按回车添加" />
                                        </Form.Item>
                                    </div>
                                </div>

                                <details className="admin-access-advanced group">
                                    <summary>
                                        <span className="admin-access-advanced-icon">
                                            <LockKeyhole className="size-4" aria-hidden="true" />
                                        </span>
                                        <span>
                                            <strong>高级：用户资料字段映射</strong>
                                            <small>指定从 Linux.do 响应中读取本地账号信息的字段路径。</small>
                                        </span>
                                        <AdminStatusBadge label="通常无需修改" tone="neutral" />
                                        <ChevronDown className="size-4 shrink-0 transition-transform group-open:rotate-180" aria-hidden="true" />
                                    </summary>
                                    <div className="admin-access-form-grid is-mapping">
                                        <Form.Item name="subjectField" label="唯一用户 ID 字段" extra="账号绑定的唯一依据，必须长期稳定。">
                                            <Input placeholder="id" />
                                        </Form.Item>
                                        <Form.Item name="usernameField" label="用户名字段" extra="用于生成本站用户名。">
                                            <Input placeholder="username" />
                                        </Form.Item>
                                        <Form.Item name="displayNameField" label="显示名称字段" extra="显示在用户菜单中的名称。">
                                            <Input placeholder="name" />
                                        </Form.Item>
                                        <Form.Item name="emailField" label="邮箱字段" extra="没有或无效时允许留空。">
                                            <Input placeholder="email" />
                                        </Form.Item>
                                        <Form.Item name="avatarField" label="头像地址字段" extra="支持 data.user.avatar_url 这类嵌套路径。">
                                            <Input placeholder="avatar_url" />
                                        </Form.Item>
                                    </div>
                                </details>
                            </>
                        ) : null}
                    </Form>
                </SettingsSectionCard>
            </div>

            <div id="admin-access-wechat" className="admin-settings-anchor">
                <SocialLoginProviderCard
                    provider="wechat"
                    setting={wechat}
                    form={wechatForm}
                    enabled={draftWechatEnabled}
                    dirty={wechatDirty}
                    saving={savingWechat}
                    disabled={loading || refreshing || savingProvider}
                    icon={<MessageCircle className="size-4" aria-hidden="true" />}
                    onToggle={(enabled) => toggleSocial("wechat", enabled)}
                    onDirtyChange={(enabled, nextDirty) => {
                        setDraftWechatEnabled(enabled);
                        setWechatDirty(nextDirty);
                        setSaveError("");
                    }}
                    onReset={() => resetSocialDraft("wechat")}
                    onSave={(values) => saveSocial("wechat", values)}
                />
            </div>

            <div id="admin-access-douyin" className="admin-settings-anchor">
                <SocialLoginProviderCard
                    provider="douyin"
                    setting={douyin}
                    form={douyinForm}
                    enabled={draftDouyinEnabled}
                    dirty={douyinDirty}
                    saving={savingDouyin}
                    disabled={loading || refreshing || savingProvider}
                    icon={<CirclePlay className="size-4" aria-hidden="true" />}
                    onToggle={(enabled) => toggleSocial("douyin", enabled)}
                    onDirtyChange={(enabled, nextDirty) => {
                        setDraftDouyinEnabled(enabled);
                        setDouyinDirty(nextDirty);
                        setSaveError("");
                    }}
                    onReset={() => resetSocialDraft("douyin")}
                    onSave={(values) => saveSocial("douyin", values)}
                />
            </div>
        </div>
    );
}

function SocialLoginProviderCard({
    provider,
    setting,
    form,
    enabled,
    dirty,
    saving,
    disabled,
    icon,
    onToggle,
    onDirtyChange,
    onReset,
    onSave,
}: {
    provider: SocialProvider;
    setting: SocialLoginSetting;
    form: FormInstance<SocialLoginFormValues>;
    enabled: boolean;
    dirty: boolean;
    saving: boolean;
    disabled: boolean;
    icon: ReactNode;
    onToggle: (enabled: boolean) => void;
    onDirtyChange: (enabled: boolean, dirty: boolean) => void;
    onReset: () => void;
    onSave: (values: SocialLoginFormValues) => Promise<void>;
}) {
    const { message } = App.useApp();
    const name = socialProviderName(provider);
    const clientLabel = provider === "wechat" ? "App ID" : "Client Key";
    const clientPlaceholder = provider === "wechat" ? "微信开放平台的 App ID" : "抖音开放平台的 Client Key";
    const secretLabel = provider === "wechat" ? "App Secret" : "Client Secret";
    const callbackHint = `必须与${name}开放平台登记值完全一致；推荐使用 /oauth/${provider}/callback。`;

    const submit = async () => {
        let values: SocialLoginFormValues;
        try {
            values = await form.validateFields();
        } catch {
            return;
        }
        const validationError = validateSocialLoginDraft(values, setting, name);
        if (validationError) {
            message.error(validationError);
            return;
        }
        try {
            await onSave(values);
        } catch {
            // 保存错误已在父组件中就地提示。
        }
    };

    return (
        <SettingsSectionCard
            className="admin-access-section admin-access-social-section"
            icon={icon}
            title={`${provider === "wechat" ? "4" : "5"}. 是否开放 ${name} 登录`}
            description={`配置${name}开放平台应用后，用户可在登录与注册页使用${name}账号进入系统。`}
            status={<AdminStatusBadge label={enabled ? (dirty ? "待启用" : "运行中") : dirty && setting.enabled ? "待停用" : "未启用"} tone={dirty ? "warning" : enabled ? "success" : "neutral"} />}
            footer={
                <>
                    <div className="admin-access-footer-note">
                        <BadgeCheck className="size-4" aria-hidden="true" />
                        <span>{enabled ? `完整填写${name}接入信息后保存` : "关闭后隐藏入口，已有账号绑定不受影响"}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        {dirty ? (
                            <Button icon={<RotateCcw className="size-4" />} disabled={saving} onClick={onReset}>
                                撤销
                            </Button>
                        ) : null}
                        <Button type="primary" icon={<Save className="size-4" />} loading={saving} disabled={!dirty || disabled} onClick={() => void submit()}>
                            {enabled ? "保存并启用" : "保存并关闭"}
                        </Button>
                    </div>
                </>
            }
        >
            <Form
                form={form}
                layout="vertical"
                requiredMark={false}
                disabled={disabled}
                onValuesChange={() => {
                    const values = form.getFieldsValue(true);
                    onDirtyChange(Boolean(values.enabled), hasSocialLoginChanges(values, setting));
                }}
            >
                <div className="admin-access-provider-toggle">
                    <span className="admin-access-policy-icon">{icon}</span>
                    <div className="admin-access-policy-copy">
                        <div className="flex flex-wrap items-center gap-2">
                            <strong>在登录与注册页显示 {name}</strong>
                            <AdminStatusBadge label="保存后生效" tone="info" />
                        </div>
                        <p>开启后显示第三方登录入口；首次登录是否能创建账号仍受上方注册开关控制。</p>
                        {!enabled ? <span>当前关闭，因此接入凭据和端点配置已收起。</span> : null}
                    </div>
                    <Form.Item noStyle name="enabled" valuePropName="checked">
                        <Switch aria-label={`在登录与注册页显示 ${name}`} onChange={onToggle} />
                    </Form.Item>
                </div>

                {enabled ? (
                    <>
                        <div className="admin-access-form-section">
                            <FormSectionTitle icon={<KeyRound className="size-4" />} title="应用凭据" description={`填写${name}开放平台应用的客户端信息；密钥只保存在服务端。`} />
                            <div className="admin-access-form-grid is-credentials">
                                <Form.Item name="clientId" label={clientLabel} rules={[{ required: true, message: `请输入${clientLabel}` }]}>
                                    <Input autoComplete="off" placeholder={clientPlaceholder} />
                                </Form.Item>
                                <Form.Item name="clientSecret" label={setting.hasClientSecret ? `${secretLabel}（${configuredSecretText}）` : secretLabel}>
                                    <Input.Password autoComplete="new-password" placeholder={setting.hasClientSecret ? "留空保留原密钥" : `开放平台应用的${secretLabel}`} />
                                </Form.Item>
                            </div>
                        </div>

                        <div className="admin-access-form-section">
                            <FormSectionTitle icon={<Globe2 className="size-4" />} title="连接地址" description={`授权、Token 和用户资料端点必须使用 HTTPS；本地回环回调可使用 HTTP。`} />
                            <div className="admin-access-form-grid">
                                <Form.Item name="authorizationUrl" label="授权地址" rules={[{ required: true, message: "请输入授权地址" }]}>
                                    <Input inputMode="url" placeholder={provider === "wechat" ? "https://open.weixin.qq.com/connect/qrconnect" : "https://open.douyin.com/platform/oauth/connect/"} />
                                </Form.Item>
                                <Form.Item name="tokenUrl" label="Token 地址" rules={[{ required: true, message: "请输入 Token 地址" }]}>
                                    <Input inputMode="url" placeholder={provider === "wechat" ? "https://api.weixin.qq.com/sns/oauth2/access_token" : "https://open.douyin.com/oauth/access_token/"} />
                                </Form.Item>
                                <Form.Item name="userInfoUrl" label="用户资料地址" rules={[{ required: true, message: "请输入用户资料地址" }]}>
                                    <Input inputMode="url" placeholder={provider === "wechat" ? "https://api.weixin.qq.com/sns/userinfo" : "https://open.douyin.com/oauth/userinfo/"} />
                                </Form.Item>
                                <Form.Item name="redirectUrl" label="本站回调地址" extra={callbackHint} rules={[{ required: true, message: "请输入回调地址" }]}>
                                    <Input inputMode="url" placeholder={`https://你的域名/oauth/${provider}/callback`} />
                                </Form.Item>
                                <Form.Item
                                    name="scopes"
                                    label="授权范围（Scopes）"
                                    className="admin-access-form-span-full"
                                    extra={provider === "wechat" ? "微信网页登录通常使用 snsapi_login。" : "抖音网页登录通常使用 user_info，可按开放平台实际授权范围调整。"}
                                >
                                    <Select mode="tags" tokenSeparators={[",", " "]} placeholder="输入后按回车添加" />
                                </Form.Item>
                            </div>
                        </div>
                    </>
                ) : null}
            </Form>
        </SettingsSectionCard>
    );
}

function FormSectionTitle({ icon, title, description }: { icon: ReactNode; title: string; description: string }) {
    return (
        <div className="admin-access-form-section-heading">
            <span>{icon}</span>
            <div>
                <h3>{title}</h3>
                <p>{description}</p>
            </div>
        </div>
    );
}

function toLinuxDOFormValues(setting: LinuxDOSetting): LinuxDOFormValues {
    return {
        enabled: setting.enabled,
        clientId: setting.clientId,
        clientSecret: "",
        authorizationUrl: setting.authorizationUrl,
        tokenUrl: setting.tokenUrl,
        userInfoUrl: setting.userInfoUrl,
        redirectUrl: setting.redirectUrl,
        scopes: setting.scopes || [],
        clientAuthMethod: setting.clientAuthMethod,
        subjectField: setting.subjectField,
        usernameField: setting.usernameField,
        displayNameField: setting.displayNameField,
        emailField: setting.emailField,
        avatarField: setting.avatarField,
    };
}

function socialProviderName(provider: SocialProvider) {
    return provider === "wechat" ? "微信" : "抖音";
}

function dirtyProviderNames(linuxdo: boolean, wechat: boolean, douyin: boolean) {
    return [linuxdo && "Linux.do", wechat && "微信", douyin && "抖音"].filter(Boolean).join("、");
}

function toSocialLoginFormValues(setting: SocialLoginSetting): SocialLoginFormValues {
    return {
        enabled: setting.enabled,
        clientId: setting.clientId,
        clientSecret: "",
        authorizationUrl: setting.authorizationUrl,
        tokenUrl: setting.tokenUrl,
        userInfoUrl: setting.userInfoUrl,
        redirectUrl: setting.redirectUrl,
        scopes: setting.scopes || [],
    };
}

function normalizeLinuxDOFormValues(values: LinuxDOFormValues): LinuxDOFormValues {
    return {
        enabled: Boolean(values.enabled),
        clientId: values.clientId?.trim() || "",
        clientSecret: values.clientSecret?.trim() || "",
        authorizationUrl: values.authorizationUrl?.trim() || "",
        tokenUrl: values.tokenUrl?.trim() || "",
        userInfoUrl: values.userInfoUrl?.trim() || "",
        redirectUrl: values.redirectUrl?.trim() || "",
        scopes: [...new Set((values.scopes || []).map((value) => value.trim()).filter(Boolean))],
        clientAuthMethod: values.clientAuthMethod || "client_secret_post",
        subjectField: values.subjectField?.trim() || "id",
        usernameField: values.usernameField?.trim() || "username",
        displayNameField: values.displayNameField?.trim() || "name",
        emailField: values.emailField?.trim() || "email",
        avatarField: values.avatarField?.trim() || "avatar_url",
    };
}

function hasLinuxDOChanges(values: LinuxDOFormValues, setting: LinuxDOSetting | null) {
    if (!setting) return false;
    const draft = normalizeLinuxDOFormValues(values);
    const saved = normalizeLinuxDOFormValues(toLinuxDOFormValues(setting));
    if (draft.clientSecret) return true;
    return (Object.keys(saved) as Array<keyof LinuxDOFormValues>).some((key) => key !== "clientSecret" && JSON.stringify(draft[key]) !== JSON.stringify(saved[key]));
}

function normalizeSocialLoginFormValues(values: SocialLoginFormValues): SocialLoginFormValues {
    return {
        enabled: Boolean(values.enabled),
        clientId: values.clientId?.trim() || "",
        clientSecret: values.clientSecret?.trim() || "",
        authorizationUrl: values.authorizationUrl?.trim() || "",
        tokenUrl: values.tokenUrl?.trim() || "",
        userInfoUrl: values.userInfoUrl?.trim() || "",
        redirectUrl: values.redirectUrl?.trim() || "",
        scopes: [...new Set((values.scopes || []).map((value) => value.trim()).filter(Boolean))],
    };
}

function hasSocialLoginChanges(values: SocialLoginFormValues, setting: SocialLoginSetting | null) {
    if (!setting) return false;
    const draft = normalizeSocialLoginFormValues(values);
    const saved = normalizeSocialLoginFormValues(toSocialLoginFormValues(setting));
    if (draft.clientSecret) return true;
    return (Object.keys(saved) as Array<keyof SocialLoginFormValues>).some((key) => key !== "clientSecret" && JSON.stringify(draft[key]) !== JSON.stringify(saved[key]));
}

function validateSocialLoginDraft(values: SocialLoginFormValues, setting: SocialLoginSetting | null, name: string) {
    const draft = normalizeSocialLoginFormValues(values);
    if (!draft.enabled) return "";
    if (!draft.clientId || (!draft.clientSecret && !setting?.hasClientSecret) || !draft.authorizationUrl || !draft.tokenUrl || !draft.userInfoUrl || !draft.redirectUrl) return `启用${name}登录前请完整填写客户端凭据、端点和回调配置`;
    for (const value of [draft.authorizationUrl, draft.tokenUrl, draft.userInfoUrl]) if (!isValidURL(value, true)) return `${name}授权、Token 和用户资料地址必须是有效的 HTTPS URL`;
    if (!isValidRedirectURL(draft.redirectUrl)) return `${name}回调地址必须使用 HTTPS，本地回环地址可使用 HTTP`;
    return "";
}

function socialLoginResponseMatches(setting: SocialLoginSetting, expected: SocialLoginFormValues) {
    const actual = normalizeSocialLoginFormValues(toSocialLoginFormValues(setting));
    const fields: Array<keyof SocialLoginFormValues> = ["enabled", "clientId", "authorizationUrl", "tokenUrl", "userInfoUrl", "redirectUrl", "scopes"];
    if (expected.clientSecret && !setting.hasClientSecret) return false;
    return fields.every((key) => JSON.stringify(actual[key]) === JSON.stringify(expected[key]));
}

function validateLinuxDODraft(values: LinuxDOFormValues, setting: LinuxDOSetting | null) {
    const draft = normalizeLinuxDOFormValues(values);
    if (!draft.enabled) return "";
    if (!draft.clientId || (!draft.clientSecret && !setting?.hasClientSecret) || !draft.authorizationUrl || !draft.tokenUrl || !draft.userInfoUrl || !draft.redirectUrl) return "启用 Linux.do 登录前请完整填写 Client、端点和回调配置";
    for (const value of [draft.authorizationUrl, draft.tokenUrl, draft.userInfoUrl]) if (!isValidURL(value, true)) return "Linux.do 授权、Token 和用户资料地址必须是有效的 HTTPS URL";
    if (!isValidRedirectURL(draft.redirectUrl)) return "Linux.do 回调地址必须使用 HTTPS，本地回环地址可使用 HTTP";
    return "";
}

function linuxDOResponseMatches(setting: LinuxDOSetting, expected: LinuxDOFormValues) {
    const actual = normalizeLinuxDOFormValues(toLinuxDOFormValues(setting));
    const fields: Array<keyof LinuxDOFormValues> = ["enabled", "clientId", "authorizationUrl", "tokenUrl", "userInfoUrl", "redirectUrl", "scopes", "clientAuthMethod", "subjectField", "usernameField", "displayNameField", "emailField", "avatarField"];
    if (expected.clientSecret && !setting.hasClientSecret) return false;
    return fields.every((key) => JSON.stringify(actual[key]) === JSON.stringify(expected[key]));
}

function isValidURL(value: string, requireHTTPS = false) {
    try {
        const parsed = new URL(value);
        return Boolean(parsed.host) && (!requireHTTPS || parsed.protocol === "https:");
    } catch {
        return false;
    }
}

function isValidRedirectURL(value: string) {
    try {
        const parsed = new URL(value);
        if (parsed.protocol === "https:" && parsed.host) return true;
        return parsed.protocol === "http:" && ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);
    } catch {
        return false;
    }
}

function formatSettingTime(value: string | undefined, fallback: string) {
    if (!value) return fallback;
    const date = new Date(value);
    if (Number.isNaN(date.getTime()) || date.getFullYear() < 2000) return fallback;
    return `更新于 ${date.toLocaleString("zh-CN", { hour12: false })}`;
}
