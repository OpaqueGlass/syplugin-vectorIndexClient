import { CacheQueue } from "@/indexer";
import { IndexProvider } from "@/indexer/baseIndexProvider";
import { IndexConsumer } from "@/indexer/indexConsumer";
import { MyIndexProvider } from "@/indexer/myProvider";
import BackWorker from '@/indexer/worker?worker&url';
import { logPush } from "@/logger";
import { getGSettings, getReadOnlyGSettings, registerSettingUpdateCallback } from "@/manager/settingManager";
import { watch } from "vue";

let provider: IndexProvider;
logPush("workerURL", BackWorker);
const worker = new Worker(BackWorker, { type: 'module' });
let indexConsumer = new IndexConsumer();

export function useProvider(): IndexProvider {
    return provider;
}

export function useConsumer(): IndexConsumer {
    return indexConsumer;
}

export function useWorker() {
    return worker;
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
    provider = new MyIndexProvider(g_setting["baseURL"], g_setting["apiKey"]);
    const result = await provider.health();
    worker.postMessage({type: "start", payload: {"backendBaseURL": g_setting["baseURL"], "apiKey": g_setting["apiKey"], "settings": g_setting}});
    worker.onmessage = function(e) {
        const { type, ...rest } = e.data;
        logPush("Worker message:", type, rest);
        if (type === "stopped-for-restart") {
            checkAndStart();
        }
    }
    logPush("RAG Indexer后台worker已启动");
    if (result) {
        logPush("RAG Indexer确认可连接");
    } else {
        logPush("RAG Indexer启动时检查连接失败，请检查设置项及后台服务状态");
    }
}

export async function restartWorker() {
    logPush("请求重启RAG Indexer后台worker");
    worker.postMessage({type: "stop", payload: {"returnType": "restart"}});
}

export async function indexAll() {
    let notebooks = window.siyuan.notebooks.filter(item => !item.closed).map(item => item.id);
    worker.postMessage({type: "indexAll", payload: {"notebookList": notebooks}});
}

export function setIndexProvider(ip) {
    provider = ip;
}