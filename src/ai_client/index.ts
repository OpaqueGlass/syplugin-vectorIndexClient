import { warnPush } from "@/logger";
import { HealthStatus } from "@/constants";

// --- 基础类型定义 ---

export interface SimpleMessage {
    role: "user" | "assistant" | "system";
    content: string;
    type?: string;
}

export interface RequestOptions {
    timeout?: number;
    headers?: Record<string, string>;
    signal?: AbortSignal;
}

export interface ChatCreateParams {
    model: string;
    messages: SimpleMessage[];
    temperature?: number;
    stream?: boolean;
    max_tokens?: number;
    [key: string]: any; // 允许透传供应商特定参数
}

export interface EmbeddingCreateParams {
    model: string;
    input: string | string[];
    dimensions?: number;
    user?: string;
}

export interface RerankCreateParams {
    model: string;
    query: string;
    documents: string[];
    top_n?: number;
}

export interface IBaseClient {
    readonly baseUrl: string;
    readonly apiKey?: string;
    readonly supportsCustomHeaders: boolean;
    setHeaders(headers: Record<string, string>): void;
    checkConnection(args: CheckConnectionArgs): Promise<HealthCheckResult>;
}

export interface IChatClient extends IBaseClient {
    chat(body: ChatCreateParams, options?: RequestOptions): Promise<string>;
}

export interface IEmbeddingClient extends IBaseClient {
    embeddings(body: EmbeddingCreateParams, options?: RequestOptions): Promise<number[][]>;
}

export interface IRerankClient extends IBaseClient {
    rerank(body: RerankCreateParams, options?: RequestOptions): Promise<string[]>;
}

export abstract class BaseAIClient implements IBaseClient {
    protected headers: Record<string, string> = {};
    
    constructor(
        public readonly baseUrl: string, 
        public readonly apiKey?: string
    ) {
        if (apiKey) {
            this.headers["Authorization"] = `Bearer ${apiKey}`;
        }
    }

    abstract get supportsCustomHeaders(): boolean;

    setHeaders(headers: Record<string, string>): void {
        if (!this.supportsCustomHeaders) {
            warnPush(`${this.constructor.name} does not support custom headers.`);
            return;
        }
        this.headers = { ...this.headers, ...headers };
    }
    async checkConnection(args: CheckConnectionArgs): Promise<HealthCheckResult> {
        return { available: false, message: "checkConnection not implemented", connectivity: HealthStatus.UNKNOWN_ERROR };
    }
}