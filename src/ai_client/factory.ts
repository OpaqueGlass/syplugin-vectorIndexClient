import { IChatClient, IEmbeddingClient, IRerankClient } from ".";
import { OAIClient } from "./oai";
import { CohereRerankClient } from "./rerankCohere";
import { QwenRerankClient } from "./rerankQwen";

export class AIClientFactory {
    private static rerankClientMap: Record<string, new (url: string, key?: string, otherArgs?: AIClientOtherConfigs) => IRerankClient> = {
        "qwen": QwenRerankClient as any,
        "cohere": CohereRerankClient as any
    };

    private static embeddingClientMap: Record<string, new (url: string, key?: string, otherArgs?: AIClientOtherConfigs, useAsEmbedding?: boolean) => IEmbeddingClient> = {
        "oai": OAIClient as any
    };

    private static chatClientMap: Record<string, new (url: string, key?: string, otherArgs?: AIClientOtherConfigs) => IChatClient> = {
        "oai": OAIClient as any
    };

    static getClient(modelType:string, type:string, baseUrl: string, apiKey?:string, otherArgs?: AIClientOtherConfigs): IChatClient | IEmbeddingClient | IRerankClient | null {
        switch (modelType.toLowerCase()) {
            case "chat":
                return this.getChatClient(type, baseUrl, apiKey, otherArgs);
            case "embedding":
                return this.getEmbeddingClient(type, baseUrl, apiKey, otherArgs);
            case "rerank":
                return this.getRerankClient(type, baseUrl, apiKey, otherArgs);
            default:
                return null;
        }
    }

    static getChatClient(type: string, baseUrl: string, apiKey?: string, otherArgs?: AIClientOtherConfigs): IChatClient | null {
        const ClientClass = this.chatClientMap[type.toLowerCase()];
        return ClientClass ? new ClientClass(baseUrl, apiKey, otherArgs) : null;
    }

    static getEmbeddingClient(type: string, baseUrl: string, apiKey?: string, otherArgs?: AIClientOtherConfigs): IEmbeddingClient | null {
        const ClientClass = this.embeddingClientMap[type.toLowerCase()];
        return ClientClass ? new ClientClass(baseUrl, apiKey, otherArgs, true) : null;
    }

    static getRerankClient(type: string, baseUrl: string, apiKey?: string, otherArgs?: AIClientOtherConfigs): IRerankClient | null {
        const ClientClass = this.rerankClientMap[type.toLowerCase()];
        return ClientClass ? new ClientClass(baseUrl, apiKey, otherArgs) : null;
    }
}