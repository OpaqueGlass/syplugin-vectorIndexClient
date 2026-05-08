import { AIClient, IEmbeddingClient } from "@/ai_client";
import { HealthStatus } from "@/constants";
import { UpsertError } from "@/exceptions/upsertError";
import { debugPush, errorPush, logPush } from "@/logger";
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

    private aiClientServiceDict: AIClientDict = {
        "chat": null,
        "embedding": null,
        "rerank": null,
    }

    private embeddingServices = {
        "embedding": null,
        // "embedding-vl": null,
        "rerank-qa": null,
        "rerank-similarity": null,
        // "rerank-vl-qa": null,
        // "rerank-vl-similarity": null
    }

    private collectionName = "siyuan_docs_ogvic";

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

    setAIClientDict(aiClientDict: AIClientDict): void {
        debugPush("settingAiClient", aiClientDict)
        this.aiClient = aiClientDict.chat;
        this.aiClientServiceDict = aiClientDict;
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
            this.collection = await this.client.getOrCreateCollection({
                name: this.collectionName,
            });
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
        if (this.aiClientServiceDict.embedding === null) {
            return {
                available: false,
                connectivity: HealthStatus.UNHEALTHY,
                message: "未配置ai客户端。至少需要配置 嵌入模型。如需完整功能，建议配置聊天模型、嵌入模型、重排序模型，详见README.md。"
            }
        }
        return {
            available: true,
            connectivity: HealthStatus.HEALTHY,
            message: "连接成功. (此验证不检查ai模型配置，仅检查数据库连接)"
        }

        // 之后的交给aiClient那边判定
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
        const chunks = createChunks(childBlocks, parentHeadingInfo, docId, 900);
        const mainMetadatas = chunks.map(c => ({contentType: "original", ...c}));
        // 原始内容
        const mainContentList = chunks.map(item => item.content);
        if (this.aiClientServiceDict.embedding == null) {
            throw new Error("Embedding Client not available");
        }
        const mainContentEmbedings = await (this.aiClientServiceDict.embedding as IEmbeddingClient).wrappedEmbeddings(mainContentList);

        await this.collection.upsert({
            ids: chunks.map(c => c.ids),
            metadatas: mainMetadatas,
            embeddings: mainContentEmbedings,
            documents: mainContentList
        });
        logPush(`内容已上传`, mainContentList, mainMetadatas);

        // ai生成提问内容
        if (this.aiClientServiceDict.chat == null) {
            return;
        }
        try {
            const questionPromises = mainContentList.map(content => this.aiClientServiceDict.chat.getAlternateTextQuestion(content));
            const questionLists = await Promise.all(questionPromises);
            for (let i = 0; i < questionLists.length; i++) {
                const questions = questionLists[i];
                const questionEmbeddings = await (this.aiClientServiceDict.embedding as IEmbeddingClient).wrappedEmbeddings(questions);
                const questionMetadatas = questions.map(q => ({...chunks[i], question: q, contentType: "question"}));
                await this.collection.upsert({
                    ids: questions.map((q, index) => `${chunks[i].ids}-question-${index}`),
                    metadatas: questionMetadatas,
                    embeddings: questionEmbeddings,
                    documents: questions
                });
            }
        } catch (e) {
            errorPush(`生成或嵌入提问失败。Failed to generate questions. ${e}`);
        }

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
        const embeddings = await this.aiClient.wrappedEmbeddings([text]);
        const queryResult = await this.collection.query({
            queryEmbeddings: embeddings,
        });

        if (this.aiClientServiceDict.rerank == null) {
            let finalResult = [];
            for (let i = 0; i < queryResult.documents.length; i++) {
                finalResult.push({
                    "content": queryResult.documents[i],
                    "ids": queryResult.metadatas[i]["block_ids"] ?? queryResult.metadatas[i]["doc_id"]
                })
            }
            return finalResult;
        } else {
            // rerank
        }
        // return [{
        //     "content": data.response,
        //     "ids": data.references.filter(ref => quickCheckIsValidSiyuanId(ref.file_path)).map((ref: any) => ref.file_path)
        // }];
    }

    async clearAll(): Promise<void> {
        // await this.request('/documents', { method: 'DELETE' });
        await this.client.deleteCollection({ name: this.collectionName});
        this.collection = await this.client.getOrCreateCollection({ name: this.collectionName});
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
        docIds.forEach(item => {
            this.collection.delete({ where: {
                "doc_id": item
            }});
        });
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
        return {
            isSupportGetStatus: false,
            failedCount: 0,
            failedReasons: [],
            pendingCount:  0
        };
    }

    /**
     * 重新处理索引失败的文档，通常在用户修复了导致索引失败的问题后调用
     */
    async reprocessFailed(): Promise<void> {
        // 这里应该没有，错误的集中在插件侧，由queue那边管理重试，不需要通知服务端
    }
}