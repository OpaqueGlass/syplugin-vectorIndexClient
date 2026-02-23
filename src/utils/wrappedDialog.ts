import { HealthStatus } from "@/constants";
import { Dialog } from "siyuan";
import { lang } from "./lang";

/**
 * 显示配置验证结果的对话框
 */
export function showValidationResultDialog(result: HealthCheckResult) {
    const statusConfig = {
        [HealthStatus.HEALTHY]: {
            title: lang("dialog_panel_testconnection_success"),
            icon: "✅",
            color: "var(--b3-theme-success)",
        },
        [HealthStatus.API_KEY_ERROR]: {
            title: lang("dialog_panel_testconnection_keyerror"),
            icon: "🔑",
            color: "var(--b3-theme-error)",
        },
        [HealthStatus.UNREACHABLE]: {
            title: lang("dialog_panel_testconnection_unreachable"),
            icon: "🌐",
            color: "var(--b3-theme-warning)",
        },
        [HealthStatus.UNKNOWN_ERROR]: {
            title: lang("dialog_panel_testconnection_unknownerror"),
            icon: "❓",
            color: "var(--b3-theme-error)",
        }
    };

    const ui = statusConfig[result.connectivity];

    const contentHtml = `
        <div style="padding: 16px; display: flex; flex-direction: column; align-items: center; gap: 12px;">
            <div style="font-size: 48px;">${ui.icon}</div>
            <div style="font-size: 18px; font-weight: bold; color: ${ui.color};">${ui.title}</div>
            <div style="background: var(--b3-theme-surface); padding: 8px; border-radius: 4px; width: 100%; font-family: monospace; font-size: 12px; word-break: break-all;">
                ${result.message}
            </div>
            <button class="b3-button" style="margin-top: 8px; width: 100px;" id="ogcloseDialog">确定</button>
        </div>
    `;

    const dialog = new Dialog({
        title: lang("dialog_panel_testconnection"),
        content: contentHtml,
        width: "360px",
    });

    const btn = dialog.element.querySelector("#ogcloseDialog");
    btn?.addEventListener("click", () => {
        dialog.destroy();
    });
}