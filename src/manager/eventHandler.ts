import { getPluginInstance } from "@/utils/pluginHelper";
import Mutex from "@/utils/mutex";
import { getReadOnlyGSettings } from "@/manager/settingManager";
import { IEventBusMap } from "siyuan";
import { errorPush, logPush } from "@/logger";
import { useWorker } from "@/utils/indexerHelper";
import { showPluginMessage } from "@/utils/pluginCommon";
import { lang } from "@/utils/lang";
import { getDocDBitem } from "@/syapi/custom";
import { JSONStorage } from "@/utils/jsonStorageUtil";
import { DocFilter } from "@/utils/filterBlocksUtils";
export default class EventHandler {
    private handlerBindList: Record<string, (arg1: CustomEvent)=>void> = {
        "loaded-protyle-static": this.loadedProtyleRetryEntry.bind(this), // mutex需要访问EventHandler的属性
        "switch-protyle": this.loadedProtyleRetryEntry.bind(this),
        "ws-main": this.wsMainEntry.bind(this),
        "open-menu-doctree": this.openMenuDocTreeHandler.bind(this),
    };
    // 关联的设置项，如果设置项对应为true，则才执行绑定
    private relateGsettingKeyStr: Record<string, string> = {
        "loaded-protyle-static": null, // mutex需要访问EventHandler的属性
        "switch-protyle": null,
        "ws-main": null,
    };

    private loadAndSwitchMutex: Mutex;
    private simpleMutex: number = 0;
    private docIdMutex: Record<string, number> = {};

    private userManualIndexJsonStorage: JSONStorage<{[key: string]: boolean}> = new JSONStorage("userManualIndex.json", {});
    constructor() {
        this.loadAndSwitchMutex = new Mutex();
    }

    private docFilter = null;

    bindHandler() {
        const plugin = getPluginInstance();
        const g_setting = getReadOnlyGSettings();
        // const g_setting = getReadOnlyGSettings();
        for (let key in this.handlerBindList) {
            if (this.relateGsettingKeyStr[key] == null || g_setting[this.relateGsettingKeyStr[key]]) {
                plugin.eventBus.on(key, this.handlerBindList[key]);
            }
        }
    }

    unbindHandler() {
        const plugin = getPluginInstance();
        for (let key in this.handlerBindList) {
            plugin.eventBus.off(key, this.handlerBindList[key]);
        }
    }

    async loadedProtyleRetryEntry(event: CustomEvent<IEventBusMap["loaded-protyle-static"]>) {
        // do sth
    }

    async wsMainEntry(event: CustomEvent<IEventBusMap["ws-main"]>) {
        const cmdType = ["savedoc"];//"removeDoc", 
        if (cmdType.includes(event.detail.cmd)) {
            logPush("ws-main event received: " + event.detail.cmd, event.detail);
            if (this.docFilter == null) {
                this.docFilter = new DocFilter(getReadOnlyGSettings());
            }
            // TODO: 
            const docId = event.detail.data.rootID;
            if (await this.userManualIndexJsonStorage.get(docId) == true
                || await this.docFilter.filterDoc(docId)) {
                const worker = await useWorker();
                worker.pushToQueueAndStart(docId, 30 * 60 * 1000);
            }
        }
    }

    async openMenuDocTreeHandler(event: CustomEvent<IEventBusMap["open-menu-doctree"]>) {
        logPush("data", event.detail);
        if (event.detail.type !== "notebook") {
            if (event.detail.menu.menus && event.detail.menu.menus.length >= 1) {
                event.detail.menu.addSeparator();
            }
            event.detail.menu.addItem({
                "label": "[vic] " + lang("menu_indexSelectDoc"),
                "click": async (element, mouseEvent)=>{
                    const idList:string[] = [].map.call(event.detail.elements, (item)=>item.getAttribute("data-node-id"));
                    const worker = await useWorker();
                    logPush("myworker", worker);
                    worker.pushToQueueAndStart(idList).catch(errorPush);
                    idList.forEach(item => {
                        this.userManualIndexJsonStorage.set(item, true);
                    });
                    showPluginMessage(lang("msg_pushToQueue"));
                }
            });
            event.detail.menu.addItem({
                "label": "[vic] " + lang("menu_indexSelectDocWithSub"),
                "click": async (element, mouseEvent)=>{
                    let parentIdList = [].map.call(event.detail.elements, (item)=>item.getAttribute("data-node-id"));
                    const resultIds = [];
                    resultIds.push(...parentIdList);
                    const worker = await useWorker();
                    for (let id of parentIdList) {
                        worker.addWithSubDocs(id).catch(errorPush);
                    }
                    resultIds.forEach(item=>{
                        this.userManualIndexJsonStorage.set(item, true);
                    });
                    showPluginMessage(lang("msg_pushToQueue"));
                }
            });
        }
    }

}