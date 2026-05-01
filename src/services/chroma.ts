import { AIClient } from "@/ai_client";
import { HealthStatus } from "@/constants";
import { UpsertError } from "@/exceptions/upsertError";
import { errorPush, logPush } from "@/logger";
import { getChildBlocks, getDocInfo, getDocOutlineAPI } from "@/syapi";
import { generateUUID } from "@/utils/common";
import { isValidStr, quickCheckIsValidSiyuanId } from "@/utils/commonCheck";
import { JSONStorage } from "@/utils/jsonStorageUtil";
import { getHeadingsByLevel, getMaxDepth, HeadingInfo } from "@/utils/syoutlineUtils";
import { ChromaClient, Collection, Metadata } from "chromadb";



interface ChromaDBConfig {
    host: string;
    port: number;
    ssl: boolean;
    headersJson: string;
    topK: number;
    embeddingModel: string;
    chatModel: string;
    maxEmbeddingTokens: number;
}


export class ChromaService implements IVectorStoreService<ChromaDBConfig> {
    private config: ChromaDBConfig;
    // private storage: JSONStorage<ChromaDBData> | null = null;
    private retryCounts: Record<string, number> = {};

    private client: ChromaClient;

    private aiClient: AIClient;

    private embeddingServices = {
        "embedding": null,
        // "embedding-vl": null,
        "rerank-qa": null,
        "rerank-similarity": null,
        // "rerank-vl-qa": null,
        // "rerank-vl-similarity": null
    }

    private collectionName = "siyuan_docs";

    private collection: Collection;

    static manifest: ServiceManifest = {
        id: 'chroma',
        name: 'ChromaDB',
        description: 'Vector database for semantic search and similarity retrieval.',
        capabilities: { requiresExternalEmbedding: false },
        configSchema: [
            {
                key: 'host',
                label: 'Server URL',
                type: 'string',
                required: true,
                defaultValue: 'http://localhost:9600',
            },
            {
                key: 'port',
                label: 'Port',
                type: 'number',
                required: true,
                defaultValue: 8000
            }
        ]
    };

    getConfig() {
        return this.config;
    }

    setEmbeddingService(embeddingService: any): void {
        this.aiClient = embeddingService;
    }

    constructor() {
    }

    async initialize(config: ChromaDBConfig): Promise<void> {
        this.config = config;
        this.client = new ChromaClient({
            host: this.config.host,
            port: this.config.port,
            ssl: this.config.ssl,
        });
        // this.client.listCollections().then((collections)=>{
        //     logPush("当前数据库中的collections: " + JSON.stringify(collections));
        // }).catch((e)=>{
        //     errorPush("连接ChromaDB失败。Connect to ChromaDB failed. " + e);
        // });
    }

    async updateConfig(newConfig: ChromaDBConfig): Promise<void> {
        this.config = newConfig;

    }

    async _validateConfig(config: ChromaDBConfig, autoCheck: boolean=true): Promise<HealthCheckResult> {
        try {
            const collections = await this.client.listCollections();
            // 创建我们的collection
            if (!collections.some(col => col.name === this.collectionName)) {
                this.collection =  await this.client.createCollection({
                    name: this.collectionName,
                });
                logPush(`Collection '${this.collectionName}' created successfully.`);
            } else {
                this.collection = await this.client.getCollection({
                    name: this.collectionName,
                });
            }
        } catch (e: any) {
            let status = HealthStatus.UNREACHABLE;
            errorPush(`连接ChromaDB失败。Connect to ChromaDB failed. ${e}`);
            return {
                available: false,
                connectivity: status,
                message: `请检查配置是否正确: ${e}`
            };
        }
        // 自动检查模式下，不再尝试可能付费的API
        if (autoCheck) {
            return {
                available: true,
                connectivity: HealthStatus.HEALTHY,
                message: "连接成功！Connection successful!"
            }
        }
        try {
            const embedding = await this.aiClient.embeddings(config.embeddingModel, "test", config.maxEmbeddingTokens);
            if (!embedding || embedding.length === 0) {
                throw new Error("未能成功获取测试文本的向量表示。Failed to get embedding for test text.");
            }
        } catch (e: any) {
            errorPush(`连接AI提供商失败。Connect to AI provider failed. ${e}`);
            return {
                available: false,
                connectivity: HealthStatus.UNREACHABLE,
                message: `请检查AI提供商配置是否正确: ${e.message}`
            };
        }
        try {
            const chatResult = await this.aiClient.chat(config.chatModel, [
                { role: "system", content: "你是一个AI助手。" },
                { role: "user", content: "请只回复“是”。" }
            ], {
                max_tokens: 20
            });
            if (!isValidStr(chatResult)) {
                throw new Error("未能成功获取AI提供商的响应。Failed to get response from AI provider.");
            }
        } catch (e: any) {
            errorPush(`连接AI提供商失败。Connect to AI provider failed. ${e}`);
            return {
                available: false,
                connectivity: HealthStatus.UNREACHABLE,
                message: `请检查AI提供商配置是否正确: ${e.message}`
            };
        }
        return {
            available: true,
            connectivity: HealthStatus.HEALTHY,
            message: "连接成功！Connection successful!"
        }

    }

