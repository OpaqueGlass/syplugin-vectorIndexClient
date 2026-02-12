import { debugPush, errorPush, logPush, warnPush } from "@/logger";
import { getGSettings, getReadOnlyGSettings, registerSettingUpdateCallback } from "@/manager/settingManager";
import * as Comlink from "comlink";
import type { IVectorIndexer } from "@/indexer/worker";

let rawWorker: Worker | null = null;
let indexerInstance: Comlink.Remote<IVectorIndexer> | null = null;

export async function useWorker(): Promise<Comlink.Remote<IVectorIndexer>> {
    if (!rawWorker) {
        rawWorker = new Worker(new URL("@/indexer/worker.ts", import.meta.url), {
            type: 'module' // 确保支持 ESM 模块
        });
    }

    if (indexerInstance === null) {
        const VectorIndexer = Comlink.wrap<any>(rawWorker);
        try {
            indexerInstance = await new VectorIndexer(); 
            logPush("Worker 实例初始化成功");
        } catch (e) {
            errorPush("Worker 握手失败:", e);
            throw e;
        }
    }

    return indexerInstance;
}

let startOnceFlag = false;
export async function startWorkerOnce() {
    if (startOnceFlag) {
        return;
    }
    await checkAndStart();
    startOnceFlag = true;
    registerSettingUpdateCallback(async (newSettings) => {
        logPush("设置项变动，通知Worker重启");
        await restartWorker();
    });
}
export async function checkAndStart() {
    debugPush("检查并启动RAG Indexer后台worker");
    const g_setting = getReadOnlyGSettings();
    let worker = await useWorker();
    await worker.start(g_setting);
}

export async function restartWorker(g_settings?: any) {
    logPush("请求重启RAG Indexer后台worker");
    let worker = await useWorker();
    await worker.restart(g_settings);
}

export async function indexAll() {
    let worker = await useWorker();
    let notebooks = window.siyuan.notebooks.filter(item => !item.closed).map(item => item.id);
    await worker.indexAll(notebooks);
}

export function setIndexProvider(ip) {
}