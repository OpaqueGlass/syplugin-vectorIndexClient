// 1. 定义配置项描述 (保持不变)
export type ConfigFieldType = 'string' | 'number' | 'boolean' | 'password' | 'select';

export interface ServiceManifest {
  id: string;
  name: string;
  description: string;
  configSchema: ConfigField[];
  capabilities: {
    requiresExternalEmbedding: boolean;
  };
}

export interface ConfigField {
  key: string;
  label: string;
  type: ConfigFieldType;
  required?: boolean;
  defaultValue?: any;
  placeholder?: string;
  options?: string[];
  description?: string;
}

// --- 新增：业务数据结构定义 ---

/**
 * upsert 输入的元素格式
 */
export interface VectorChunk {
  id: string;
  path: string;
  parentId: string;
  type: string;
  content: string; // 通常需要包含实际内容以便索引
}

/**
 * query 返回的元素格式
 */
export interface QueryResult {
  id: string;
  content: string;
}

/**
 * delete 指定的删除目标
 */
export interface DeleteTarget {
  docId: string;
  blockId: string[]; // 指定文档下需要删除的块 ID 数组
}

export interface IVectorStoreService<TConfig = any> {
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
   * 获取当前生效的配置快照 (可选保留)
   */
  getConfig(): TConfig;
}