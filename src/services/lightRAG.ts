import { HealthStatus } from "@/constants";
import { UpsertError } from "@/exceptions/upsertError";
import { errorPush, logPush } from "@/logger";
import { generateUUID } from "@/utils/common";
import { isValidStr, quickCheckIsValidSiyuanId } from "@/utils/commonCheck";
import { JSONStorage } from "@/utils/jsonStorageUtil";

interface LightRAGConfig {
    baseUrl: string;
    apiKey?: string;
    topK: number;
    mode: 'local' | 'global' | 'hybrid' | 'naive' | 'mix' | 'bypass';
}

interface LightRAGData {
    idMap: Record<string, string>; // 本地 ID 到 LightRAG 文档 ID 的映射
}

export class LightRAGService implements IVectorStoreService<LightRAGConfig> {
    private config: LightRAGConfig;
    private storage: JSONStorage<LightRAGData> | null = null;
    private retryCounts: Record<string, number> = {};

    static manifest: ServiceManifest = {
        id: 'lightRAG',
        name: 'LightRAG Server',
        description: 'Retrieval-Augmented Generation with graph support.',
        capabilities: { requiresExternalEmbedding: false },
        configSchema: [
            {
                key: 'baseUrl',
                label: 'Server URL',
                type: 'string',
                required: true,
                defaultValue: 'http://localhost:9600',
            },
            {
                key: 'apiKey',
                label: 'API Key',
                type: 'password',
                required: false,
                description: 'API Key for header authentication (if enabled).'
            },
            {
                key: 'mode',
                label: 'Query Mode',
                type: 'select',
                defaultValue: 'mix',
                options: [
                    'mix', 'local', 'global', 'hybrid', 'naive'
                ]
            },
            {
                key: 'topK',
                label: 'Top-K Entities/Relations',
                type: 'number',
                defaultValue: 5
            }
        ]
    };

    getConfig() {
        return this.config;
    }

    setAIClientDict(embeddingService: any): void {
        // 由LightRAG server设定，此处不使用
    }

    constructor() {
        this.config = { baseUrl: '', topK: 5, mode: 'mix' };
        this.storage = new JSONStorage<LightRAGData>('lightRAG_storage.json', {
            idMap: {}
        });
    }

    async initialize(config: LightRAGConfig): Promise<void> {
        this.config = config;
        this.config.baseUrl = this.config.baseUrl?.replace(/\/$/, '') || '';
    }

    async updateConfig(newConfig: LightRAGConfig): Promise<void> {
        this.config = newConfig;
        this.config.baseUrl = this.config.baseUrl?.replace(/\/$/, '') || '';
    }

