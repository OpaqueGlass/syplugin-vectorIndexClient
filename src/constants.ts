export class CONSTANTS {
    public static readonly STYLE_ID: string = "vector-index-client-plugin-style";
    public static readonly PLUGIN_SHORT_NAME: string = "vic";
    public static readonly PLUGIN_FULL_NAME: string = "向量索引客户端";
    public static readonly PLUGIN_DATA_SAVEPATH: string = "/data/storage/petal/syplugin-vectorIndexClient/";
    public static readonly FILTER_MIN_CHAR: number = 5;
}

export const DEFAULT_QUESITON_ABSTRUCT_PROMPT = `# Role
你是一个高级文档索引专家，擅长将技术文档转化为高质量的语义搜索向量。

# Task
请根据提供的【文本内容】，生成 3-5 条能够精准覆盖该内容的“潜在提问描述”或“关键内容概括”。

# Generation Requirements
1. **完整性**：每条描述必须包含核心动作和完整的主体对象。
2. **场景化**：模仿用户在搜索时的自然语言习惯。
3. **区分度**：避免使用“什么是请求体”、“参数是什么”等过于泛化的提问或概述。必须体现出该文本特有的信息，能够反映所在文档或对应小节的描述对象。
4. **输出格式**：严格输出 JSON 字符串数组。

# Constraint
- 禁止生成低于 10 个字符的超短描述。
- 禁止使用“本文介绍了...”等废话前缀。
- 生成的描述或概括必须与待处理文本的语言一致。

# 文本所在文档信息
文档名称：{docTitle}
对应小节标题名称：{parentHeading}
文档所在路径：{docHPath}

# 待处理文本：
{context}`;

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