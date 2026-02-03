/**
 * ui.ts
 * 涉及window交互的API
 */

import { debugPush, errorPush, warnPush } from "@/logger";
import { DOC_SORT_TYPES } from ".";

/**
 * 获取当前文档id（伪api）
 * 优先使用jquery查询
 * @param {boolean} mustSure 是否必须确认，若为true，找到多个打开中的文档时返回null
 */
export function getCurrentDocIdF(mustSure: boolean = false) {
    let thisDocId:string = null;
    // 桌面端
    thisDocId = window.top.document.querySelector(".layout__wnd--active .protyle.fn__flex-1:not(.fn__none) .protyle-background")?.getAttribute("data-node-id");
    debugPush("尝试获取当前具有焦点的id", thisDocId);
    let temp:string = null;
    // 移动端
    if (!thisDocId && isMobile()) {
        // UNSTABLE: 面包屑样式变动将导致此方案错误！
        try {
            temp = window.top.document.querySelector(".protyle-breadcrumb .protyle-breadcrumb__item .popover__block[data-id]")?.getAttribute("data-id");
            let iconArray = window.top.document.querySelectorAll(".protyle-breadcrumb .protyle-breadcrumb__item .popover__block[data-id]");
            for (let i = 0; i < iconArray.length; i++) {
                let iconOne = iconArray[i];
                if (iconOne.children.length > 0 
                    && iconOne.children[0].getAttribute("xlink:href") == "#iconFile"){
                    temp = iconOne.getAttribute("data-id");
                    break;
                }
            }
            thisDocId = temp;
        }catch(e){
            console.error(e);
            temp = null;
        }
    }
    // 无聚焦窗口
    if (!thisDocId) {
        thisDocId = window.top.document.querySelector(".protyle.fn__flex-1:not(.fn__none) .protyle-background")?.getAttribute("data-node-id");
        debugPush("获取具有焦点id失败，获取首个打开中的文档", thisDocId);
        if (mustSure && window.top.document.querySelectorAll(".protyle.fn__flex-1:not(.fn__none) .protyle-background").length > 1) {
            debugPush("要求必须唯一确认，但是找到多个打开中的文档");
            return null;
        }
    }
    return thisDocId;
}

export function getAllShowingDocId(): string[] {
    if (isMobile()) {
        return [getCurrentDocIdF()];
    } else {
        const elemList = window.document.querySelectorAll("[data-type=wnd] .protyle.fn__flex-1:not(.fn__none) .protyle-background");
        const result = [].map.call(elemList, function(elem: Element) {
            return elem.getAttribute("data-node-id");
        });
        return result
    }
}

/**
 * 获取当前挂件id
 * @returns 
 */
export function getCurrentWidgetId(){
    try{
        if (!window.frameElement.parentElement.parentElement.dataset.nodeId) {
            return window.frameElement.parentElement.parentElement.dataset.id;
        }else{
            return window.frameElement.parentElement.parentElement.dataset.nodeId;
        }
    }catch(err){
        warnPush("getCurrentWidgetId window...nodeId方法失效");
        return null;
    }
}



/**
 * 基于本地window.siyuan获得笔记本信息
 * @param {*} notebookId 为空获得所有笔记本信息
 * @returns 
 */
export function getNotebookInfoLocallyF(notebookId = undefined) {
    try {
        if (!notebookId) return window.top.siyuan.notebooks;
        for (let notebookInfo of window.top.siyuan.notebooks) {
            if (notebookInfo.id == notebookId) {
                return notebookInfo;
            }
        }
        return undefined;
    }catch(err) {
        errorPush(err);
        return undefined;
    }
}

/**
 * 获取笔记本排序规则
 * （为“跟随文档树“的，转为文档树排序
 * @param {*} notebookId 笔记本id，不传则为文档树排序
 * @returns 
 */
export function getNotebookSortModeF(notebookId = undefined) {
    try {
        let fileTreeSort = window.top.siyuan.config.fileTree.sort;
        if (!notebookId) return fileTreeSort;
        let notebookSortMode = window.document.querySelector(`.file-tree.sy__file ul[data-url='${notebookId}']`)?.getAttribute("data-sortmode") ?? getNotebookInfoLocallyF(notebookId).sortMode;
        if (typeof notebookSortMode === "string") {
            notebookSortMode = parseInt(notebookSortMode, 10);
        }
        if (notebookSortMode == DOC_SORT_TYPES.UNASSIGNED || notebookSortMode == DOC_SORT_TYPES.FOLLOW_DOC_TREE) {
            return fileTreeSort;
        }
        return notebookSortMode;
    }catch(err) {
        errorPush(err);
        return undefined;
    }
}


export function getActiveDocProtyle() {
    const allProtyle = {};
    window.siyuan.layout.centerLayout?.children?.forEach((wndItem) => {
        wndItem?.children?.forEach((tabItem) => {
            if (tabItem?.model) {
                allProtyle[tabItem?.id](tabItem.model?.editor?.protyle);
            }
        });
    });
}

export function getActiveEditorIds() {
    let result = [];
    let id = window.document.querySelector(`.layout__wnd--active [data-type="tab-header"].item--focus`)?.getAttribute("data-id");
    if (id) return [id];
    window.document.querySelectorAll(`[data-type="tab-header"].item--focus`).forEach(item=>{
        let uid = item.getAttribute("data-id");
        if (uid) result.push(uid);
    });
    return result;
}


export function isDarkMode() {
    if (window.top.siyuan) {
        return window.top.siyuan.config.appearance.mode == 1 ? true : false;
    } else {
        let isDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
        return isDarkMode;
    }
}

let isMobileRecentResult = null;
export function isMobile() {
    if (isMobileRecentResult != null) {
        return isMobileRecentResult;
    }
    if (window.top.document.getElementById("sidebar")) {
        isMobileRecentResult = true;
        return true;
    } else {
        isMobileRecentResult = false;
        return false;
    }
};