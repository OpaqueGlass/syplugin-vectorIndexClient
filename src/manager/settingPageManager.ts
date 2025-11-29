import { showPluginMessage } from "@/utils/common";
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
                new ConfigProperty({ key: "baseURL", type: "TEXT" }),
                new ConfigProperty({ key: "apiKey", type: "TEXT" }),
            ]
        }),
        new TabProperty({
            key: "advanced", iconKey: "iconSettings", props: [
                new ConfigProperty({ key: "autoUpdate", type: "SWITCH" }),
                new ConfigProperty({ key: "fullyIndex", type: "BUTTON", btndo: ()=>{
                    indexAll();
                    showPluginMessage("已创建后台任务")} 
                }),
                new ConfigProperty({ key: "ignoreDocListStr", type: "TEXTAREA" }),
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