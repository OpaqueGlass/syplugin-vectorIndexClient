export class CONSTANTS {
    public static readonly STYLE_ID: string = "vector-index-client-plugin-style";
    public static readonly PLUGIN_SHORT_NAME: string = "vic";
    public static readonly PLUGIN_FULL_NAME: string = "向量索引客户端";
    public static readonly PLUGIN_DATA_SAVEPATH: string = "/data/storage/petal/syplugin-vectorIndexClient/";
    public static readonly FILTER_MIN_CHAR: number = 5;
}

export class INDEXER_CONSTANTS {
    public static readonly LIGHTRAG: string = "lightRAG";
    public static readonly CHROMA: string = "chroma";
}

export enum HealthStatus {
    HEALTHY = "healthy", // 连接，且正常
    UNHEALTHY = "unhealthy", // 连接，但不正常
    API_KEY_ERROR = "apiKeyError", // API 密钥错误
    UNREACHABLE = "unreachable", // 无法连接
    UNKNOWN_ERROR = "unknownError"
}