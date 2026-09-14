import { App, Button, Form, Input, Select, Skeleton } from "antd";
import { BadgeCheck, KeyRound, Phone, RefreshCw, RotateCcw, Save, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useBlocker } from "react-router";

import { Switch } from "@/components/ui/base/switch";
import { getAdminSMSSetting, updateAdminSMSSetting, type SMSSetting } from "@/services/api/wallet";
import { AdminStatusBadge, configuredSecretText, SettingsSectionCard } from "./admin-ui";

type SMSFormValues = {
    enabled: boolean;
    provider: "aliyun" | "standard";
    accessKeyId: string;
    accessKeySecret: string;
    signName: string;
    templateCode: string;
    endpoint: string;
    apiKey: string;
};

export default function PhoneVerificationSettingsPanel() {
    const { message, modal } = App.useApp();
    const [setting, setSetting] = useState<SMSSetting | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [dirty, setDirty] = useState(false);
    const [draftEnabled, setDraftEnabled] = useState(false);
    const [draftProvider, setDraftProvider] = useState<SMSFormValues["provider"]>("aliyun");
    const [loadError, setLoadError] = useState("");
    const [saveError, setSaveError] = useState("");
    const [form] = Form.useForm<SMSFormValues>();
    const requestVersionRef = useRef(0);
    const navigationConfirmOpenRef = useRef(false);
    const navigationTriggerRef = useRef<HTMLElement | null>(null);

    const load = useCallback(async (initial = false, announce = false) => {
        const requestVersion = ++requestVersionRef.current;
        if (initial) setLoading(true);
        else setRefreshing(true);
        setLoadError("");
        try {
            const result = await getAdminSMSSetting();
            if (requestVersion !== requestVersionRef.current) return;
            setSetting(result.setting);
            form.setFieldsValue(toSMSFormValues(result.setting));
            setDraftEnabled(result.setting.enabled);
            setDraftProvider(result.setting.provider);
            setDirty(false);
            setSaveError("");
            if (announce) message.success("已重新读取手机验证码配置");
        } catch (error) {
            if (requestVersion !== requestVersionRef.current) return;
            const errorMessage = error instanceof Error ? error.message : "读取手机验证码配置失败";
            setLoadError(errorMessage);
            if (!initial) message.error(errorMessage);
        } finally {
            if (requestVersion === requestVersionRef.current) {
                setLoading(false);
                setRefreshing(false);
            }
        }
    }, [form, message]);

    useEffect(() => {
        void load(true);
        return () => {
            requestVersionRef.current += 1;
        };
    }, [load]);

    const blocker = useBlocker(dirty && !saving);

    useEffect(() => {
        if (blocker.state !== "blocked" || navigationConfirmOpenRef.current) return;
        navigationConfirmOpenRef.current = true;
        navigationTriggerRef.current = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
        modal.confirm({
            title: "放弃手机验证码调整？",
            content: "当前短信配置有尚未保存的调整，离开后这些内容会丢失。",
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
                    const fallback = document.querySelector<HTMLButtonElement>(".admin-access-sms-section button");
                    const target = navigationTriggerRef.current?.isConnected ? navigationTriggerRef.current : fallback;
                    target?.focus();
                    navigationTriggerRef.current = null;
                });
            },
        });
    }, [blocker, modal]);

    const resetDraft = () => {
        if (!setting || saving) return;
        form.setFieldsValue(toSMSFormValues(setting));
        form.setFields([]);
        setDraftEnabled(setting.enabled);
        setDraftProvider(setting.provider);
        setDirty(false);
        setSaveError("");
        message.info("已撤销手机验证码配置的未保存调整");
    };

    const requestRefresh = () => {
        if (!dirty) {
            void load(false, true);
            return;
        }
        modal.confirm({
            title: "放弃调整并重新读取？",
            content: "重新读取会丢弃当前手机验证码配置中的未保存内容，并以服务端配置为准。",
            okText: "放弃并刷新",
            cancelText: "继续编辑",
            okButtonProps: { danger: true },
            onOk: () => load(false, true),
        });
    };

    const toggleEnabled = (enabled: boolean) => {
        if (saving) return;
        form.setFieldValue("enabled", enabled);
        setDraftEnabled(enabled);
        setDirty(hasSMSChanges({ ...form.getFieldsValue(true), enabled }, setting));
        setSaveError("");
    };

    const save = async () => {
        if (!setting) return;
        let values: SMSFormValues;
        try {
            values = await form.validateFields();
        } catch {
            return;
        }
        const expected = normalizeSMSFormValues(values);
        const validationError = validateSMSDraft(expected, setting);
        if (validationError) {
            message.error(validationError);
            return;
        }
        setSaving(true);
        setSaveError("");
        try {
            const result = await updateAdminSMSSetting(expected);
            if (!smsResponseMatches(result.setting, expected)) throw new Error("服务端返回的短信配置与本次保存内容不一致，请重新读取后核对");
            setSetting(result.setting);
            form.setFieldsValue(toSMSFormValues(result.setting));
            setDraftEnabled(result.setting.enabled);
            setDraftProvider(result.setting.provider);
            setDirty(false);
            message.success(result.setting.enabled ? "手机验证码验证已保存并启用" : "手机验证码验证配置已保存并关闭");
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "保存手机验证码配置失败";
            setSaveError(`${errorMessage}。未自动重试，请重新读取当前配置后再决定是否保存。`);
            message.error(errorMessage);
        } finally {
            setSaving(false);
        }
    };

    if (loading && !setting) {
        return (
            <div className="admin-access-sms-loading" aria-label="正在读取手机验证码配置" role="status">
                <Skeleton active paragraph={{ rows: 5 }} />
            </div>
        );
    }

    if (!setting) {
        return (
            <div className="admin-access-sms-load-error" role="alert">
                <span>{loadError || "当前没有可显示的手机验证码配置，请稍后重试。"}</span>
                <Button icon={<RefreshCw className="size-4" />} loading={refreshing} onClick={() => void load(false, true)}>
                    重新读取
                </Button>
            </div>
        );
    }

    return (
        <div id="admin-access-sms" className="admin-settings-anchor">
            <SettingsSectionCard
                className="admin-access-section admin-access-sms-section"
                icon={<Phone className="size-4" aria-hidden="true" />}
                title="2. 是否启用手机验证码验证"
                description="启用后，普通注册还需完成手机验证码；是否需要邮箱验证码由邮件服务中的邮箱验证开关决定。首个管理员账号不受影响。"
                status={<AdminStatusBadge label={dirty ? "待保存" : setting.enabled ? (setting.configured ? "已启用" : "待完善") : "未启用"} tone={dirty ? "warning" : setting.enabled && setting.configured ? "success" : setting.enabled ? "warning" : "neutral"} />}
                footer={
                    <>
                        <div className="admin-access-footer-note">
                            <BadgeCheck className="size-4" aria-hidden="true" />
                            <span>{draftEnabled ? "完整填写短信服务商配置后保存生效" : "关闭后注册不要求手机验证码，已有账号不受影响"}</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            {dirty ? (
                                <Button icon={<RotateCcw className="size-4" />} disabled={saving} onClick={resetDraft}>
                                    撤销
                                </Button>
                            ) : null}
                            <Button icon={<RefreshCw className="size-4" />} loading={refreshing} disabled={saving} onClick={requestRefresh}>
                                刷新
                            </Button>
                            <Button type="primary" icon={<Save className="size-4" />} loading={saving} disabled={!dirty || loading || refreshing} onClick={() => void save()}>
                                {draftEnabled ? "保存并启用" : "保存并关闭"}
                            </Button>
                        </div>
                    </>
                }
            >
                {loadError || saveError ? (
                    <div className="admin-access-inline-alert" role="alert">
                        <ShieldCheck className="size-4 shrink-0" aria-hidden="true" />
                        <span>{saveError || `${loadError}。页面仍显示上一次成功读取的配置。`}</span>
                    </div>
                ) : null}
                <Form
                    form={form}
                    layout="vertical"
                    requiredMark={false}
                    disabled={loading || refreshing || saving}
                    onValuesChange={(changedValues) => {
                        const values = form.getFieldsValue(true);
                        if (Object.prototype.hasOwnProperty.call(changedValues, "enabled")) setDraftEnabled(Boolean(values.enabled));
                        if (Object.prototype.hasOwnProperty.call(changedValues, "provider")) setDraftProvider(values.provider || "aliyun");
                        setDirty(hasSMSChanges(values, setting));
                        setSaveError("");
                    }}
                >
                    <div className="admin-access-provider-toggle admin-access-sms-toggle">
                        <span className="admin-access-policy-icon">
                            <Phone className="size-5" aria-hidden="true" />
                        </span>
                        <div className="admin-access-policy-copy">
                            <div className="flex flex-wrap items-center gap-2">
                                <strong>要求新用户完成手机验证</strong>
                                <AdminStatusBadge label="保存后生效" tone="info" />
                            </div>
                            <p>手机号只用于注册验证并保存为账号安全信息；验证码不会写入日志或数据库明文。</p>
                            {!draftEnabled ? <span>当前关闭，因此短信服务商配置已收起。</span> : null}
                        </div>
                        <Form.Item noStyle name="enabled" valuePropName="checked">
                            <Switch aria-label="要求新用户完成手机验证" onChange={toggleEnabled} />
                        </Form.Item>
                    </div>

                    {draftEnabled ? (
                        <>
                            <div className="admin-access-form-section">
                                <div className="admin-access-form-section-heading">
                                    <span><KeyRound className="size-4" /></span>
                                    <div>
                                        <h3>短信服务商</h3>
                                        <p>优先使用阿里云短信；也可接入遵循标准 JSON 合同的短信网关。</p>
                                    </div>
                                </div>
                                <div className="admin-access-form-grid">
                                    <Form.Item name="provider" label="服务商" rules={[{ required: true, message: "请选择短信服务商" }]}>
                                        <Select options={[{ label: "阿里云短信（推荐）", value: "aliyun" }, { label: "标准 HTTP JSON", value: "standard" }]} />
                                    </Form.Item>
                                    <Form.Item name="templateCode" label="验证码模板编码" extra="模板正文需包含变量 ${code}；阿里云填写 SMS_ 开头的模板编码。">
                                        <Input placeholder={draftProvider === "aliyun" ? "SMS_123456789" : "login-code"} />
                                    </Form.Item>
                                </div>
                            </div>

                            {draftProvider === "aliyun" ? (
                                <div className="admin-access-form-section">
                                    <div className="admin-access-form-section-heading">
                                        <span><ShieldCheck className="size-4" /></span>
                                        <div>
                                            <h3>阿里云短信凭据</h3>
                                            <p>AccessKey Secret 只加密保存在服务端；留空表示保留已保存的密钥。</p>
                                        </div>
                                    </div>
                                    <div className="admin-access-form-grid">
                                        <Form.Item name="accessKeyId" label="AccessKey ID"><Input autoComplete="off" placeholder="LTAI..." /></Form.Item>
                                        <Form.Item name="accessKeySecret" label={setting.hasAccessKeySecret ? `AccessKey Secret（${configuredSecretText}）` : "AccessKey Secret"}><Input.Password autoComplete="new-password" placeholder={setting.hasAccessKeySecret ? "留空保留原密钥" : "阿里云 AccessKey Secret"} /></Form.Item>
                                        <Form.Item name="signName" label="短信签名"><Input placeholder="墨灵AI" /></Form.Item>
                                        <Form.Item name="endpoint" label="接口地址" extra="默认使用阿里云 dysmsapi.aliyuncs.com。"><Input inputMode="url" placeholder="https://dysmsapi.aliyuncs.com/" /></Form.Item>
                                    </div>
                                </div>
                            ) : (
                                <div className="admin-access-form-section">
                                    <div className="admin-access-form-section-heading">
                                        <span><KeyRound className="size-4" /></span>
                                        <div>
                                            <h3>标准 HTTP JSON 网关</h3>
                                            <p>服务端 POST JSON，并可通过 Authorization Bearer 传递 API Key。</p>
                                        </div>
                                    </div>
                                    <div className="admin-access-form-grid">
                                        <Form.Item name="endpoint" label="短信接口地址" className="admin-access-form-span-full"><Input inputMode="url" placeholder="https://sms.example.com/send" /></Form.Item>
                                        <Form.Item name="apiKey" label={setting.hasApiKey ? `API Key（${configuredSecretText}）` : "API Key"}><Input.Password autoComplete="new-password" placeholder={setting.hasApiKey ? "留空保留原 API Key" : "可选，作为 Bearer Token 发送"} /></Form.Item>
                                        <Form.Item name="signName" label="短信签名（可选）"><Input placeholder="墨灵AI" /></Form.Item>
                                    </div>
                                </div>
                            )}
                        </>
                    ) : null}
                </Form>
                <div className="admin-access-sms-contract">
                    <span>{formatSettingTime(setting.updatedAt, "当前使用部署环境默认值")}</span>
                    {setting.enabled && !setting.configured ? <span className="text-amber-600 dark:text-amber-300">短信开关已开启，但配置尚未完整，注册暂不可用。</span> : null}
                </div>
            </SettingsSectionCard>
        </div>
    );
}