    async validateConfig(config: ChromaDBConfig): Promise<HealthCheckResult> {
        return await this._validateConfig(config, false);
    }

    async healthCheck(): Promise<HealthCheckResult> {
        return await this._validateConfig(this.config, true);
    }

    /**
     * 处理单条数据的上传，包含冲突删除重试逻辑
     */
    async upsertSingleDocument(docId: string): Promise<any> {
        const result = await getDocOutlineAPI(docId);
        const maxDepth = getMaxDepth(result);
        const headingLevelResult = maxDepth > 0 ? getHeadingsByLevel(result, Math.ceil(maxDepth * 0.6)) : [];
        const docChildBlocks = await getChildBlocks(docId);
        const firstHeadingBlockIndex = docChildBlocks.findIndex(block => block.type === "h");

        // 处理不被包含在任何标题块下的内容
        if (firstHeadingBlockIndex !== 0 && firstHeadingBlockIndex === -1) {
            const orphanBlocks = docChildBlocks.slice(0, firstHeadingBlockIndex === -1 ? undefined : firstHeadingBlockIndex);
            const docInfo = await getDocInfo(docId);
            const headingInfo: HeadingInfo = {
                id: docId,
                content: docInfo.name,
                headingType: 1,
                depth: 0,
                count: orphanBlocks.length,
                headings: [docInfo.name],
                headingsIds: [docId]
            }
            this.upsertSubHeadingContent(orphanBlocks, headingInfo, docId);
        }
        // 处理其他块
        // 以特定块为单位请求
        for (let headingInfo of headingLevelResult) {
            const childBlocks = await getChildBlocks(headingInfo.id);
            this.upsertSubHeadingContent(childBlocks, headingInfo, docId);
        }

        return result;
    }

    async upsertSubHeadingContent(childBlocks: ChildBlockResponse[], parentHeadingInfo: HeadingInfo, docId: string): Promise<void> {
        const chunks = createChunks(childBlocks, parentHeadingInfo, docId, 600);
        this.collection.upsert({
            ids: chunks.map(c => c.ids),
            metadatas: chunks.map(c => ({...c})),
        });

    }

    async upsert(chunks: VectorChunk[]): Promise<void> {
        const filteredDoc = chunks.filter(c => 
            c.type === "doc" && quickCheckIsValidSiyuanId(c.id)
        );
        const filteredBlock = chunks.filter(c =>
            c.type === "block" && quickCheckIsValidSiyuanId(c.id)
        );
        for (let chunk of filteredDoc) {
            await this.upsertSingleDocument(chunk.id);
        }
        for (let chunk of filteredBlock) {
            const docId = chunk.parentId;
            await this.upsertSingleDocument(docId);
        }
        
    }

    async query(text: string): Promise<QueryResult[]> {
        // const payload = {
        //     query: text,
        //     mode: this.config.mode,
        //     top_k: this.config.topK,
        //     stream: false,
        //     include_references: true
        // };

        // const data = await this.request('/query', {
        //     method: 'POST',
        //     body: JSON.stringify(payload)
        // });

        // return [{
        //     "content": data.response,
        //     "ids": data.references.filter(ref => quickCheckIsValidSiyuanId(ref.file_path)).map((ref: any) => ref.file_path)
        // }];
    }

    async clearAll(): Promise<void> {
        // await this.request('/documents', { method: 'DELETE' });
    }

    async delete(targets: DeleteTarget[]): Promise<void> {
        const docIds = targets.map(t => t.docId).filter(id => quickCheckIsValidSiyuanId(id));
        if (docIds.length > 0) {
            await this.deleteDocuments(docIds);
        }
    }

    /**
     * 删除指定 ID 的文档及其关联数据
     * @param docIds 文档 ID 数组
     */
    async deleteDocuments(docIds: string[]): Promise<void> {
        
    }

    /**
     * 获取服务类型标识
     * search 主要提供向量检索服务，返回内容为最匹配的原文内容
     * qa 提供问答服务，返回的内容是llm给出的回答而不是原文内容
     */
    getQueryType(): ServiceQueryType {
        return "search"
    }

    /**
     * 获取索引状态，包括是否支持获取状态、失败的文档数量和原因、待处理的文档数量等信息
     */
    async getIndexStatus(): Promise<IndexStatus>{
        const data = await this.request('/documents/status_counts', {
            method: 'GET'
        });
        const statusCounts = data["status_counts"];
        const pipelineStatus = await this.request("/documents/pipeline_status", {
            method: "GET"
        });
        const failedReasons = isValidStr(pipelineStatus["latest_message"]) ? pipelineStatus["history_messages"] : [];
        return {
            isSupportGetStatus: true,
            failedCount: statusCounts["FAILED"] || 0,
            failedReasons: failedReasons,
            pendingCount:  statusCounts["PENDING"] || 0
        };
    }

    /**
     * 重新处理索引失败的文档，通常在用户修复了导致索引失败的问题后调用
     */
    async reprocessFailed(): Promise<void> {
        // 这里应该没有，错误的集中在插件侧，由queue那边管理重试，不需要通知服务端
    }
}