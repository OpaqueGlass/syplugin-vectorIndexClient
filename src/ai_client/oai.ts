import { BaseAIClient, IChatClient, IEmbeddingClient, ChatCreateParams, EmbeddingCreateParams, RequestOptions } from "@/ai_client/index";
import { HealthStatus } from "@/constants";
import { debugPush, logPush } from "@/logger";
import { isValidStr } from "@/utils/commonCheck";
import OpenAI from 'openai';


export class OAIClient extends BaseAIClient implements IChatClient, IEmbeddingClient {
    protected oaiClient: OpenAI;
    protected isEmbeddingModel: boolean;

    constructor(baseUrl: string, apiKey?: string, useAsEmbedding?: boolean) {
        super(baseUrl, apiKey);
        this.oaiClient = new OpenAI({
            baseURL: baseUrl,
            apiKey: apiKey ?? "",
            defaultHeaders: this.headers
        });
        this.isEmbeddingModel = useAsEmbedding;
    }

    /**
     * 实现 IChatClient
     * 显式从 body 中结构参数，保持 options 独立
     */
    async chat(body: ChatCreateParams, options?: RequestOptions): Promise<string> {
        // 解构出原本需要的参数
        const { model, messages, ...restBody } = body;

        const response = await this.oaiClient.chat.completions.create({
            model: model,
            messages: messages,
            stream: false,
            ...restBody // 其他如 temperature, stream 等参数
        }) as OpenAI.Chat.ChatCompletion;
        if (response["choices"] && response["choices"].length > 0) {
            return response.choices[0]?.message?.content ?? "";
        } else {
            logPush("API ERROR", response);
            throw new Error(`API Reponse format Unsupported. The response is '${response}`);
        }
    }

    /**
     * 实现 IEmbeddingClient
     */
    async embeddings(body: EmbeddingCreateParams, options?: RequestOptions): Promise<number[][]> {
        const { model, input, dimensions, ...restBody } = body;

        const response = await this.oaiClient.embeddings.create({
            model: model,
            input: input,
            dimensions: dimensions,
            ...restBody
        }, options);

        return response.data.map(item => item.embedding);
    }

    get supportsCustomHeaders(): boolean {
        return true;
    }

    // 考虑到你之前的代码里有 this.header.Authorization，
    // 如果基类定义的属性名是 headers (复数)，请注意对齐
    setHeaders(headers: Record<string, string>): void {
        super.setHeaders(headers);
        this.oaiClient = new OpenAI({
            baseURL: this.baseUrl,
            apiKey: this.apiKey,
            defaultHeaders: this.headers
        });
    }

    async checkConnection(args: CheckConnectionArgs): Promise<HealthCheckResult> {
        const { modelName } = args;
        if (!this.isEmbeddingModel) {
            try {
                const result = await this.chat({
                    "model": modelName,
                    "messages": [
                        {
                            "role": "system",
                            "content": "You are helpful assistant."
                        }, {
                            "role": "user",
                            "content": "If you can hear me, response 'Connected'."
                        }
                    ]
                });
                debugPush("checkConnection Response", result);
                if (isValidStr(result)) {
                    return {
                        available: true,
                        connectivity: HealthStatus.HEALTHY,
                        message: result
                    };
                } else {
                    return {
                        available: false,
                        connectivity: HealthStatus.UNHEALTHY,
                        message: "Connection check failed, no valid response received."
                    }
                }
            } catch (err) {
                logPush("checkConnection", err);
                return {
                    available: false,
                    connectivity: err.message.includes("401") ? HealthStatus.API_KEY_ERROR : HealthStatus.UNREACHABLE,
                    message: `Connection check failed with error: ${err.message}`
                }
            }
        }

        try {
            const result = await this.embeddings({
                "model": modelName,
                "input": "Test Embedding Sentence"
            });
            debugPush("checkConnection Response", result);
            if (result) {
                return {
                    available: true,
                    connectivity: HealthStatus.HEALTHY
                };
            } else {
                return {
                    available: false,
                    connectivity: HealthStatus.UNHEALTHY
                }
            }
        } catch (err) {
            logPush("checkConnection Failed", err);
            return {
                available: false,
                connectivity: HealthStatus.UNKNOWN_ERROR
            }
        }
    }
}