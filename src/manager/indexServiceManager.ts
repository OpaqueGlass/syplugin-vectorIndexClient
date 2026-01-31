// vectorManager.ts

export class VectorServiceManager {
    private services: Map<string, IVectorStoreService> = new Map();

    /**
     * 注册并初始化一个新的服务
     */
    async registerService(id: string, service: IVectorStoreService, config: any) {
        await service.initialize(config);
        this.services.set(id, service);
    }

    /**
     * 移除服务
     */
    unregisterService(id: string) {
        this.services.delete(id);
    }

    /**
     * 派发更新：所有 Service 都要执行
     */
    async upsert(chunks: VectorChunk[]): Promise<void> {
        const tasks = Array.from(this.services.values()).map(s => s.upsert(chunks));
        await Promise.all(tasks);
    }

    /**
     * 派发删除
     */
    async delete(targets: DeleteTarget[]): Promise<void> {
        const tasks = Array.from(this.services.values()).map(s => s.delete(targets));
        await Promise.all(tasks);
    }

    /**
     * 检索比较特殊：通常只从主 Service 查询，或者合并结果
     */
    async query(text: string): Promise<QueryResult[]> {
        // 示例：取第一个服务的查询结果
        const firstService = this.services.values().next().value;
        return firstService ? await firstService.query(text) : [];
    }
}