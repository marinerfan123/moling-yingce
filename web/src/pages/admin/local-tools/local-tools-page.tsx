import { LocalCliSettings } from "../../settings/local-cli-settings";
import { ComfyUIBridgeSettingsPane } from "../../settings/comfyui-bridge-settings-pane";
import { AdminPageFrame } from "../components/admin-shell";

export default function LocalToolsPage() {
    return (
        <AdminPageFrame title="本机工具" description="仅管理员可连接本机 Runtime、管理官方 Dreamina CLI 和 ComfyUI Bridge。" scroll>
            <div className="space-y-6">
                <LocalCliSettings />
                <ComfyUIBridgeSettingsPane />
            </div>
        </AdminPageFrame>
    );
}
