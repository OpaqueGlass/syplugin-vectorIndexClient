import { showPluginMessage } from "@/utils/pluginCommon";
import { TabProperty, ConfigProperty, loadAllConfigPropertyFromTabProperty } from "../utils/settings";
import { indexAll } from "@/utils/indexerHelper";

let tabProperties: Array<TabProperty> = [
    
];


/**
 * 设置项初始化
 * 应该在语言文件载入完成后调用执行
 */
export function initSettingProperty() {
    tabProperties.push(
        new TabProperty({
            key: "general", iconKey: "iconSettings", props: [
                new ConfigProperty({ key: "autoUpdate", type: "SWITCH" }),
                new ConfigProperty({ key: "fullyIndex", type: "BUTTON", btndo: ()=>{
                    indexAll();
                    showPluginMessage("已创建后台任务")} 
                }),
                new ConfigProperty({ key: "filterMinChar", type: "NUMBER" }),
                new ConfigProperty({ key: "ignoreDocListStr", type: "TEXTAREA" }),
            ]
        }),
        new TabProperty({
            key: "lightRAG", iconKey: "iconTheme", props: [
                new ConfigProperty({ key: "aboutLightRAG", type: "TIPS" }),
                new ConfigProperty({ key: "lightRAG.enabled", type: "SWITCH" }),
                new ConfigProperty({ key: "lightRAG.baseUrl", type: "TEXT" }),
                new ConfigProperty({ key: "lightRAG.apiKey", type: "TEXT" }),
                new ConfigProperty({ key: "lightRAG.topK", type: "NUMBER" }),
                new ConfigProperty({ key: "lightRAG.test", type: "BUTTON", btndo: ()=>{
                    
                }}),
            ]
        }),
        new TabProperty({
            key: "about", iconKey: "iconTheme", props: [
                new ConfigProperty({ key: "aboutTip", type: "TIPS" }),
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