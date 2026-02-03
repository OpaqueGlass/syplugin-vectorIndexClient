import { logPush } from "@/logger";
import { getGSettings, getReadOnlyGSettings, registerSettingUpdateCallback } from "@/manager/settingManager";
import { watch } from "vue";
import * as Comlink from "comlink";
import type { IVectorIndexer } from "@/indexer/worker";

const rawWorker = new Worker(new URL("@/indexer/worker.ts", import.meta.url));
const IndexerClass = Comlink.wrap<IVectorIndexer>(rawWorker);

// 1. 创建实例
let indexerInstance;

export function useWorker() {
    if (indexerInstance == null) {
        indexerInstance = new IndexerClass();
    }
    return indexerInstance;
}

let startOnceFlag = false;
export async function startOnce() {
    await checkAndStart();
    if (startOnceFlag) {
        return;
    }
    startOnceFlag = true;
    registerSettingUpdateCallback(async (newSettings) => {
        logPush("设置项变动，通知Worker重启");
        await restartWorker();
    });
}
export async function checkAndStart() {
    const g_setting = getReadOnlyGSettings();
}

export async function restartWorker() {
    logPush("请求重启RAG Indexer后台worker");
    await IndexerClass.restart();
}

export async function indexAll() {
    let notebooks = window.siyuan.notebooks.filter(item => !item.closed).map(item => item.id);
    await IndexerClass.indexAll(notebooks);
}

export function setIndexProvider(ip) {
}