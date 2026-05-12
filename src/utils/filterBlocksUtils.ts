import { isValidStr, quickCheckIsValidSiyuanId } from "./commonCheck";
import { getDocDBitem } from "@/syapi/custom";

export class DocFilter {

    cacheList: Map<String, boolean> = new Map();

    constructor(private g_settings) {

    }

    resetCache() {
        this.cacheList = new Map();
    }

    async  getIgnoreList() {
        const g_settings = this.g_settings;
        if (!isValidStr(g_settings.ignoreDocListStr)) {
            return [];
        }
        const ignoreList = g_settings.ignoreDocListStr.split("\n").map(item=>item.trim()).filter(item => quickCheckIsValidSiyuanId(item));
        return ignoreList;
    }
    async  getNotebookWhiteList() {
        const g_settings = this.g_settings;
        if (!isValidStr(g_settings.autoUpdateNotebooksListStr)) {
            return [];
        }
        const autoUpdateNotebooksList = g_settings.autoUpdateNotebooksListStr.split("\n").map(item=>item.trim()).filter(item => quickCheckIsValidSiyuanId(item));
        return autoUpdateNotebooksList;
    }

    async filterNotebook(id: string) {
        const ignoreList = await this.getIgnoreList();
        return ignoreList.includes(id);
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
        const ignoreList = await this.getIgnoreList();
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
        const whiteList = await this.getNotebookWhiteList();
        if (whiteList.includes(dbItem.box)) {
            this.cacheList.set(id, true);
            return true;
        } else {
            this.cacheList.set(id, false);
            return false;
        }
    }
}