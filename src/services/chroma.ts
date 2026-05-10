import { AIClient, IEmbeddingClient } from "@/ai_client";
import { HealthStatus } from "@/constants";
import { UpsertError } from "@/exceptions/upsertError";
import { debugPush, errorPush, logPush, warnPush } from "@/logger";
import { getChildBlocks, getDocInfo, getDocOutlineAPI } from "@/syapi";
import { getDocDBitem } from "@/syapi/custom";
import { createChunks } from "@/utils/chunkDivide";
import { generateUUID } from "@/utils/common";
import { isValidStr, quickCheckIsValidSiyuanId } from "@/utils/commonCheck";
import { JSONStorage } from "@/utils/jsonStorageUtil";
import { getHeadingsByLevel, getMaxDepth, HeadingInfo } from "@/utils/syoutlineUtils";
import { ChromaClient, Collection, Metadata, Search, Knn, K, GroupBy, MinK } from "chromadb";
import { MyEmbeddingFunction } from "./chromaEmbedding";



interface ChromaDBConfig {
    host: string;
    port: number;
    ssl: boolean;
    headersJson: string;
    topK: number;
    useRerankModel: boolean;
    useQuestionAbstract: boolean;
}


export class ChromaService implements IVectorStoreService<ChromaDBConfig> {
    private config: ChromaDBConfig;
    // private storage: JSONStorage<ChromaDBData> | null = null;
    private retryCounts: Record<string, number> = {};

