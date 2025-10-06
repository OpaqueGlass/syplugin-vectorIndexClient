
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

async function getSubDocIds(id:string): Promise<string[]> {
	// 添加idx?
	const docInfo = await getDocDBitem(id);
	const treeList = await listDocTree(docInfo["box"], docInfo["path"].replace(".sy", ""));
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
	console.log("subIdsSet", subIdsSet, treeList);
	return Array.from(subIdsSet) as string[];
}



const SAVE_FOLDER = "/data/storage/petal/syplugin-vectorIndexClient";
const cacheQueue: CacheQueue<string> = new CacheQueue<string>(SAVE_FOLDER + "/cache");
let indexProvider: IndexProvider | null = null;
async function init() {
	try {
		await createFolder(SAVE_FOLDER);
		await createFolder(SAVE_FOLDER + "/cache");
	} catch (err) {
		console.error("Failed to create folders:", err);
	}
	await cacheQueue.init();
}

// 写一个循环，按照一定的间隔，定时获取队列内容，进行处理
let intervalFlag = null;
let working = false;
init().catch((err) => {
	console.error("Initialization error:", err);
});

async function processDocument(docId: string) {
	if (!isValidStr(docId)) {
		return;
	}
	// 检查id
	const dbItem = await getBlockDBItem(docId);
	if (dbItem == null) {
		indexProvider.delete(docId, "document");
		indexProvider.delete(docId, "block");
		return;
	}
	// 获取文档内容
	const content = await exportMdContent({id: docId, refMode: 4, embedMode: 1, yfm: false});
	// 发送出去
	if (dbItem["type"] === "d") {
		await indexProvider.update(docId, null, content["content"], {}, "document");
	} else if (dbItem["type"] === "p") {
		await indexProvider.update(dbItem["root"], docId, content["content"], {}, "block");
	}
}

self.onmessage = async function (e) {
	const { type, payload } = e.data;
	console.log("Worker received message:", type, payload);
	try {
		if (type === "transaction") {
			// 处理Transaction，假定payload为transaction对象
			// 这里假定transaction包含docId或blockId
			let { transactionOriData } = payload;
			switch (transactionOriData['cmd']) {
				case "savedoc":
					// 获取id，加入队列
					const id = transactionOriData['data']['rootID'];
					cacheQueue.addToQueue(id);
					break;
				case "remove":
					// 获取id，移除队列
					break;
			}
		} else if (type === "withSubDocs") {
			let { docId } = payload;
			// 获取该文档下所有子文档
			let allDocIds: string[] = await getSubDocIds(docId);
			// 加入队列
			await cacheQueue.batchAddToQueue(allDocIds);
			self.postMessage({ type: "added", docId, subDocCount: allDocIds.length });
		} else if (type === "onlyDoc") {
			let { docId } = payload;
			// 直接加入队列
			await cacheQueue.addToQueue(docId);
			self.postMessage({ type: "added", docId });
		} else if (type === "start") {
			let { backendBaseURL, apiKey } = payload;
			// 创建文件夹
			await init();
			indexProvider = new MyIndexProvider(backendBaseURL, apiKey);
			if (intervalFlag) {
				clearInterval(intervalFlag);
				intervalFlag = null;
			}
			intervalFlag = setInterval(async () => {
				if (working) return;
				working = true;
				try {
					// 处理队列中的文档
					console.log("Worker interval triggered", cacheQueue.hasNext());
					while (cacheQueue.hasNext()) {
						let docId = await cacheQueue.consumeOne();
						// 处理文档
						await processDocument(docId);
					}
				} catch (err) {
					console.error("Worker interval error:", err);
				}
				console.log("Worker cycle complete");
				working = false;
			}, 10000);
			self.postMessage({ type: "started" });
		} else if (type === "end") {
			if (intervalFlag) {
				clearInterval(intervalFlag);
				intervalFlag = null;
			}
			self.postMessage({ type: "ended" });
		} else {
			self.postMessage({ type: "error", error: "Unknown message type" });
		}
	} catch (err) {
		console.error("Worker error:", err);	
		self.postMessage({ type: "error", error: err.message });
	}
};

