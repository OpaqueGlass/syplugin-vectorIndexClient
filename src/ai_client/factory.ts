import { IChatClient, IEmbeddingClient, IRerankClient } from ".";
import { OAIClient } from "./oai";
import { CohereRerankClient } from "./rerankCohere";
import { QwenRerankClient } from "./rerankQwen";

export class AIClientFactory {
    private static rerankClientMap: Record<string, new (url: string, key?: string) => IRerankClient> = {
        "qwen": QwenRerankClient as any,
        "cohere": CohereRerankClient as any
    };

    private static embeddingClientMap: Record<string, new (url: string, key?: string, useAsEmbedding?: boolean) => IEmbeddingClient> = {
        "oai": OAIClient as any
    };

    private static chatClientMap: Record<string, new (url: string, key?: string) => IChatClient> = {
        "oai": OAIClient as any
    };

    static getChatClient(type: string, baseUrl: string, apiKey?: string): IChatClient | null {
        const ClientClass = this.chatClientMap[type.toLowerCase()];
        return ClientClass ? new ClientClass(baseUrl, apiKey) : null;
    }

    static getEmbeddingClient(type: string, baseUrl: string, apiKey?: string): IEmbeddingClient | null {
        const ClientClass = this.embeddingClientMap[type.toLowerCase()];
        return ClientClass ? new ClientClass(baseUrl, apiKey, true) : null;
    }

    static getRerankClient(type: string, baseUrl: string, apiKey?: string): IRerankClient | null {
        const ClientClass = this.rerankClientMap[type.toLowerCase()];
        return ClientClass ? new ClientClass(baseUrl, apiKey) : null;
    }
}