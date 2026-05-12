import { indexAll, useWorker } from "@/utils/indexerHelper";
import { showPluginMessage } from "@/utils/pluginCommon"
import { showValidationResultDialog } from "@/utils/wrappedDialog";
import { getReadOnlyGSettings } from "./settingManager";
import { debugPush, errorPush } from "@/logger";
import { confirm } from "siyuan";

const settingFunctions = {
    "fullyIndex": actionIndexAll,
    "chatModel.test": actionTestAiClient.bind(this, "chat"),
    "embeddingModel.test": actionTestAiClient.bind(this, "embedding"),
    "rerankModel.test": actionTestAiClient.bind(this, "rerank"),
    "chroma.resetCollection": actionResetCollection.bind(this, "chroma"),
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
    confirm("确认重置索引数据库", "你确定重置索引数据库吗？重置后需要重新执行索引，这非常耗时；除非正在切换嵌入模型，否则无需此操作。此操作不可逆、不可回退。", ()=>{
        useWorker().then(async (worker)=>{
            try {
                await worker.clearAll(type);
                showPluginMessage("重置成功");
            } catch (err) {
                errorPush("重置数据库时出错", err);
                showPluginMessage("重置失败", undefined, "error");
            }
        });
    });
}