import { BaseAIClient, IChatClient, IEmbeddingClient, ChatCreateParams, EmbeddingCreateParams, RequestOptions } from "@/ai_client/index";
import { HealthStatus } from "@/constants";
import { debugPush, logPush } from "@/logger";
import { isValidStr } from "@/utils/commonCheck";
import OpenAI from 'openai';
import { jsonrepair } from 'jsonrepair';

export class OAIClient extends BaseAIClient implements IChatClient, IEmbeddingClient {
    protected oaiClient: OpenAI;
    protected isEmbeddingModel: boolean;

    constructor(baseUrl: string, apiKey?: string, otherArgs?: AIClientOtherConfigs, useAsEmbedding?: boolean) {
        super(baseUrl, apiKey, otherArgs);
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
        let { model, messages, ...restBody } = body;

        if (model == undefined) {
            model = this.otherArgs.modelName;
        }

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
    
    async wrappedEmbeddings(documents: string[]): Promise<number[][]> {
        if (documents.length === 0) return [];
        const { maxSingleCharacters, maxTotalCharacters, maxInputsCount, modelName } = this.otherArgs;
        let batches: string[][] = [];
        let currentBatch: string[] = [];
        let currentBatchChars = 0;

        for (const doc of documents) {
            if (maxSingleCharacters >= 0 && doc.length > maxSingleCharacters) {
                throw new Error(`[嵌入内容超长]输入的文档中，部分文档长度(${doc.length})超出限制(${maxSingleCharacters})`);
            }

            const isCharLimitReached = maxTotalCharacters > 0 && (currentBatchChars + doc.length > maxTotalCharacters);
            const isCountLimitReached = maxInputsCount > 0 && (currentBatch.length >= maxInputsCount);

            if ((isCharLimitReached || isCountLimitReached) && currentBatch.length > 0) {
                batches.push(currentBatch);
                currentBatch = [];
                currentBatchChars = 0;
            }

            currentBatch.push(doc);
            currentBatchChars += doc.length;
        }

        if (currentBatch.length > 0) {
            batches.push(currentBatch);
        }
        const promises = batches.map(batch => 
            this.embeddings({
                model: modelName,
                input: batch,
            })
        );
        const results = await Promise.all(promises);
        return results.flat();
    }

    async getAlternateTextQuestion(context: string): Promise<string[]> {
        const prompt = `由于用户在检索过程中可能给出的是自然语言的提问描述、关键内容描述而不一定是明确的查询关键词，我们计划在文本索引过程中考虑直接使用被检索内容的提问描述、关键内容描述。请你根据以下文本内容，提取出其中最能代表文本内容的提问描述、关键内容描述，要求简洁且具有代表性，输出格式为json数组，数组中每个元素是一个字符串，字符串内容是提取出的提问描述、关键内容描述：
文本内容：${context}
输出：`;
        const response = await this.chat({
            model: this.otherArgs.modelName ?? "",
            messages: [
                { role: "user", content: prompt }
            ]
        });
        // 假设 response 是一个包含 JSON 数组的字符串
        try {
            const parsed = JSON.parse(jsonrepair(response));
            if (Array.isArray(parsed)) {
                return parsed;
            } else {
                throw new Error("Unexpected response format");
            }
        } catch (error) {
            logPush("Error parsing alternate text questions", error);
            throw new Error("Failed to parse alternate text questions");
        }
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