import { BaseAIClient, IRerankClient, RerankCreateParams, RequestOptions } from "@/ai_client/index";
import { HealthStatus } from "@/constants";
import { debugPush, logPush } from "@/logger";
import { isValidStr } from "@/utils/commonCheck";

export class QwenRerankClient extends BaseAIClient implements IRerankClient {

    constructor(baseUrl: string, apiKey?: string, otherArgs?: AIClientOtherConfigs) {
        super(baseUrl, apiKey, otherArgs);
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
    async rerank(body: RerankCreateParams, options?: RequestOptions): Promise<AIRerankResult[]> {
        let { model, query, documents, top_n, ...restBody } = body;
        model = model ?? this.otherArgs["modelName"];

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
            .map((item: any) => ({ index: item.index, relevance_score: item.relevance_score }));
        return rankedCandidates;
    }

    get supportsCustomHeaders(): boolean {
        return true;
    }

    async checkConnection(args: CheckConnectionArgs): Promise<HealthCheckResult> {
        const { modelName } = args;
        try {
            const result = await this.rerank({
                "model": modelName,
                "documents": ["Bonjor", "Hello", "你好"],
                "query": "“你好”用英文怎么说？",
                "top_n": 2
            });
            debugPush("checkConnection Result", result);
            if (result) {
                return {
                    available: true,
                    connectivity: HealthStatus.HEALTHY,
                    message: "Service Operation Normally. Test Response: " + result,
                }
            } else {
                return {
                    available: false,
                    connectivity: HealthStatus.UNHEALTHY,
                    message: "Connection check failed, no valid response received."
                }
            }
        } catch (err) {
            logPush("checkConnection Error", err);
            return {
                available: false,
                message: `Connection check failed: ${err instanceof Error ? err.message : String(err)}`,
                connectivity: HealthStatus.UNREACHABLE
            }
        }
    }
}