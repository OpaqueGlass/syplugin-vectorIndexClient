interface QueueDocIdItem {
    id: string;
}

type ConfigFieldType = 'string' | 'number' | 'boolean' | 'password' | 'select';

interface ServiceManifest {
  id: string;
  name: string;
  description: string;
  configSchema: ConfigField[];
  capabilities: {
    requiresExternalEmbedding: boolean;
  };
}

interface ConfigField {
  key: string;
  label: string;
  type: ConfigFieldType;
  required?: boolean;
  defaultValue?: any;
  placeholder?: string;
  options?: string[];
  description?: string;
}

/**
 * upsert 输入的元素格式
 */
interface VectorChunk {
  id: string;
  path: string;
  parentId: string;
  type: "doc"|"block";
  content: string;
}

/**
 * query 返回的元素格式
 */
interface QueryResult {
  ids?: string[];
  content: string;
}

/**
 * delete 指定的删除目标
 */
interface DeleteTarget {
  docId: string;
  blockId?: string[]; // 指定文档下需要删除的块 ID 数组
}

interface IndexStatus {
  isSupportGetStatus: boolean;
  failedDocs: number;
  failedReason: string;
  pendingDocs: number;
}

interface IVectorStoreService<TConfig = any> {
  /**
   * 初始化服务
   */
  initialize(config: TConfig): Promise<void>;

  setEmbeddingService(embeddingService: any): void;

  /**
   * 动态更新配置 (热更新或重连)
   */
  updateConfig(newConfig: TConfig): Promise<void>;

  /**
   * 验证配置是否有效 (例如测试 API 连通性)
   */
  validateConfig(config: TConfig): Promise<boolean>;

  /**
   * 获取当前服务状态
   */
  healthCheck(): Promise<boolean>;

  /**
   * 插入或更新向量数据
   * @param chunks 包含 id, path, parentId, type, content 的数组
   */
  upsert(chunks: VectorChunk[]): Promise<void>;

  /**
   * 向量检索
   * @returns 返回包含 id 和 content 的数组
   */
  query(text: string): Promise<QueryResult[]>;

  /**
   * 批量删除数据
   * @param targets 格式为 [{"docId": string, "blockId": string[]}]
   */
  delete(targets: DeleteTarget[]): Promise<void>;

  /**
   * 获取当前生效的配置快照
   */
  getConfig(): TConfig;

  /**
   * 获取服务类型标识
   * search 主要提供向量检索服务
   * qa 提供问答服务，返回的内容是llm给出的回答而不是原文内容
   */
  getQueryType(): "search"|"qa";

  /**
   * 获取索引状态，包括是否支持获取状态、失败的文档数量和原因、待处理的文档数量等信息
   */
  async getIndexStatus(): Promise<IndexStatus>;

  /**
   * 重新处理索引失败的文档，通常在用户修复了导致索引失败的问题后调用
   */
  async reprocessFailed(): Promise<void>;
}

interface ServiceResult {
    serviceId: string;
    status: 'fulfilled' | 'rejected';
    reason?: any; // 失败时的错误信息
}

interface MultiServiceResponse {
    total: number;
    successCount: number;
    failCount: number;
    details: ServiceResult[];
}