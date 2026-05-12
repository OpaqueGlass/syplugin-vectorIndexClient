import { indexAll, useWorker } from "@/utils/indexerHelper";
import { showPluginMessage } from "@/utils/pluginCommon"
import { showValidationResultDialog } from "@/utils/wrappedDialog";
import { getReadOnlyGSettings } from "./settingManager";
import { debugPush, errorPush } from "@/logger";
import { confirm } from "siyuan";
import { lang } from "@/utils/lang";

const settingFunctions = {
    "fullyIndex": actionIndexAll,
    "chatModel.test": actionTestAiClient.bind(this, "chat"),
    "embeddingModel.test": actionTestAiClient.bind(this, "embedding"),
    "rerankModel.test": actionTestAiClient.bind(this, "rerank"),
    "chroma.resetCollection": actionResetCollection.bind(this, "chroma"),
    "stopCycle": actionStopCycle,
    "cleanQueue": actionResetQueue,
}

export function handleSettionBtnAction(settingStr: string) {
    debugPush("设置项按键回调", settingStr);
    if (settingFunctions[settingStr]) {
        settingFunctions[settingStr]()
    } else {
        showPluginMessage("开发者未注册此按钮，功能不可用，请向开发者反馈此问题");
    }
}

function actionIndexAll() {
    indexAll();
    showPluginMessage("已创建后台任务");
}

async function actionTestAiClient(clientType: "embedding"|"rerank"|"chat") {
    showPluginMessage("正在测试连接。" + clientType);
    const worker = await useWorker();
    const g_setting = getReadOnlyGSettings();
    worker.checkModelHealth(clientType, g_setting[clientType + "Model"]).then(result=>{
        showValidationResultDialog(result);
    });
}

export function actionResetCollection(type: string) {
    confirm(lang("confirm_reset_collection_title"), lang("confirm_reset_collection_desp"), ()=>{
        useWorker().then(async (worker)=>{
            try {
                await worker.clearAll(type);
                showPluginMessage(lang("msg_reset_collection_success"));
            } catch (err) {
                errorPush("重置数据库时出错", err);
                showPluginMessage(lang("msg_reset_collection_error"), undefined, "error");
            }
        });
    });
}

export function actionStopCycle() {
    useWorker().then(async (worker)=>{
        try {
            await worker.stop();
            showPluginMessage(lang("msg_stop_cycle_success"));
        } catch (err) {
            errorPush("停止循环时出错", err);
            showPluginMessage(lang("msg_stop_cycle_error"), undefined, "error");
        }
    })
}

export function actionResetQueue() {
    useWorker().then(async (worker)=>{
        try {
            await worker.clearQueue();
            showPluginMessage(lang("msg_reset_queue_success"));
        } catch (err) {
            errorPush("清空任务队列时出错", err);
            showPluginMessage(lang("msg_reset_queue_error"), undefined, "error");
        }
    });
}