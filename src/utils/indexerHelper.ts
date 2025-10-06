import { CacheQueue } from "@/indexer";
import { IndexProvider } from "@/indexer/baseIndexProvider";
import { IndexConsumer } from "@/indexer/indexConsumer";
import { MyIndexProvider } from "@/indexer/myProvider";
import BackWorker from '@/indexer/worker?worker&url';
import { logPush } from "@/logger";
import { getReadOnlyGSettings } from "@/manager/settingManager";

let provider: IndexProvider;
console.log("workerURL", BackWorker);
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

export async function checkAndStart() {
    const g_setting = getReadOnlyGSettings();
    provider = new MyIndexProvider(g_setting["baseURL"], g_setting["apiKey"]);
    const result = await provider.health();
    if (result) {
        logPush("RAG Indexer确认可连接");
        worker.postMessage({type: "start", payload: {"backendBaseURL": g_setting["baseURL"], "apiKey": g_setting["apiKey"]}});
        worker.onmessage = function(e) {
            const { type, ...rest } = e.data;
            logPush("Worker message:", type, rest);
        }
        logPush("RAG Indexer后台worker已启动");
    }
}

export function setIndexProvider(ip) {
    provider = ip;
}