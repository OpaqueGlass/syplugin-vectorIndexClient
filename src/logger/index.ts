import { CONSTANTS } from "@/constants";

// debug push
let g_DEBUG = 2;
const THRESHOLD = 2;
const g_NAME = CONSTANTS.PLUGIN_SHORT_NAME;
const g_FULLNAME = CONSTANTS.PLUGIN_FULL_NAME;

export function setDebugLevel(level: number) {
    g_DEBUG = level;
}
/*
LEVEL 0 忽略所有
LEVEL 1 仅Error
LEVEL 2 Err + Warn
LEVEL 3 Err + Warn + Info
LEVEL 4 Err + Warn + Info + Log
LEVEL 5 Err + Warn + Info + Log + Debug
请注意，基于代码片段加入window下的debug设置，可能在刚载入挂件时无效
*/
export function commonPushCheck() {
    const isWorker = typeof self !== "undefined" && typeof window === "undefined";
    if (isWorker) {
        return g_DEBUG;
    }
    if (window.top["OpaqueGlassDebugV2"] !== undefined && window.top["OpaqueGlassDebugV2"][g_NAME] === undefined && window.top["OpaqueGlassDebugV2"]["*"]) {
        g_DEBUG = window.top["OpaqueGlassDebugV2"]["*"];
        return window.top["OpaqueGlassDebugV2"]["*"];
    }
    if (window.top["OpaqueGlassDebugV2"] == undefined || window.top["OpaqueGlassDebugV2"][g_NAME] == undefined) {
        return g_DEBUG;
    }
    g_DEBUG = window.top["OpaqueGlassDebugV2"][g_NAME];
    return window.top["OpaqueGlassDebugV2"][g_NAME];
}

export function isDebugMode() {
    return commonPushCheck() > THRESHOLD;
}

export function debugPush(str: string, ...args: any[]) {
    if (commonPushCheck() >= 5) {
        console.debug(`${g_FULLNAME}[D] ${new Date().toLocaleTimeString()} ${str}`, ...args);
    }
}

export function infoPush(str: string, ...args: any[]) {
    if (commonPushCheck() >= 3) {
        console.info(`${g_FULLNAME}[I] ${new Date().toLocaleTimeString()} ${str}`, ...args);
    }
}

export function logPush(str: string, ...args: any[]) {
    if (commonPushCheck() >= 4) {
        console.log(`${g_FULLNAME}[L] ${new Date().toLocaleTimeString()} ${str}`, ...args);
    }
}

export function errorPush(str: string, ... args: any[]) {
    if (commonPushCheck() >= 1) {
        console.error(`${g_FULLNAME}[E] ${new Date().toLocaleTimeString()} ${str}`, ...args);
    }
}

export function warnPush(str: string, ... args: any[]) {
    if (commonPushCheck() >= 2) {
        console.warn(`${g_FULLNAME}[W] ${new Date().toLocaleTimeString()} ${str}`, ...args);
    }
}