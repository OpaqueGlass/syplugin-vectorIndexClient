
// Worker: 负责三类任务
// 1. 处理Transaction，返回docId或blockId
// 2. 处理docId/blockId，返回其下所有docId列表
// 3. 处理docId/blockId，通过API获取文段内容
// 4. 设置与载入队列，定时发送更新请求
import { exportMdContent, createFolder, queryAPI, listDocTree } from "@/syapi/index";
import { CacheQueue } from ".";
import { MyIndexProvider } from "./myProvider";
import { isValidStr } from "@/utils/commonCheck";
import { errorPush, logPush } from "@/logger";
import { VectorServiceManager } from "@/manager/indexServiceManager";
import { IVectorStoreService, VectorChunk } from "@/services";
import * as Comlink from "comlink";
import { getBlockDBItem, getDocDBitem, getSubDocIds } from "@/syapi/custom";



const SAVE_FOLDER = "/data/storage/petal/syplugin-vectorIndexClient";
const MAX_IDLE_CYCLES = 3; 
const INTERVAL_MS = 10000;

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

class VectorIndexer {
    private vectorManager = new VectorServiceManager();
    private cacheQueue = new CacheQueue<string>(SAVE_FOLDER + "/cache");
    private intervalFlag: any = null;
    private working = false;
    private idleCycles = 0;
    private readonly MAX_IDLE_CYCLES = 3;
    private readonly INTERVAL_MS = 10000;

	public ignoreList: string[] = [];

    constructor() {
        this.initQueue();
    }

	private async initQueue() {
        try {
            await createFolder(SAVE_FOLDER);
            await createFolder(SAVE_FOLDER + "/cache");
            await this.cacheQueue.init();
        } catch (err) {
            errorPush("Worker Init Failed:", err);
        }
    }

    async start(servicesConfig: any[]) {
        for (const conf of servicesConfig) {
            let service;
            if (conf.type === "myProvider") {
                service = new MyIndexProvider();
            }
            if (service) {
                await this.vectorManager.registerService(conf.id, service, conf.options);
            }
        }
        this.startCycle();
    }

	async indexAll(notebookList: string[]) {
		for (let notebookId of notebookList) {
			let allDocIds = await getSubDocIds(notebookId, true);
			await this.pushToQueueAndStart(allDocIds);
		}
		return notebookList.length;
	}

	private async processDocument(docId: string) {
		if (!isValidStr(docId)) return true;

		const dbItem = await getBlockDBItem(docId);
		if (dbItem == null) {
			// 批量删除
			await this.vectorManager.delete([{ docId: docId, blockId: [] }]);
			return true;
		}

		if (!checkPermission(dbItem, this.ignoreList || [])) {
			await this.vectorManager.delete([{ docId: docId, blockId: [] }]);
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
						parentId: null,
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
				await this.vectorManager.upsert(chunks);
			}
		} catch (error) {
			logPush("Index dispatch error:", error);
			return false;
		}
		return true;
	}

	async pushToQueueAndStart(ids: string | string[]) {
		if (Array.isArray(ids)) {
			await this.cacheQueue.batchAddToQueue(ids);
		} else {
			await this.cacheQueue.addToQueue(ids);
		}
		this.startCycle();
	}

    async handleTransaction(transactionData: any) {
        if (transactionData.cmd === "savedoc") {
            const id = transactionData.data.rootID;
            await this.pushToQueueAndStart(id);
        }
    }

    // 3. 处理带子文档的任务 (直接返回结果，不再手动 postMessage)
    async addWithSubDocs(docId: string) {
        const allDocIds = await getSubDocIds(docId);
        await this.pushToQueueAndStart(allDocIds);
        return { subDocCount: allDocIds.length }; // 直接 return，主线程 await 即可拿到
    }

    // 4. 暴露状态给 UI (可选)
    getQueueStatus() {
        return {
            isWorking: this.working,
            pendingCount: this.cacheQueue.size()
        };
    }
	startCycle() {
		if (this.intervalFlag || !this.vectorManager) return; // 已经在运行或未初始化
		
		logPush("Worker cycle started due to new tasks.");
		this.idleCycles = 0; // 重置空闲计数
		
		this.intervalFlag = setInterval(async () => {
			if (this.working) return;
			this.working = true;

			try {
				if (this.cacheQueue.hasNext()) {
					this.idleCycles = 0; // 只要有任务，重置空闲计数
					while (this.cacheQueue.hasNext()) {
						let docId = await this.cacheQueue.consumeOne();
						let result = await this.processDocument(docId);
						if (result === false) {
							await this.cacheQueue.addToQueue(docId);
							await sleep(10000);
							break; // 遇到错误建议跳出本次 while，等待下一轮
						}
					}
				} else {
					this.idleCycles++;
					logPush(`Worker idle. Cycle: ${this.idleCycles}/${MAX_IDLE_CYCLES}`);
				}

				// 检查是否需要停止循环
				if (this.idleCycles >= MAX_IDLE_CYCLES) {
					this.stopCycle();
				}
			} catch (err) {
				errorPush("Worker interval error:", err);
			} finally {
				this.working = false;
			}
		}, INTERVAL_MS);
	}

	stopCycle() {
		if (this.intervalFlag) {
			clearInterval(this.intervalFlag);
			this.intervalFlag = null;
			logPush("Worker entered sleep mode (3 idle cycles).");
		}
	}
}

Comlink.expose(VectorIndexer);
export type IVectorIndexer = VectorIndexer;