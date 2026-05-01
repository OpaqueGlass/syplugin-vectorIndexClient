import { BaseAIClient, IRerankClient, RerankCreateParams, RequestOptions } from "@/ai_client/index";
import { isValidStr } from "@/utils/commonCheck";

export class QwenRerankClient extends BaseAIClient implements IRerankClient {

    constructor(baseUrl: string, apiKey?: string) {
        super(baseUrl, apiKey);
    }

    /**
     * 内部私有请求方法
     */
    private async wrappedPost(url: string, body: any, options?: RequestOptions) {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': isValidStr(this.apiKey) ? `Bearer ${this.apiKey}` : undefined,
                ...this.headers,            // 包含基类的 Authorization
                ...(options?.headers || {})  // 合并来自 options 的自定义 header
            },
            body: JSON.stringify(body),
            signal: options?.signal         // 支持取消请求
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`Qwen Rerank API Error: ${response.status} ${JSON.stringify(errorData)}`);
        }

        return response.json();
    }

    /**
     * 实现 IRerankClient 接口
     * @param body 包含 model, query, documents, top_n
     * @param options 可选请求配置
     */
    async rerank(body: RerankCreateParams, options?: RequestOptions): Promise<string[]> {
        const { model, query, documents, top_n, ...restBody } = body;

        // qwen格式
        const requestBody = {
            model: model,
            input: {
                query: query,
                documents: documents
            },
            params: {
                top_n: top_n,
                ...restBody
            }
        };

        const targetUrl = this.baseUrl;
        const response = await this.wrappedPost(targetUrl, requestBody, options);

        if (!response.output || !response.output.results) {
            return [];
        }

        const rankedCandidates = response.output.results
            .sort((a: any, b: any) => b.relevance_score - a.relevance_score) // 降序排列
            .map((result: any) => documents[result.index]);

        return rankedCandidates;
    }

    get supportsCustomHeaders(): boolean {
        return true;
    }
}