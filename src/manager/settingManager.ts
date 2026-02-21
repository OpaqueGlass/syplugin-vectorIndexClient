import { createApp, ref, toRaw, watch } from "vue";
import { getPluginInstance } from "@/utils/pluginHelper";
import { debugPush, logPush, warnPush } from "@/logger";
import { isMobile } from "@/syapi/ui";
import { isValidStr } from "@/utils/commonCheck";
import * as siyuan from "siyuan";
import outdatedSettingVue from "@/components/dialog/outdatedSetting.vue";
import { showPluginMessage } from "@/utils/pluginCommon";
import { lang } from "@/utils/lang";
import { setStyle } from "./setStyle";
import { CONSTANTS } from "@/constants";
import { getTabProperties } from "./settingPageManager";
import { loadAllConfigPropertyFromTabProperty } from "@/utils/settings";
import { generateUUID } from "@/utils/common";
import { restartWorker } from "@/utils/indexerHelper";

// const pluginInstance = getPluginInstance();

let setting: any = ref({});
interface IPluginSettings {
    
};
let defaultSetting: IPluginSettings = {
    baseURL: "http://localhost:16809",
    apiKey: "",
    autoUpdate: false,
    ignoreDocListStr: "20210808180117-czj9bvb\n",
    lightRAG: {
        enabled: false,
        baseURL: "http://localhost:9621",
        apiKey: "",
    },
    filterMinChar: 5,
}



let updateTimeout: any = null;

let updateCallbackList = [];

// 发生变动之后，由界面调用这里
export function saveSettings(newSettings: any) {
    // 如果有必要，需要判断当前设备，然后选择保存位置
    debugPush("界面调起保存设置项", newSettings);
    getPluginInstance().saveData("settings_main.json", JSON.stringify(newSettings, null, 4));
}

export function registerSettingUpdateCallback(callback: (newSettings:any)=>void) {
    updateCallbackList.push(callback);
}
export function unregisterSettingUpdateCallback(callback: (newSettings:any)=>void) {
    const index = updateCallbackList.indexOf(callback);
    if (index !== -1) {
        updateCallbackList.splice(index, 1);
    }
}

/**
 * 仅用于初始化时载入设置项
 * 请不要重复使用
 * @returns 
 */
export async function loadSettings() {
    let loadResult = null;
    // 这里从文件载入
    loadResult = await getPluginInstance().loadData("settings_main.json");
    debugPush("文件载入设置", loadResult);
    if (loadResult == undefined || loadResult == "") {
        let oldSettings = await transferOldSetting();
        debugPush("oldSettings", oldSettings);
        if (oldSettings != null) {
            debugPush("使用转换后的旧设置", oldSettings);
            loadResult = oldSettings;
        } else {
            loadResult = defaultSetting;
        }
    }
    const currentVersion = 20241219;
    if (!loadResult["@version"] || loadResult["@version"] < currentVersion) {
        // 旧版本
        loadResult["@version"] = currentVersion;
        if (siyuan.getAllEditor == null) {
            loadResult["immediatelyUpdate"] = false;
        }
        // 检查数组中指定设置和defaultSetting是否一致
        showOutdatedSettingWarnDialog(checkOutdatedSettings(loadResult), defaultSetting);
    }
    // showOutdatedSettingWarnDialog(checkOutdatedSettings(loadResult), defaultSetting);
    // 检查选项类设置项，如果发现不在列表中的，重置为默认
    try {
        loadResult = checkSettingType(loadResult);
    } catch(err) {
        logPush("设置项类型检查时发生错误", err);
    }
    
    // 如果有必要，判断设置项是否对当前设备生效
    // TODO: 对于Order，switch需要进行检查，防止版本问题导致选项不存在，不存在的用默认值
    // TODO: switch旧版需要迁移，另外引出迁移逻辑
    setting.value = Object.assign(defaultSetting, loadResult);
    logPush("载入设置项", setting.value);
    // return loadResult;
    watch(setting, (newVal) => {
        // 延迟更新
        if (updateTimeout) {
            clearTimeout(updateTimeout);
        }
        logPush("检查到变化");
        updateTimeout = setTimeout(() => {
            // updateSingleSetting(key, newVal);
            saveSettings(newVal);
            debugPush("保存设置项", newVal);
            setStyle();
            changeDebug(newVal);
            restartWorker(toRaw(newVal));
            for (let callback of updateCallbackList) {
                try {
                    callback(newVal);
                } catch(err) {
                    warnPush("设置项更新回调发生错误", err);
                }
            }
            updateTimeout = null;
        }, 1000);
    }, {deep: true, immediate: false});
}

