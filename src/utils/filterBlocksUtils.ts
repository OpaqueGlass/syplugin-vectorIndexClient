import { getReadOnlyGSettings } from "@/manager/settingManager";
import { isValidStr, quickCheckIsValidSiyuanId } from "./commonCheck";
import { getDocDBitem } from "@/syapi/custom";

async function getIgnoreList() {
    const g_settings = getReadOnlyGSettings();
    const ignoreList = g_settings.ignoreDocListStr.split("\n").map(item=>item.trim()).filter(item => quickCheckIsValidSiyuanId(item));
    return ignoreList;
}
async function getNotebookWhiteList() {
    const g_settings = getReadOnlyGSettings();
    const autoUpdateNotebooksList = g_settings.autoUpdateNotebooksListStr.split("\n").map(item=>item.trim()).filter(item => quickCheckIsValidSiyuanId(item));
    return autoUpdateNotebooksList;
}

class DocFilter {

    cacheList: Map<String, boolean> = new Map();

    resetCache() {
        this.cacheList = new Map();
    }

    /**
     * 文档结果过滤
     * @param id 
     * @returns 返回true则为通过过滤，可以处理
     */
    async filterDoc(id: string, dbItem?: any) {
        if (!isValidStr(id)) {
            return false;
        }
        if (this.cacheList.get(id)) {
            return this.cacheList.get(id);
        }
        if (dbItem == undefined) {
            dbItem = await getDocDBitem(id);    
        }
        if (dbItem == undefined) {
            this.cacheList.set(id, false);
            return false;
        }
        const ignoreList = await getIgnoreList();
        for (let item of ignoreList) {
            if (dbItem.box === item) {
                this.cacheList.set(id, false);
                return false;    
            }
            if (dbItem.path.includes(item)) {
                this.cacheList.set(id, false);
                return false;
            }
        }
        const whiteList = await getNotebookWhiteList();
        if (whiteList.includes(dbItem.box)) {
            this.cacheList.set(id, true);
            return true;
        } else {
            this.cacheList.set(id, false);
            return false;
        }
    }
}


export const docFilter = new DocFilter();