    /**
     * 通用的 fetch 请求包装
     */
    private async request(path: string, options: RequestInit = {}) {
        const url = `${this.config.baseUrl}${path}`;
        const headers = new Headers(options.headers);
        
        headers.set('Content-Type', 'application/json');
        
        if (this.config.apiKey) {
            headers.set('X-API-Key', this.config.apiKey);
        }

        const response = await fetch(url, { ...options, headers });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`LightRAG API Error: ${response.status} ${errorData.detail || response.statusText}`);
        }

        return response.json();
    }

    async validateConfig(config: LightRAGConfig): Promise<HealthCheckResult> {
        try {
            const url = `${config.baseUrl}/health`;
            const headers: Record<string, string> = {};
            if (config.apiKey) {
                headers['X-API-Key'] = config.apiKey;
            }

            const response = await fetch(url, { 
                method: 'GET', 
                headers,
                signal: AbortSignal.timeout(5000) 
            });

            if (!response.ok) {
                return {
                    available: false,
                    connectivity: HealthStatus.UNREACHABLE,
                    message: `Service unreachable (HTTP ${response.status})`
                };
            }
            // health接口不处理鉴权错误，所以这里额外发一个请求来验证API Key的正确性
            const authUrl = `${config.baseUrl}/documents/paginated`;
            const authRes = await fetch(authUrl, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({
                    page: 1,
                    page_size: 1, // 仅测试鉴权，最小化数据传输
                    status_filter: "PROCESSED"
                }),
                signal: AbortSignal.timeout(5000)
            });
            if (authRes.status === 401 || authRes.status === 403) {
                const data = await authRes.json();
                return {
                    available: false,
                    connectivity: HealthStatus.API_KEY_ERROR,
                    message: "鉴权失败：API密钥无效或不具有权限。" + data["detail"] 
                };
            }
            
            // 3. 处理成功的响应并检查业务逻辑状态
            const data = await response.json();
            const isHealthy = data.status === 'healthy';

            return {
                available: isHealthy,
                connectivity: isHealthy ? HealthStatus.HEALTHY : HealthStatus.UNHEALTHY,
                message: data["detail"] || (isHealthy ? 'Service is healthy' : 'Service reported unhealthy status')
            };

        } catch (e: any) {
            let status = HealthStatus.UNKNOWN_ERROR;
            let msg = e.message || String(e);

            if (e.name === 'AbortError') {
                status = HealthStatus.UNREACHABLE;
                msg = "连接超时（>5秒）";
            }

            return {
                available: false,
                connectivity: status,
                message: `请检查baseUrl配置是否正确: ${msg}`
            };
        }
    }

    async healthCheck(): Promise<HealthCheckResult> {
        return await this.validateConfig(this.config);
    }

    /**
     * 处理单条数据的上传，包含冲突删除重试逻辑
     */
    async upsertSingle(content: string, sourceId: string): Promise<any> {
        const payload = {
            text: content,
            file_source: sourceId
        };

        let result = await this.request('/documents/text', {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        // 重复条目先删除，然后重试一次
        if (result["status"] === "duplicated") {
            logPush(`ID ${sourceId} conflict detected, retrying after deletion...`);
            await this.deleteDocuments([sourceId]);
            
            result = await this.request('/documents/text', {
                method: 'POST',
                body: JSON.stringify(payload)
            });
        }
        // 确认结果
        if (result["status"] !== "success") {
            this.retryCounts[sourceId] = this.retryCounts[sourceId] ? this.retryCounts[sourceId] + 1 : 1;
            throw new UpsertError({
                message: `Failed to upsert document with sourceId ${sourceId}: ${result["message"] || "Unknown error"}`,
                ids: [sourceId],
                retryable: result["status"] === "duplicated",
                retryCount: this.retryCounts[sourceId]
            });
        }
        const trackId = result["track_id"];
        const trackStatus = await this.getTrackStatus(trackId);
        if (trackStatus["documents"] && trackStatus["documents"].length !== 1) {
            throw new Error(`Unexpected track status for trackId ${trackId}: expected 1 document, got ${trackStatus["documents"].length}`);
        }

        // WARN: 这里有潜在并发问题
        if (this.storage) {
            const data = await this.storage.get("idMap") || {};
            data[sourceId] = trackStatus["documents"][0]["id"];
            this.storage.set("idMap", data);
        }
        delete this.retryCounts[sourceId];
        return result;
    }

    async getTrackStatus(trackId: string): Promise<any> {
        const result = await this.request(`/documents/track_status/${trackId}`, {
            method: 'GET'
        });
        return result;
    }

    async upsert(chunks: VectorChunk[]): Promise<void> {
        const filtered = chunks.filter(c => 
            c.type === "doc" && quickCheckIsValidSiyuanId(c.id)
        );

        for (const chunk of filtered) {
            try {
                const sourceId = chunk.id || 'random' + generateUUID();
                // WARN: 这里暂时不能改成并发，upsertSingle缓存了id映射，但映射都是写入同一个文件，可能覆盖丢失
                await this.upsertSingle(chunk.content, sourceId);
            } catch (error) {
                if (error instanceof UpsertError && error.retryable) {
                    logPush(`Upsert failed for chunk ${chunk.id} with retryable error: ${error.message}. Retry count: ${error.retryCount}`);
                } else {
                    errorPush(`Error processing chunk ${chunk.id}:`, error);
                }
                throw error; // 上层会捕获并记录失败的文档
            }
        }
    }

    async query(text: string): Promise<QueryResult[]> {
        const payload = {
            query: text,
            mode: this.config.mode,
            top_k: this.config.topK,
            stream: false,
            include_references: true
        };

        const data = await this.request('/query', {
            method: 'POST',
            body: JSON.stringify(payload)
        });

        return [{
            "content": data.response,
            "ids": data.references.filter(ref => quickCheckIsValidSiyuanId(ref.file_path)).map((ref: any) => ref.file_path)
        }];
    }

    async clearAll(): Promise<void> {
        await this.request('/documents', { method: 'DELETE' });
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
        const idMap = await this.storage?.get("idMap") || {};
        const lightRagDocIds = docIds.map(id => idMap[id]).filter(isValidStr);
        if (lightRagDocIds.length === 0) {
            logPush(`No valid LightRAG document IDs found for deletion, skipping.`);
            return;
        }
        await this.request('/documents/delete_document', {
            method: 'DELETE',
            body: JSON.stringify({
                doc_ids: lightRagDocIds,
                delete_file: true,      // 同时删除输入目录下的物理文件
                delete_llm_cache: true  // 清除该文档相关的 LLM 提取缓存
            })
        });
    }

    /**
     * 获取服务类型标识
     * search 主要提供向量检索服务
     * qa 提供问答服务，返回的内容是llm给出的回答而不是原文内容
     */
    getQueryType(): ServiceQueryType {
        return "qa"
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
        await this.request("/documents/reprocess_failed", {
            method: "POST"
        });
    }
}