function updateIgnoreDocList(newVal) {
    if (isValidStr(newVal["ignoreDocListStr"])) {
        let docList = newVal["ignoreDocListStr"].split("\n").map((item: string)=>item.trim()).filter((item: string)=>item!="");
        setting.value["ignoreDocList"] = docList;
    } else {
        setting.value["ignoreDocList"] = [];
    }
}

function checkOutdatedSettings(loadSetting) {
    const CHECK_SETTING_KEYS = [
    ];
    let result = [];
    for (let key of CHECK_SETTING_KEYS) {
        if (loadSetting[key] != defaultSetting[key]) {
            result.push(key);
        }
    }
    return result;
}

function showOutdatedSettingWarnDialog(outdatedSettingKeys, defaultSettings) {
    if (outdatedSettingKeys.length == 0) {
        return;
    }
    const app = createApp(outdatedSettingVue, {"outdatedKeys": outdatedSettingKeys, "defaultSettings": defaultSettings});
    const uid = generateUUID();
    const settingDialog = new siyuan.Dialog({
            "title": lang("dialog_panel_plugin_name") + lang("dialog_panel_outdate"),
            "content": `
            <div id="og_plugintemplate_${uid}" class="b3-dialog__content" style="overflow: hidden; position: relative;height: 100%;"></div>
            `,
            "width": isMobile() ? "42vw":"520px",
            "height": isMobile() ? "auto":"auto",
            "destroyCallback": ()=>{app.unmount();},
        });
    app.mount(`#og_plugintemplate_${uid}`);
    return;
}

function changeDebug(newVal) {
    if (newVal["debugMode"] === true) {
        debugPush("调试模式已开启");
        window.top["OpaqueGlassDebug"] = true;
        if (!window.top["OpaqueGlassDebugV2"]) {
            window.top["OpaqueGlassDebugV2"] = {};
        }
        window.top["OpaqueGlassDebugV2"][CONSTANTS.PLUGIN_SHORT_NAME] = 5;
    } else if (newVal["debugMode"] === true) {
        debugPush("调试模式已关闭");
        if (window.top["OpaqueGlassDebugV2"] && window.top["OpaqueGlassDebugV2"][CONSTANTS.PLUGIN_SHORT_NAME]) {
            delete window.top["OpaqueGlassDebugV2"][CONSTANTS.PLUGIN_SHORT_NAME];
        }
    }
}

function checkSettingType(input:any) {
    const propertyMap = loadAllConfigPropertyFromTabProperty(getTabProperties());
    // 这里可以检查
    return input;
}

/**
 * 迁移、转换、覆盖设置项
 * @returns 修改后的新设置项
 */
async function transferOldSetting() {
    const oldSettings = await getPluginInstance().loadData("settings.json");
    // 判断并迁移设置项
    let newSetting = Object.assign({}, oldSettings);
    if (oldSettings == null || oldSettings == "") {
        return null;
    }

    /* 这里是转换代码 */

    // 移除过时的设置项
    for (let key of Object.keys(newSetting)) {
        if (!(key in defaultSetting)) {
            delete newSetting[key];
        }
    }
    newSetting = Object.assign(defaultSetting, newSetting);
    
    return newSetting;
}

export function getGSettings() {
    // logPush("getConfig", setting.value, setting);
    // 改成 setting._rawValue不行
    return setting;
}

export function getReadOnlyGSettings() {
    return setting._rawValue;
}

export function getDefaultSettings() {
    return defaultSetting;
}

export function updateSingleSetting(key: string, value: any) {
    // 对照检查setting的类型
    // 直接绑定@change的话，value部分可能传回event
    // 如果700毫秒内没用重复调用，则执行保存
    
}

