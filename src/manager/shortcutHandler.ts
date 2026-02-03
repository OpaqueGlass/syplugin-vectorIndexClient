import { isMobile } from "@/syapi/ui";
import { lang } from "@/utils/lang";
import { showMessage, Plugin, Dialog } from "siyuan";
import { createApp } from "vue";
import SearchDialog from "@/components/dialog/searchDialog.vue";
import { debugPush } from "@/logger";
import { generateUUID } from "@/utils/common";
import { useSearchPanel } from "@/utils/pluginHelper";

export function bindCommand(pluginInstance: Plugin) {
    pluginInstance.addCommand({
        langKey: "open_rag_search",
        hotkey: "",
        callback: () => {
            showSwitchPanel();
        },
    });
    // 图标的制作参见帮助文档
    pluginInstance.addIcons(`<symbol id="iconOgHnBookUp" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 13V7"/><path d="M18 2h1a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20"/><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2"/><path d="m9 10 3-3 3 3"/><path d="m9 5 3-3 3 3"/>
        </symbol>
    `);
}


export async function showSwitchPanel() {
    let app = null;
    const uid = generateUUID();
    const switchPanelDialogRef = useSearchPanel();
    if (switchPanelDialogRef.value) {
        switchPanelDialogRef.value.destroy();
        switchPanelDialogRef.value = null;
        return;
    }
    // 获取文档id
    
    const switchPanelDialog = new Dialog({
        "title": lang("dialog_panel_plugin_name") + "--" + lang("dialog_panel_search"),
        "content": `
        <div id="og_plugintemplate_${uid}" class="b3-dialog__content" style="overflow: hidden; position: relative;height: 100%;"></div>
        `,
        "width": isMobile() ? "80vw":"55vw",
        "height": isMobile() ? "75vh":"80vh",
        "destroyCallback": ()=>{app.unmount(); switchPanelDialogRef.value = null; debugPush("对话框销毁成功")},
    });
    switchPanelDialogRef.value = switchPanelDialog;
    app = createApp(SearchDialog, {dialog: switchPanelDialog});
    app.mount(`#og_plugintemplate_${uid}`);
    return;
}