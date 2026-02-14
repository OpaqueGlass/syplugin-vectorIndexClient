import { debugPush, errorPush, logPush, warnPush } from "@/logger";
import { getGSettings, getReadOnlyGSettings, registerSettingUpdateCallback } from "@/manager/settingManager";
import * as Comlink from "comlink";
import type { IVectorIndexer } from "@/indexer/worker";
import { showPluginMessage } from "./pluginCommon";

let rawWorker: Worker | null = null;
let indexerInstance: any | null = null;
let isInitializing = false;

// 关键状态机：'idle' (初始), 'success' (曾成功过), 'failed' (上次失败)
let lastStatus: 'idle' | 'success' | 'failed' = 'idle';

export async function useWorker(timeoutMs = 15000): Promise<IVectorIndexer> {
    if (indexerInstance) return indexerInstance;

    // 防止并发初始化冲突
    if (isInitializing) {
        throw new Error("Worker is busy initializing...");
    }

    isInitializing = true;

    try {
        if (!rawWorker) {
            rawWorker = new Worker(new URL("@/indexer/worker.ts", import.meta.url), {
                type: 'module'
            });
        }

        const VectorIndexerProxy = Comlink.wrap<any>(rawWorker);

        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error("TIMEOUT")), timeoutMs)
        );

        const newInstance = await Promise.race([
            new VectorIndexerProxy(),
            timeoutPromise
        ]);

        indexerInstance = newInstance;
        lastStatus = 'success'; 
        return indexerInstance;

    } catch (error: any) {
        const isTimeout = error.message === "TIMEOUT";
        
        if (isTimeout && (lastStatus === 'idle' || lastStatus === 'success')) {
            showPluginMessage("工作线程超时，如要使用RAG功能，请尝试重启客户端");
        }

        lastStatus = 'failed';
        
        rawWorker?.terminate();
        rawWorker = null;
        
        throw error;
    } finally {
        isInitializing = false;
    }
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

export async function testConnection(serviceId: string) {
    let worker = await useWorker();

}

export function setIndexProvider(ip) {
}