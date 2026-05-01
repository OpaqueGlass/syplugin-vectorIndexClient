import { BaseAIClient, IChatClient, IEmbeddingClient, ChatCreateParams, EmbeddingCreateParams, RequestOptions } from "@/ai_client/index";
import OpenAI from 'openai';


export class OAIClient extends BaseAIClient implements IChatClient, IEmbeddingClient {
    protected oaiClient: OpenAI;

    constructor(baseUrl: string, apiKey?: string) {
        super(baseUrl, apiKey);
        this.oaiClient = new OpenAI({
            baseURL: baseUrl,
            apiKey: apiKey ?? "",
            defaultHeaders: this.headers
        });
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

        return response.choices[0]?.message?.content ?? "";
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
}