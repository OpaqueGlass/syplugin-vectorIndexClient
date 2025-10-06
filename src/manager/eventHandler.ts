import { getPluginInstance } from "@/utils/pluginHelper";
import Mutex from "@/utils/mutex";
import { getReadOnlyGSettings } from "@/manager/settingManager";
import { IEventBusMap } from "siyuan";
import { logPush } from "@/logger";
import { useQueue, useWorker } from "@/utils/indexerHelper";
export default class EventHandler {
    private handlerBindList: Record<string, (arg1: CustomEvent)=>void> = {
        "loaded-protyle-static": this.loadedProtyleRetryEntry.bind(this), // mutex需要访问EventHandler的属性
        "switch-protyle": this.loadedProtyleRetryEntry.bind(this),
        "ws-main": this.wsMainEntry.bind(this),
        "open-menu-doctree": this.openMenuDocTreeHandler.bind(this)
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
    constructor() {
        this.loadAndSwitchMutex = new Mutex();
    }

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
        const cmdType = ["moveDoc", "rename", "removeDoc", "savedoc"];
        if (cmdType.includes(event.detail.cmd)) {
            logPush("ws-main event received: " + event.detail.cmd, event.detail);
        }
    }

    async openMenuDocTreeHandler(event: CustomEvent<IEventBusMap["open-menu-doctree"]>) {
        logPush("data", event.detail);
        const worker = useWorker();
        if (event.detail.type !== "notebook") {
            if (event.detail.menu.menus && event.detail.menu.menus.length >= 1) {
                event.detail.menu.addSeparator();
            }
            event.detail.menu.addItem({
                "label": "对所选文档进行索引",
                "click": (element, mouseEvent)=>{
                    const idList = [].map.call(event.detail.elements, (item)=>item.getAttribute("data-node-id"));
                    for (let id of idList) {
                        worker.postMessage({ type: "onlyDoc", payload: { docId: id } });
                    }
                }
            });
            event.detail.menu.addItem({
                "label": "对所选文档及其下层文档进行索引",
                "click": (element, mouseEvent)=>{
                    let parentIdList = [].map.call(event.detail.elements, (item)=>item.getAttribute("data-node-id"));
                    const resultIds = [];
                    resultIds.push(...parentIdList);
                    for (let id of parentIdList) {
                        worker.postMessage({ type: "withSubDocs", payload: { docId: id } });
                    }
                }
            });
            // event.detail.menu.addItem({
            //     "lable": "移除索引",
            //     "click": (e)=>{

            //     }
            // })
        }
    }

}