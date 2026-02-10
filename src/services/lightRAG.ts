import { quickCheckIsValidSiyuanId } from "@/utils/commonCheck";

interface LightRAGConfig {
    baseUrl: string;
    apiKey?: string;
    topK: number;
    mode: 'local' | 'global' | 'hybrid' | 'naive' | 'mix' | 'bypass';
}

export class LightRAGService implements IVectorStoreService<LightRAGConfig> {
    private config: LightRAGConfig;

    static manifest: ServiceManifest = {
        id: 'lightrag',
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

    setEmbeddingService(embeddingService: any): void {
        // 由LightRAG server设定，此处不使用
    }

    constructor() {
        this.config = { baseUrl: '', topK: 5, mode: 'mix' };
    }

    async initialize(config: LightRAGConfig): Promise<void> {
        this.config = config;
        this.config.baseUrl = this.config.baseUrl.replace(/\/$/, '');
    }

    async updateConfig(newConfig: LightRAGConfig): Promise<void> {
        this.config = newConfig;
        this.config.baseUrl = this.config.baseUrl.replace(/\/$/, '');
    }

    /**
     * 通用的 fetch 请求包装
     */
    private async request(path: string, options: RequestInit = {}) {
        const url = `${this.config.baseUrl}${path}`;
        const headers = new Headers(options.headers);
        
        headers.set('Content-Type', 'application/json');
        
        // --- 修正点：使用 X-API-Key 字段 ---
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

    async validateConfig(config: LightRAGConfig): Promise<boolean> {
        try {
            const url = `${config.baseUrl}/health`;
            // 验证时也需要带上 Key
            const headers: Record<string, string> = {};
            if (config.apiKey) {
                headers['X-API-Key'] = config.apiKey;
            }

            const response = await fetch(url, { 
                method: 'GET', 
                headers,
                signal: AbortSignal.timeout(5000) 
            });
            const data = await response.json();
            return response.ok && data.status === 'healthy';
        } catch (e) {
            return false;
        }
    }

    async upsert(chunks: VectorChunk[]): Promise<void> {
        const filtered = chunks.filter(c => c.type === "doc" && quickCheckIsValidSiyuanId(c.id));
        const payload = {
            texts: filtered.map(c => c.content),
            file_sources: filtered.map(c => c.id || 'vite-plugin-note')
        };

        await this.request('/documents/texts', {
            method: 'POST',
            body: JSON.stringify(payload)
        });
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
            "ids": data.references.filter(ref => quickCheckIsValidSiyuanId(ref)).map((ref: any) => ref.file_path)
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
        await this.request('/documents/delete_document', {
            method: 'DELETE',
            body: JSON.stringify({
                doc_ids: docIds,
                delete_file: true,      // 同时删除输入目录下的物理文件
                delete_llm_cache: true  // 清除该文档相关的 LLM 提取缓存
            })
        });
    }
}