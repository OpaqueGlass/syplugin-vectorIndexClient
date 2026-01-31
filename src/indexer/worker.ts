
// Worker: 负责三类任务
// 1. 处理Transaction，返回docId或blockId
// 2. 处理docId/blockId，返回其下所有docId列表
// 3. 处理docId/blockId，通过API获取文段内容
// 4. 设置与载入队列，定时发送更新请求

import { getDocInfo, getDoc, listDocsByPathT, exportMdContent, createFolder, queryAPI, listDocTree } from "@/syapi/index";
import { CacheQueue } from ".";
import { IndexProvider } from "./baseIndexProvider";
import { MyIndexProvider } from "./myProvider";
import { isValidStr } from "@/utils/commonCheck";
import { errorPush, logPush } from "@/logger";
import { VectorServiceManager } from "@/manager/indexServiceManager";
import { IVectorStoreService } from "@/services";

async function getBlockDBItem(id:string) {
	const queryResponse = await queryAPI(`SELECT * FROM blocks WHERE id = '${id}'`);
	if (queryResponse == null || queryResponse.length == 0) {
		return null;
	}
	return queryResponse[0];
}

async function getDocDBitem(id:string) {
    const queryResponse = await queryAPI(`SELECT * FROM blocks WHERE id = '${id}' and type = 'd'`);
    if (queryResponse == null || queryResponse.length == 0) {
        return null;
    }
    return queryResponse[0];
}

async function getSubDocIds(id:string, isNotebook: boolean = false): Promise<string[]> {
	// 添加idx?
	let treeList = [];
	if (isNotebook) {
		treeList = await listDocTree(id, "/");
	} else {
		const docInfo = await getDocDBitem(id);
		if (docInfo == null) {
			return [];
		}
		treeList = await listDocTree(docInfo["box"], docInfo["path"].replace(".sy", ""));
	}
	const subIdsSet = new Set();
	function addToSet(obj) {
		if (obj instanceof Array) {
			obj.forEach(item=>addToSet(item));
			return;
		}
		if (obj == null) {
			return;
		}
		if (isValidStr(obj["id"])) {
			subIdsSet.add(obj["id"]);
		}
		if (obj["children"] != undefined ) {
			for (let item of obj["children"]) {
				addToSet(item);
			}
		}
	}
	addToSet(treeList);
	logPush("subIdsSet", subIdsSet, treeList);
	return Array.from(subIdsSet) as string[];
}
/**
 * 休息一下，等待
 * @param time 单位毫秒
 * @returns 
 */
function sleep(time:number){
    return new Promise((resolve) => setTimeout(resolve, time));
}

const SAVE_FOLDER = "/data/storage/petal/syplugin-vectorIndexClient";
const cacheQueue: CacheQueue<string> = new CacheQueue<string>(SAVE_FOLDER + "/cache");
let indexProvider: IndexProvider | null = null;
const vectorManager = new VectorServiceManager();

// 状态控制变量
let intervalFlag: any = null;
let working = false;
let idleCycles = 0; // 记录空闲循环次数
const MAX_IDLE_CYCLES = 3; 
const INTERVAL_MS = 10000;

let g_settings = {};
let ignoreList = [];
let g_backendConfig = { baseURL: "", apiKey: "" };

async function init() {
	try {
		await createFolder(SAVE_FOLDER);
		await createFolder(SAVE_FOLDER + "/cache");
	} catch (err) {
		errorPush("Failed to create folders:", err);
	}
	await cacheQueue.init();
}

init().catch((err) => {
	errorPush("Initialization error:", err);
});

function checkPermission(dbItem, ignoreList: string[]): boolean {
	const notebookId = dbItem.box;
	const path = dbItem.path;
	logPush("Checking permission for", notebookId, path, ignoreList);
	if (ignoreList && ignoreList.includes(notebookId)) {
		return false;
	}
	if (ignoreList) {
		for (const docId of ignoreList) {
			if (notebookId === docId || path.includes(docId) || dbItem.id === docId) {
				return false;
			}
		}
	}
	return true;
}