function toSMSFormValues(setting: SMSSetting): SMSFormValues {
    return { enabled: setting.enabled, provider: setting.provider, accessKeyId: setting.accessKeyId, accessKeySecret: "", signName: setting.signName, templateCode: setting.templateCode, endpoint: setting.endpoint, apiKey: "" };
}

function normalizeSMSFormValues(values: SMSFormValues): SMSFormValues {
    return { enabled: Boolean(values.enabled), provider: values.provider || "aliyun", accessKeyId: values.accessKeyId?.trim() || "", accessKeySecret: values.accessKeySecret?.trim() || "", signName: values.signName?.trim() || "", templateCode: values.templateCode?.trim() || "", endpoint: values.endpoint?.trim() || "", apiKey: values.apiKey?.trim() || "" };
}

function hasSMSChanges(values: SMSFormValues, setting: SMSSetting | null) {
    if (!setting) return false;
    const draft = normalizeSMSFormValues(values);
    const saved = normalizeSMSFormValues(toSMSFormValues(setting));
    if (draft.accessKeySecret || draft.apiKey) return true;
    return (["enabled", "provider", "accessKeyId", "signName", "templateCode", "endpoint"] as const).some((key) => draft[key] !== saved[key]);
}

function validateSMSDraft(values: SMSFormValues, setting: SMSSetting) {
    if (!values.enabled) return "";
    if (values.provider === "aliyun") {
        if (!values.accessKeyId || (!values.accessKeySecret && !setting.hasAccessKeySecret) || !values.signName || !values.templateCode) return "启用阿里云短信前请完整填写 AccessKey、短信签名、模板编码和密钥";
        if (!isAliyunURL(values.endpoint || "https://dysmsapi.aliyuncs.com/")) return "阿里云短信地址必须使用 dysmsapi.aliyuncs.com 或 dysmsapi-vpc.aliyuncs.com 的 HTTPS 地址";
    } else {
        if (!values.endpoint || !values.templateCode) return "启用标准短信前请完整填写 HTTPS 接口地址和模板编码";
        if (!isSMSURL(values.endpoint)) return "标准短信接口必须使用 HTTPS；本地回环地址可使用 HTTP";
    }
    return "";
}

function smsResponseMatches(setting: SMSSetting, expected: SMSFormValues) {
    const actual = normalizeSMSFormValues(toSMSFormValues(setting));
    if (expected.accessKeySecret && !setting.hasAccessKeySecret) return false;
    if (expected.apiKey && !setting.hasApiKey) return false;
    return (["enabled", "provider", "accessKeyId", "signName", "templateCode", "endpoint"] as const).every((key) => actual[key] === expected[key] || (key === "endpoint" && expected.provider === "aliyun" && actual[key] === "https://dysmsapi.aliyuncs.com/" && expected[key] === ""));
}

function isAliyunURL(value: string) {
    try {
        const parsed = new URL(value);
        return parsed.protocol === "https:" && ["dysmsapi.aliyuncs.com", "dysmsapi-vpc.aliyuncs.com"].includes(parsed.hostname);
    } catch {
        return false;
    }
}

function isSMSURL(value: string) {
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
