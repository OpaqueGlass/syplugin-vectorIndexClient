import { indexAll, useWorker } from "@/utils/indexerHelper";
import { showPluginMessage } from "@/utils/pluginCommon"
import { showValidationResultDialog } from "@/utils/wrappedDialog";
import { getReadOnlyGSettings } from "./settingManager";
import { debugPush } from "@/logger";


const settingFunctions = {
    fullyIndex: actionIndexAll,
    "chatModel.test": actionTestAiClient.bind(this, "chat"),
    "embeddingModel.test": actionTestAiClient.bind(this, "embedding"),
    "rerankModel.test": actionTestAiClient.bind(this, "rerank"),
}

export function handleSettionBtnAction(settingStr: string) {
    debugPush("设置项按键回调", settingStr);
    settingFunctions[settingStr]() ?? showPluginMessage("开发者未注册此按钮，功能不可用，请向开发者反馈此问题");
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