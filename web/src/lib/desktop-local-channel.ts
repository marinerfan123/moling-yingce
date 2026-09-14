import { useUserStore } from "@/stores/use-user-store";
import { canUseDesktopLocalTools } from "@/lib/desktop-local-tools";

export const DESKTOP_LOCAL_CHANNEL_EXAMPLE_BASE_URL = "http://127.0.0.1:8000";

// 页面 host 只控制 UI 可见性；真正授权始终由后端 deployment capability 决定。
export type DesktopLocalToolsRole = "admin" | "user" | undefined;

export function desktopLocalChannelUiVisible(desktopLocalChannelsEnabled: boolean, hostname: string, role: DesktopLocalToolsRole = "admin") {
    if (!desktopLocalChannelsEnabled || role !== "admin") return false;
    const normalized = hostname.trim().toLowerCase();
    return normalized === "localhost" || normalized === "127.0.0.1";
}

export function desktopLocalChannelPayloadValue(desktopLocalChannelsEnabled: boolean, hostname: string, requested: boolean | undefined, role: DesktopLocalToolsRole = "admin") {
    return desktopLocalChannelUiVisible(desktopLocalChannelsEnabled, hostname, role) && requested === true;
}

export function desktopLocalChannelFormState(desktopLocalChannelsEnabled: boolean, hostname: string, stored: boolean | undefined, role: DesktopLocalToolsRole = "admin") {
    const visible = desktopLocalChannelUiVisible(desktopLocalChannelsEnabled, hostname, role);
    return { visible, checked: visible && stored === true };
}

export function projectDesktopLocalChannelRuntime<T extends { allowLocalChannel?: boolean }>(config: T): T {
    const userState = useUserStore.getState();
    const desktopLocalChannelsEnabled = canUseDesktopLocalTools(userState.user, userState.features.desktopLocalChannelsEnabled);
    const hostname = typeof window === "undefined" ? "" : window.location?.hostname || "";
    const allowLocalChannel = desktopLocalChannelPayloadValue(desktopLocalChannelsEnabled, hostname, config.allowLocalChannel, "admin");
    return config.allowLocalChannel === allowLocalChannel ? config : { ...config, allowLocalChannel };
}
