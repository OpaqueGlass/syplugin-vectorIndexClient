
// Worker: 负责三类任务
// 1. 处理Transaction，返回docId或blockId
// 2. 处理docId/blockId，返回其下所有docId列表
// 3. 处理docId/blockId，通过API获取文段内容
// 4. 设置与载入队列，定时发送更新请求
import { exportMdContent, createFolder, queryAPI, listDocTree } from "@/syapi/index";
import { CacheQueue } from ".";
import { isValidStr } from "@/utils/commonCheck";
import { debugPush, errorPush, logPush, warnPush } from "@/logger";
import { VectorServiceManager } from "@/manager/indexServiceManager";
import * as Comlink from "comlink";
import { getBlockDBItem, getDocDBitem, getSubDocIds } from "@/syapi/custom";
import { sleep } from "@/utils/common";
import { CONSTANTS, HealthStatus, INDEXER_CONSTANTS } from "@/constants";
import { LightRAGService } from "@/services/lightRAG";
import { ChromaClient } from "chromadb";
// TODO: 下面这个导入有问题，排查一下是否引入了不能使用的玩意
import { AIClientFactory} from "@/ai_client/factory";
import { IChatClient, IEmbeddingClient, IRerankClient } from "@/ai_client";


const SAVE_FOLDER = "/data/storage/petal/syplugin-vectorIndexClient";

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
	private recentTaskInfo: any[] = [];
	private g_setting_cache: any = null;
	private isLeader: boolean = false;
	private aiClientDict: AiClientDict = {"chat": null, "embedding": null, "rerank": null}; 
	// 忽略单个服务的错误，继续处理下一个文档，且不予重试
	private ignoreSingleServiceErrors: boolean = false;

	public ignoreList: string[] = [];

	private IndexerServices: { [key: string]: any } = {
		[INDEXER_CONSTANTS.LIGHTRAG]: LightRAGService,
	};

    constructor() {
        this.initQueue();
    }

	public test() {
		warnPush("Worker test function called.");
	}

	public getRecentTaskInfo() {
		return this.recentTaskInfo;
	}

	public appendInfoToRecentTasks(info: any) {
		this.recentTaskInfo.push(info);
		if (this.recentTaskInfo.length > 20) {
			this.recentTaskInfo.shift();
		}
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

    async start(globalConfig?: any) {
		debugPush("Worker starting");
		if (globalConfig === null) {
			globalConfig = this.g_setting_cache;
		}
		// 初始化模型：
		for (let key of Object.keys(this.aiClientDict)) {
			const modelConfig = globalConfig[key + "Model"];
			this.aiClientDict[key] = AIClientFactory.getChatClient(modelConfig["modelType"], modelConfig["baseUrl"], modelConfig["apiKey"]);
		}
		
		// 读取配置，初始化服务
		const allPluginedIndexers = Object.values(INDEXER_CONSTANTS);
		for (const indexerId of allPluginedIndexers) {
			if (globalConfig && globalConfig[indexerId]) {
				const config = globalConfig[indexerId];
				if (config["enabled"] === true && this.IndexerServices[indexerId]) {
					debugPush("Initializing indexer service:", indexerId);
					let service = new this.IndexerServices[indexerId]();
					if (service) {
						await this.vectorManager.registerService(indexerId, service, config || {});
					}
					debugPush("Service initialized:", indexerId);
				}
			}
		}
		this.g_setting_cache = globalConfig;
        this.startCycle();
    }

	async stop() {
		this.stopCycle();
	}

	async restart(globalConfig?: any) {
		await this.stop();
		this.vectorManager.unregisterAllServices();
		await this.start(globalConfig);
	}

	async query(text: string, serviceId?: string){
		return await this.vectorManager.query(text, serviceId);
	}

	async getAvailableServices() {
		return await this.vectorManager.getAvailableServicesIds();
	}

	async getAllRegisteredServices() {
		return await this.vectorManager.getRegisteredServicesIds();
	}

	async checkHealth(serviceId: string) {
		const service = this.vectorManager.getServiceById(serviceId);
		if (service) {
			return await service.healthCheck();
		}
		return null;
	}

	async checkModelHealth(modelType: "embedding"|"chat"|"rerank", modelConfig: ModelConfig) {
		let testModel: IChatClient|IRerankClient|IEmbeddingClient|null = null;
		try {
			if (modelConfig == null) {
				testModel = this.aiClientDict[modelType];
			} else {
				switch (modelType) {
					case "chat":
						testModel = AIClientFactory.getChatClient(modelConfig["modelType"], modelConfig["baseUrl"], modelConfig["apiKey"]);
						break;
					case "embedding":
						testModel = AIClientFactory.getEmbeddingClient(modelConfig["modelType"], modelConfig["baseUrl"], modelConfig["apiKey"]);
						break;
					case "rerank":
						testModel = AIClientFactory.getRerankClient(modelConfig["modelType"], modelConfig["baseUrl"], modelConfig["apiKey"]);
						break;
				}
			}
			if (testModel == null) {
				return { available: false, message: "Unsupported model type or missing configuration", connectivity: HealthStatus.UNKNOWN_ERROR };
			}
			return await testModel.checkConnection({"modelName": modelConfig["modelName"]});
		} catch (err) {
			return {available: false, message: err.message || "Connection test failed with an unknown error", connectivity: HealthStatus.UNKNOWN_ERROR };
		}
	}

	getServiceQueryType(serviceId: string) {
		const service = this.vectorManager.getServiceById(serviceId);
		if (service && (service as any).getQueryType) {
			return (service as any).getQueryType();
		}
		return null;
	}

	setLeaderFlag(isLeader: boolean) {
		this.isLeader = isLeader;
		this.cacheQueue.setWritable(isLeader);
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
		// 不存在的文档则进行删除
		if (dbItem == null) {
			const result = await this.vectorManager.delete([{ docId: docId, blockId: [] }]);
			return true;
		}

		// 移除被设定为无权访问的文档
		if (!checkPermission(dbItem, this.ignoreList || [])) {
			await this.vectorManager.delete([{ docId: docId, blockId: [] }]);
			return true;
		}

		const content = await exportMdContent({ id: docId, refMode: 4, embedMode: 1, yfm: false });
		if (content !== null && content["content"] != undefined) {
			content["content"] = content["content"].trim();
		}
		try {
			const chunks: VectorChunk[] = [];
			// TODO: 考虑一下文档的子块要怎么定义
			if (dbItem["type"] === "d") {
				if (content["content"]?.length > CONSTANTS.FILTER_MIN_CHAR) {
					chunks.push({
						id: docId,
						type: "doc",
						content: content["content"],
						parentId: null,
						path: dbItem["path"]
					});
				}

				// 获取子块
				const queryResponse = await queryAPI(`SELECT * FROM blocks WHERE root_id = '${docId}' and type in ('p', 't', 'i')`) ?? [];
				for (const block of queryResponse) {
					block["markdown"] = block["markdown"]?.trim();
					if (block["markdown"]?.length > CONSTANTS.FILTER_MIN_CHAR) {
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
				debugPush("Processing document:", docId, "with chunks:", chunks);
				const result = await this.vectorManager.upsert(chunks);
				// 部分错误，但不是完全错误
				if (result.successCount < result.total && result.successCount > 0) {
					logPush("部分服务中处理失败:", result);
					if (this.ignoreSingleServiceErrors) {
						logPush("忽略单一服务错误，继续下一个文档:", docId);
						return true;
					} else {
						this.appendInfoToRecentTasks({ docId, result, time: new Date().toISOString() });
						return false;
					}
				} else if (result.successCount === 0) {
					errorPush("所有服务均处理失败:", result);
					this.appendInfoToRecentTasks({ docId, result, time: new Date().toISOString() });
					return false;
				} else {
					debugPush("文档处理成功:", docId, result);
				}
			}
		} catch (error) {
			logPush("Index dispatch error:", error);
			return false;
		}
		return true;
	}

	async pushToQueueAndStart(ids: string | string[], delayMs?: number) {
		logPush("Adding to index queue:", ids);
		console.log("Adding to index queue:", ids);
		if (Array.isArray(ids)) {
			await this.cacheQueue.batchAddToQueueWithDelay(ids, delayMs);
		} else {
			await this.cacheQueue.addToQueue(ids, delayMs);
		}
		this.startCycle();
	}

    async handleTransaction(transactionData: any) {
        if (transactionData.cmd === "savedoc") {
            const id = transactionData.data.rootID;
            await this.pushToQueueAndStart(id);
        }
    }

    async addWithSubDocs(docId: string) {
        const allDocIds = await getSubDocIds(docId);
        await this.pushToQueueAndStart(allDocIds);
        return { subDocCount: allDocIds.length }; // 直接 return，主线程 await 即可拿到
    }

    getQueueStatus() {
		return {
			"totalSize": this.cacheQueue.totalSize(),
			"availableSize": this.cacheQueue.availableSize(),
			"isWorking": this.working,
		};
    }
	startCycle() {
		if (this.intervalFlag || !this.vectorManager) {
			debugPush("Worker cycle already running or not initialized.");
			return;
		};
		if (this.vectorManager.getServiceCounts() === 0) {
			debugPush("No active indexer services. Worker will not start cycle.");
			return;
		}
		logPush("Worker cycle started due to new tasks.");
		this.idleCycles = 0; // 重置空闲计数
		
		this.intervalFlag = setInterval(async () => {
			if (this.working) return;
			this.working = true;
			debugPush("Worker cycle tick.");
			try {
				if (this.cacheQueue.hasNext()) {
					this.idleCycles = 0; // 只要有任务，重置空闲计数
					while (this.cacheQueue.hasNext()) {
						let docId = await this.cacheQueue.consumeOne();
						let result = await this.processDocument(docId);
						if (result === false) {
							await this.cacheQueue.addToQueue(docId, 10000);
							await sleep(10000);
							break; // 遇到错误建议跳出本次 while，等待下一轮
						}
					}
				} else {
					this.idleCycles++;
					logPush(`Worker idle. Cycle: ${this.idleCycles}/${this.MAX_IDLE_CYCLES}`);
				}

				// 检查是否需要停止循环
				if (this.idleCycles >= this.MAX_IDLE_CYCLES) {
					this.stopCycle();
				}
				if (this.vectorManager.getServiceCounts() === 0) {
					logPush("No active indexer services. Worker will stop cycle.");
					this.stopCycle();
				}
			} catch (err) {
				errorPush("Worker interval error:", err);
			} finally {
				this.working = false;
			}
		}, this.INTERVAL_MS);
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