async function processDocument(docId: string) {
    if (!isValidStr(docId)) return true;

    const dbItem = await getBlockDBItem(docId);
    if (dbItem == null) {
        // 批量删除
        await vectorManager.delete([{ docId: docId, blockId: [] }]);
        return true;
    }

    if (!checkPermission(dbItem, ignoreList || [])) {
        await vectorManager.delete([{ docId: docId, blockId: [] }]);
        return true;
    }

    const content = await exportMdContent({ id: docId, refMode: 4, embedMode: 1, yfm: false });
    
    try {
        const chunks: VectorChunk[] = [];

        if (dbItem["type"] === "d") {
            if (content["content"]?.length > 5) {
                chunks.push({
                    id: docId,
                    type: "document",
                    content: content["content"],
                    path: dbItem["path"]
                });
            }

            // 获取子块
            const queryResponse = await queryAPI(`SELECT * FROM blocks WHERE root_id = '${docId}' and type in ('p', 't', 'i')`) ?? [];
            for (const block of queryResponse) {
                if (block["markdown"]?.length > 5) {
                    chunks.push({
                        id: block["id"],
                        parentId: docId,
                        type: "block",
                        content: block["markdown"],
                        path: block["path"]
                    });
                }
            }
        } else if (dbItem["type"] === "p") {
            chunks.push({
                id: docId,
                parentId: dbItem["root_id"],
                type: "block",
                content: content["content"],
                path: dbItem["path"]
            });
        }

        if (chunks.length > 0) {
            await vectorManager.upsert(chunks);
        }
    } catch (error) {
        logPush("Index dispatch error:", error);
        return false;
    }
    return true;
}

function startCycle() {
    if (intervalFlag || !indexProvider) return; // 已经在运行或未初始化
    
    logPush("Worker cycle started due to new tasks.");
    idleCycles = 0; // 重置空闲计数
    
    intervalFlag = setInterval(async () => {
        if (working) return;
        working = true;

        try {
            if (cacheQueue.hasNext()) {
                idleCycles = 0; // 只要有任务，重置空闲计数
                while (cacheQueue.hasNext()) {
                    let docId = await cacheQueue.consumeOne();
                    let result = await processDocument(docId);
                    if (result === false) {
                        await cacheQueue.addToQueue(docId);
                        await sleep(10000);
                        break; // 遇到错误建议跳出本次 while，等待下一轮
                    }
                }
            } else {
                idleCycles++;
                logPush(`Worker idle. Cycle: ${idleCycles}/${MAX_IDLE_CYCLES}`);
            }

            // 检查是否需要停止循环
            if (idleCycles >= MAX_IDLE_CYCLES) {
                stopCycle();
            }
        } catch (err) {
            errorPush("Worker interval error:", err);
        } finally {
            working = false;
        }
    }, INTERVAL_MS);
}

function stopCycle() {
    if (intervalFlag) {
        clearInterval(intervalFlag);
        intervalFlag = null;
        logPush("Worker entered sleep mode (3 idle cycles).");
    }
}

async function pushToQueueAndStart(ids: string | string[]) {
    if (Array.isArray(ids)) {
        await cacheQueue.batchAddToQueue(ids);
    } else {
        await cacheQueue.addToQueue(ids);
    }
    startCycle(); // 尝试启动（如果已启动会自跳过）
}

self.onmessage = async function (e) {
    const { type, payload } = e.data;
    try {
        if (type === "transaction") {
            let { transactionOriData } = payload;
            switch (transactionOriData['cmd']) {
                case "savedoc":
                    const id = transactionOriData['data']['rootID'];
                    await pushToQueueAndStart(id);
                    break;
            }
        } else if (type === "withSubDocs") {
            let { docId } = payload;
            let allDocIds = await getSubDocIds(docId);
            await pushToQueueAndStart(allDocIds);
            self.postMessage({ type: "added", docId, subDocCount: allDocIds.length });
        } else if (type === "onlyDoc") {
            let { docId } = payload;
            await pushToQueueAndStart(docId);
            self.postMessage({ type: "added", docId });
        } else if (type === "start") {
			let { servicesConfig, settings } = payload; // 假设传入了多个服务的配置列表
			
			// 初始化各个服务
			for (const conf of servicesConfig) {
				let service: IVectorStoreService;
				if (conf.type === "myProvider") {
					service = new MyIndexProvider();
				} else if (conf.type === "pinecone") {
					// service = new PineconeProvider();
				}
				
				if (service) {
					await vectorManager.registerService(conf.id, service, conf.options);
				}
			}
			
			startCycle(); // 启动上个回答中提到的按需循环逻辑
		}else if (type === "stop") {
            stopCycle();
            self.postMessage({ type: payload.returnType === "restart" ? "stopped-for-restart" : "stopped" });
        } else if (type === "indexAll") {
            let { notebookList } = payload;
            for (let notebookId of notebookList) {
                let allDocIds = await getSubDocIds(notebookId, true);
                await pushToQueueAndStart(allDocIds);
            }
            self.postMessage({ type: "indexAllAdded", notebookCount: notebookList.length });
        }
    } catch (err) {
        self.postMessage({ type: "error", error: err.message });
    }
};

