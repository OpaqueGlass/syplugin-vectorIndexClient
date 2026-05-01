import { BaseAIClient, IRerankClient, RerankCreateParams, RequestOptions } from "@/ai_client/index";
import { isValidStr } from "@/utils/commonCheck";

export class CohereRerankClient extends BaseAIClient implements IRerankClient {

    constructor(baseUrl: string, apiKey?: string) {
        const sanitizedBaseUrl = baseUrl.replace(/\/+$/, '');
        super(sanitizedBaseUrl, apiKey);
    }

    /**
     * 内部私有请求方法
     * 整合了基类的 headers 和 options 传入的 headers
     */
    private async wrappedPost(url: string, body: any, options?: RequestOptions) {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': isValidStr(this.apiKey) ? `Bearer ${this.apiKey}` : undefined,
                ...this.headers,           // 基类的默认 headers (含 Auth)
                ...(options?.headers || {}) // 用户临时传入的 headers
            },
            body: JSON.stringify(body),
            signal: options?.signal,       // 支持取消请求
        });

        if (!response.ok) {
            throw new Error(`Cohere Rerank API Error: ${response.statusText}`);
        }

        return response.json();
    }

    /**
     * 实现 IRerankClient 接口
     * @param body 包含 model, query, documents (candidates), top_n (topK)
     * @param options 可选的请求配置
     */
    async rerank(body: RerankCreateParams, options?: RequestOptions): Promise<string[]> {
        const { model, query, documents, top_n, ...rest } = body;

        const requestBody = {
            model: model,
            query: query,
            documents: documents,
            top_n: top_n,
            ...rest
        };
        const response = await this.wrappedPost(`${this.baseUrl}`, requestBody, options);

        const rankedCandidates = response.results
            .sort((a: any, b: any) => b.relevance_score - a.relevance_score) // 降序排列
            .map((result: any) => documents[result.index]);

        return rankedCandidates;
    }

    async checkConnection(): Promise<HealthCheckResult> {
        
        return null;
    }

    get supportsCustomHeaders(): boolean {
        return true;
    }
}