    private client: ChromaClient;
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
        this.aiClientServiceDict = aiClientDict;
    }

    constructor() {
    }

    async initialize(config: ChromaDBConfig): Promise<void> {
        this.config = config;
        let headerJson = null;
        try {
            if (isValidStr(this.config.headersJson)) {
                headerJson = JSON.parse(this.config.headersJson);
            }
        } catch (err) {
            errorPush("UserSettingFormatERROR: Chroma Request Header Json should be Record<string, string>。用户设置格式错误：Chroma请求头JSON格式错误，无法解析。" + err);
        }
        this.client = new ChromaClient({
            host: this.config.host,
            port: this.config.port,
            ssl: this.config.ssl,
            headers: headerJson
        });
        try {
            this.getCollection();
        } catch (e) {

        }
        // this.client.listCollections().then((collections)=>{
        //     logPush("当前数据库中的collections: " + JSON.stringify(collections));
        // }).catch((e)=>{
        //     errorPush("连接ChromaDB失败。Connect to ChromaDB failed. " + e);
        // });
    }

    async getCollection() {
        if (this.collection) {
            return this.collection;
        }
        this.collection = await this.client.getOrCreateCollection({
            name: this.collectionName,
            configuration: {
                embeddingFunction: new MyEmbeddingFunction({
                    func: async (...args)=>{return await this.aiClientServiceDict.embedding.wrappedEmbeddings(...args)}
                })
            },
        });
        return this.collection;
    }

    async updateConfig(newConfig: ChromaDBConfig): Promise<void> {
        this.config = newConfig;

    }

    async _validateConfig(config: ChromaDBConfig, autoCheck: boolean=true): Promise<HealthCheckResult> {
        try {
            // 创建我们的collection
            await this.client.getOrCreateCollection({
                name: this.collectionName,
                configuration: {
                    embeddingFunction: new MyEmbeddingFunction({
                        func: async (...args)=>{return await this.aiClientServiceDict.embedding.wrappedEmbeddings(...args)}
                    })
                }
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
                message: "Chroma连接成功，但由于未配置嵌入模型，服务实际不可用。如需完整功能，建议配置聊天模型、嵌入模型、重排序模型，详见README.md。"
            }
        }
        return {
            available: true,
            connectivity: HealthStatus.HEALTHY,
            message: "Chroma连接成功"
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
        
        const promiseTask = [];
        // 处理不被包含在任何标题块下的内容
        if (firstHeadingBlockIndex >= 1 || firstHeadingBlockIndex === -1) {
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
            promiseTask.push(this.upsertSubHeadingContent(orphanBlocks, headingInfo, docId));
        }
        // 处理其他块
        // 以特定块为单位请求
        for (let headingInfo of headingLevelResult) {
            const childBlocks = await getChildBlocks(headingInfo.id);
            promiseTask.push(this.upsertSubHeadingContent(childBlocks, headingInfo, docId));
        }

        await Promise.all(promiseTask);
        return result;
    }

    async upsertSubHeadingContent(childBlocks: ChildBlockResponse[], parentHeadingInfo: HeadingInfo, docId: string): Promise<void> {
        const chunks = createChunks(childBlocks, parentHeadingInfo, docId, 900);
        const mainMetadatas = chunks.map(c => ({contentType: "original", ...c}));
        debugPush("单层级内容拆分后：", chunks);
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
            debugPush("由于未配置聊天模型，不进行摘要环节");
            return;
        }
        if (!this.config["useQuestionAbstract"]) {
            debugPush("由于未启用摘要，不进行摘要环节");
            return;
        }
        const docInfo = await getDocDBitem(docId);
        try {
            const questionPromises = mainContentList.map(content => this.aiClientServiceDict.chat.getAlternateTextQuestion(content, {
                "docTitle": docInfo.content,
                "parentHeading": parentHeadingInfo.content,
                "docHPath": docInfo.hpath
            }));
            const questionLists = await Promise.all(questionPromises);
            for (let i = 0; i < questionLists.length; i++) {
                const questions = questionLists[i];
                if (! (questions instanceof Array)) {
                    logPush("模型返回内容格式无效，跳过", questions);
                    continue;
                }
                const questionEmbeddings = await (this.aiClientServiceDict.embedding as IEmbeddingClient).wrappedEmbeddings(questions);
                const questionMetadatas = questions.map(q => ({...chunks[i], question: q, contentType: "question"}));
                debugPush("Quesiton内容", questions)
                await this.collection.upsert({
                    ids: questions.map((q, index) => `${chunks[i].ids}-question-${index}`),
                    metadatas: questionMetadatas,
                    embeddings: questionEmbeddings,
                    documents: Array(questions.length).fill(chunks[i].content)
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
        await this.getCollection();
        for (let chunk of filteredDoc) {
            await this.deleteDocuments([chunk.id]);
            await this.upsertSingleDocument(chunk.id);
        }
        // const docIdsToProcess = new Set<string>();

        // 如果块也认为是文档：
        // for (const chunk of chunks) {
        //     if (!quickCheckIsValidSiyuanId(chunk.id)) continue;
            
        //     if (chunk.type === "doc") {
        //         docIdsToProcess.add(chunk.id);
        //     } else if (chunk.type === "block" && chunk.parentId) {
        //         docIdsToProcess.add(chunk.parentId);
        //     }
        // }

        // // 每一个文档只执行一次
        // for (const docId of docIdsToProcess) {
        //     await this.upsertSingleDocument(docId);
        // }
    }

    async query(text: string): Promise<QueryResult[]> {
        await this.getCollection();

        const embeddings = await this.aiClientServiceDict.embedding.wrappedEmbeddings([text]);
        // 仅在ChromaCloud生效，暂时禁用
        // const searchFun = new Search()
        //     .rank(Knn({query: embeddings[0]}))
        //     .groupBy(new GroupBy(
        //         [K("block_ids")],
        //         new MinK([K.SCORE], 1)
        //     ))
        //     .limit(50)
        //     .select(K.DOCUMENT, K.METADATA);
        // const searchResponse = await this.collection.search(searchFun);
        // logPush("searchResult", searchResponse);
        let whereOption = undefined;
        if (!this.config.useQuestionAbstract) {
            whereOption = {};
            whereOption["contentType"] = "original";
        }
        const queryResult = await this.collection.query({
            queryEmbeddings: embeddings,
            where: whereOption
        });
        // 结果需要unique，保证一下id唯一
        debugPush("queryResult", queryResult);
        let finalResult: QueryResult[] = [];
        const seenIds = new Set<string>();

        for (let i = 0; i < queryResult.documents[0].length; i++) {
            const metadata = queryResult.metadatas[0][i];
            const currentIds = metadata["block_ids"] ?? [metadata["doc_id"]];
            // 去重
            if (currentIds && !seenIds.has(currentIds.toString())) {
                seenIds.add(currentIds.toString());
                finalResult.push({
                    "content": queryResult.documents[0][i],
                    "ids": currentIds as string[]
                });
            }
        }
        debugPush("query:FinalResult", finalResult);

        if (this.aiClientServiceDict.rerank == null || this.config["useRerankModel"] === false) {
            debugPush("unrerank", this.config, this.aiClientServiceDict);
            return finalResult;
        } else {
            try {
                const rerankIdxResult = await this.aiClientServiceDict.rerank.rerank({
                    "documents": finalResult.map(item => item.content),
                    "query": text
                });
                debugPush("rerankIdxResult", rerankIdxResult);
                return rerankIdxResult.map(item => finalResult[item.index]);
            } catch (err) {
                warnPush("重排序时发生错误", err, "回滚为重排前的结果");
                return finalResult;
            }
        }
    }

    async clearAll(): Promise<void> {
        // await this.request('/documents', { method: 'DELETE' });
        await this.client.deleteCollection({ name: this.collectionName});
        this.collection = null;
        this.collection = await this.getCollection();
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
        for (let id of docIds) {
            await this.collection.delete({ where: {
                "doc_id": id
            }});
        }
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