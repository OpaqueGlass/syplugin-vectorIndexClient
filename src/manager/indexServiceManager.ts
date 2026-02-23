// vectorManager.ts
import { warnPush } from "@/logger";

export class VectorServiceManager {
    private services: Map<string, IVectorStoreService> = new Map();

    /**
     * 注册并初始化一个新的服务
     */
    async registerService(id: string, service: IVectorStoreService, config: any) {
        await service.initialize(config);
        this.services.set(id, service);
    }

    async getRegisteredServicesIds() {
        return Array.from(this.services.keys());
    }

    async getAvailableServicesIds() {
        const allServices = Array.from(this.services.entries());
        const results = await Promise.all(
            allServices.map(async ([id, service]) => {
                const healthCheckResult = await service.healthCheck();
                return healthCheckResult.available ? id : null;
            })
        );
        return results.filter(id => id !== null);
    }

    getServiceById(id: string) {
        return this.services.get(id);
    }

    /**
     * 移除服务
     */
    unregisterService(id: string) {
        this.services.delete(id);
    }

    unregisterAllServices() {
        this.services.clear();
    }
    
    private async dispatchTask(
        action: (service: IVectorStoreService) => Promise<void>
    ): Promise<MultiServiceResponse> {
        const serviceIds = Array.from(this.services.keys());
        const tasks = serviceIds.map(async (id) => {
            const service = this.services.get(id)!;
            try {
                await action(service);
                return { serviceId: id, status: 'fulfilled' } as ServiceResult;
            } catch (error) {
                return { serviceId: id, status: 'rejected', reason: error } as ServiceResult;
            }
        });

        // 使用 Promise.allSettled 确保所有服务都尝试过
        const results = await Promise.all(tasks);

        const successCount = results.filter(r => r.status === 'fulfilled').length;
        
        return {
            total: serviceIds.length,
            successCount,
            failCount: serviceIds.length - successCount,
            details: results
        };
    }

    async upsert(chunks: VectorChunk[]): Promise<MultiServiceResponse> {
        return this.dispatchTask(s => s.upsert(chunks));
    }

    async delete(targets: DeleteTarget[]): Promise<MultiServiceResponse> {
        return this.dispatchTask(s => s.delete(targets));
    }

    /**
     * 检索：支持通过 serviceId 指定服务
     * @param text 搜索文本
     * @param serviceId 可选，指定要查询的服务 ID
     */
    async query(text: string, serviceId?: string): Promise<QueryResult[]> {
        // 1. 如果指定了 ID，直接从该服务查询
        if (serviceId) {
            const targetService = this.services.get(serviceId);
            if (!targetService) {
                throw new Error(`Service with id "${serviceId}" not found.`);
            }
            return await targetService.query(text);
        }

        // 2. 如果未指定 ID，默认逻辑（例如取第一个服务）
        const firstService = this.services.values().next().value;
        if (!firstService) {
            warnPush("没有任何服务处于运行状态");
            return [];
        }
        return await firstService.query(text);
    }

    getServiceCounts() {
        return this.services.size;
    }
}