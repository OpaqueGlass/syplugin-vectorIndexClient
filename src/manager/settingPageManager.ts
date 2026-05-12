import { showPluginMessage } from "@/utils/pluginCommon";
import { TabProperty, ConfigProperty, loadAllConfigPropertyFromTabProperty } from "../utils/settings";
import { indexAll, useWorker } from "@/utils/indexerHelper";
import { showValidationResultDialog } from "@/utils/wrappedDialog";
import { createApp } from "vue";
import { generateUUID } from "@/utils/common";
import StatusPage from "@/components/page/statusPage.vue";
import { isMobile } from "@/syapi/ui";
import { Dialog } from "siyuan";
import { lang } from "@/utils/lang";

let tabProperties: Array<TabProperty> = [
    
];
/**
 * 设置项初始化
 * 应该在语言文件载入完成后调用执行
 */
export function initSettingProperty() {
    tabProperties.push(
        new TabProperty({
            key: "status", iconKey: "iconInfo", props: [
                new ConfigProperty({ key: "statusPage", type: "CUSTOM", component: StatusPage })
            ]
        }),
        new TabProperty({
            key: "general", iconKey: "iconSettings", props: [
                new ConfigProperty({ key: "autoUpdate", type: "SWITCH" }),
                new ConfigProperty({ key: "fullyIndex", type: "BUTTON", btndo: ()=>{
                    indexAll();
                    showPluginMessage("已创建后台任务")} 
                }),
                new ConfigProperty({ key: "ignoreDocListStr", type: "TEXTAREA" }),
                new ConfigProperty({ key: "autoUpdateNotebooksListStr", type: "TEXTAREA" }),
                new ConfigProperty({ key: "stopCycle", type: "BUTTON" }),
                new ConfigProperty({ key: "cleanQueue", type: "BUTTON" }),
            ]
        }),
        new TabProperty({
            key: "lightRAG", iconKey: "iconTheme", props: [
                new ConfigProperty({ key: "aboutLightRAG", type: "TIPS" }),
                new ConfigProperty({ key: "lightRAG.enabled", type: "SWITCH" }),
                new ConfigProperty({ key: "lightRAG.baseUrl", type: "TEXT" }),
                new ConfigProperty({ key: "lightRAG.apiKey", type: "TEXT" }),
                new ConfigProperty({ key: "lightRAG.topK", type: "NUMBER" }),
                new ConfigProperty({ key: "lightRAG.test", type: "BUTTON", btndo: async()=>{
                    showPluginMessage("正在测试连接。");
                    const worker = await useWorker();
                    worker.checkConfig("lightRAG").then(result=>{
                        showValidationResultDialog(result);
                    });
                }}),
            ]
        }),
        new TabProperty({
            key: "chroma", iconKey: "iconTheme", props: [
                new ConfigProperty({ key: "aboutChroma", type: "TIPS" }),
                new ConfigProperty({ key: "chroma.enabled", type: "SWITCH" }),
                new ConfigProperty({ key: "chroma.baseUrl", type: "TEXT" }),
                new ConfigProperty({ key: "chroma.headerJson", type: "TEXTAREA" }),
                new ConfigProperty({ key: "chroma.test", type: "BUTTON", btndo: async()=>{
                    showPluginMessage("正在测试连接。");
                    const worker = await useWorker();
                    worker.checkConfig("chroma").then(result=>{
                        showValidationResultDialog(result);
                    });
                }}),
                new ConfigProperty({ key: "chroma.useQuestionAbstract", type: "SWITCH" }),
                new ConfigProperty({ key: "chroma.useRerankModel", type: "SWITCH" }),
                new ConfigProperty({ key: "chroma.resetCollection", type: "BUTTON"}),
            ]
        }),
        new TabProperty({
            key: "model", iconKey: "iconSparkles", props: {
                "chatModel": [
                    new ConfigProperty({ key: "chatModel.modelType", type: "SELECT", options: ["oai"] }),
                    new ConfigProperty({ key: "chatModel.baseUrl", type: "TEXT" }),
                    new ConfigProperty({ key: "chatModel.apiKey", type: "TEXT" }),
                    new ConfigProperty({ key: "chatModel.modelName", type: "TEXT" }),
                    new ConfigProperty({ key: "chatModel.test", type: "BUTTON"}),
                ],
                "embeddingModel": [
                    new ConfigProperty({ key: "embeddingModel.modelType", type: "SELECT", options: ["oai"] }),
                    new ConfigProperty({ key: "embeddingModel.baseUrl", type: "TEXT" }),
                    new ConfigProperty({ key: "embeddingModel.apiKey", type: "TEXT" }),
                    new ConfigProperty({ key: "embeddingModel.modelName", type: "TEXT" }),
                    new ConfigProperty({ key: "embeddingModel.dimensions", type: "NUMBER" }),
                    new ConfigProperty({ key: "embeddingModel.maxInputsCount", type: "NUMBER" }),
                    new ConfigProperty({ key: "embeddingModel.maxTotalCharacters", type: "NUMBER" }),
                    new ConfigProperty({ key: "embeddingModel.maxSingleCharacters", type: "NUMBER" }),
                    new ConfigProperty({ key: "embeddingModel.test", type: "BUTTON"}),
                ],
                "rerankModel": [
                    new ConfigProperty({ key: "rerankModel.modelType", type: "SELECT", options: ["cohere", "qwen"] }),
                    new ConfigProperty({ key: "rerankModel.baseUrl", type: "TEXT" }),
                    new ConfigProperty({ key: "rerankModel.apiKey", type: "TEXT" }),
                    new ConfigProperty({ key: "rerankModel.modelName", type: "TEXT" }),
                    new ConfigProperty({ key: "rerankModel.test", type: "BUTTON"}),
                    // new ConfigProperty({ key: "rerankModel.maxInputsCount", type: "NUMBER" }),
                    // new ConfigProperty({ key: "rerankModel.maxTotalCharacters", type: "NUMBER" }),
                    // new ConfigProperty({ key: "rerankModel.maxSingleCharacters", type: "NUMBER" }),
                ],
            },
        }),
        new TabProperty({
            key: "about", iconKey: "iconInfo", props: [
                new ConfigProperty({ key: "aboutTip", type: "TIPS" }),
                new ConfigProperty({ key: "debugFlag", type: "SWITCH" }),
                // new ConfigProperty({ key: "statusPage", type: "BUTTON", btndo: async()=>{
                //     // 生成Dialog内容
                //     const uid = generateUUID();
                //     // 创建dialog
                //     const app = createApp(StatusPage);
                //     const settingDialog = new Dialog({
                //         "title": lang("setting_panel_title"),
                //         "content": `
                //         <div id="og_plugintemplate_${uid}" style="overflow: hidden; position: relative;height: 100%;"></div>
                //         `,
                //         "width": isMobile() ? "92vw":"1040px",
                //         "height": isMobile() ? "50vw":"80vh",
                //         "destroyCallback": ()=>{app.unmount(); },
                //     });
                //     app.mount(settingDialog.element.querySelector(`#og_plugintemplate_${uid}`) as HTMLElement);
                //     // app.mount(`#og_plugintemplate_${uid}`);
                // }}),
            ]
        }),
    );
}

export function getTabProperties() {
    return tabProperties;
}

// 简易路径解析：通过 "a.b.c" 字符串读写对象属性
export function getValueByPath(obj: any, path: string) {
    return path.split('.').reduce((acc, part) => acc && acc[part], obj);
};

export function setValueByPath(obj: any, path: string, value: any) {
    const parts = path.split('.');
    const last = parts.pop();
    const target = parts.reduce((acc, part) => {
        if (!acc[part]) acc[part] = {};
        return acc[part];
    }, obj);
    if (target && last) target[last] = value;
};