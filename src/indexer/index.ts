import { debugPush } from "@/logger";
import { getJSONFile, putJSONFile } from "@/syapi";

// 这是一个简化的锁实现，用于防止异步函数重入。
// 在单线程的JS环境中，它通过一个Promise队列来确保操作按顺序执行。
class AsyncLock {
    private promise = Promise.resolve();

    public async acquire<T>(fn: () => Promise<T>): Promise<T> {
        return new Promise((resolve, reject) => {
            this.promise = this.promise
                .then(() => fn().then(resolve, reject))
                .catch(() => { }); // 捕获之前的错误，不影响新任务
        });
    }
}

export class CacheQueue<T> {
    private readonly cacheDir: string;
    // [MODIFIED] 简化为单个缓存文件
    private readonly cacheFilePath: string;

    // [MODIFIED] 使用一个统一的内存队列作为主要数据源，替代原有的 readCache
    private queue: T[] = [];

    // [NEW] 用于定时存盘的计时器
    private saveTimer: ReturnType<typeof setTimeout> | null = null;
    private readonly saveInterval: number;

    private readonly idSelector?: (item: T) => any;

    // [MODIFIED] 简化为单个锁，保护对内存队列和文件的所有访问
    private readonly lock = new AsyncLock();

    /**
     * @param cacheDir 缓存目录
     * @param idSelector 用于识别项目中唯一ID的函数，用于去重
     * @param saveInterval 对队列进行修改后，等待多少毫秒后自动存盘，默认为3000ms
     */
    constructor(cacheDir: string, idSelector?: (item: T) => any, saveInterval = 3000) {
        this.cacheDir = cacheDir;
        this.idSelector = idSelector;
        this.saveInterval = saveInterval;
        // [MODIFIED] 使用单个缓存文件
        this.cacheFilePath = `${this.cacheDir}/cache.json`;
    }

    /**
     * 初始化缓存队列，从磁盘加载数据到内存。
     * 应该在使用队列前调用一次。
     */
    public async init(): Promise<void> {
        return this.lock.acquire(async () => {
            const data = await getJSONFile(this.cacheFilePath);
            if (Array.isArray(data)) {
                this.queue = data;
            } else {
                // 如果文件不存在或内容无效，则创建一个空文件
                await putJSONFile(this.cacheFilePath, [], false);
                this.queue = [];
            }
        });
    }

    /**
     * 检查队列是否有待处理的项目。
     */
    public hasNext(): boolean {
        return this.queue.length > 0;
    }

    /**
     * 将一个新项目添加到队列中。
     * 如果队列中已存在相同的项目（根据idSelector判断），则会先移除旧项目，再将新项目添加到队尾。
     * 此操作仅修改内存，并通过定时任务自动存盘。
     * @param item 要添加的项目。
     */
    public async addToQueue(item: T): Promise<void> {
        debugPush("item added to queue", item);
        await this.lock.acquire(async () => {
            const existingIndex = this.findIndexInQueue(this.queue, item);
            if (existingIndex !== -1) {
                this.queue.splice(existingIndex, 1);
            }
            this.queue.push(item);
        });
        // [MODIFIED] 不再直接写入文件，而是安排一个定时保存任务
        this.scheduleSave();
    }

    /**
     * 批量将新项目添加到队列中。
     * 对于每个项目，如果队列中已存在相同的项目，则会将其移动到队尾。
     * 此操作在完成后会立即触发一次存盘。
     * @param items 要添加的项目数组。
     */
    public async batchAddToQueue(items: T[]): Promise<void> {
        await this.lock.acquire(async () => {
            for (const item of items) {
                const existingIndex = this.findIndexInQueue(this.queue, item);
                if (existingIndex !== -1) {
                    this.queue.splice(existingIndex, 1);
                }
                this.queue.push(item);
            }
        });
        // [MODIFIED] 批量操作后，立即执行存盘
        await this.persist();
    }

    /**
     * 内部辅助方法，根据是否提供了 idSelector 来查找项目在队列中的索引。
     * @param queue 要搜索的队列。
     * @param item 要查找的项目。
     * @returns 项目的索引，如果未找到则返回 -1。
     */
    private findIndexInQueue(queue: T[], item: T): number {
        if (this.idSelector) {
            const itemId = this.idSelector(item);
            return queue.findIndex(i => this.idSelector!(i) === itemId);
        }
        return queue.indexOf(item);
    }

    /**
     * 从队列中消费指定数量的项目。
     * 此操作仅修改内存，并通过定时任务自动存盘。
     * @param count 希望消费的项目的数量。
     * @returns 一个包含已消费项目的数组。
     */
    public async consume(count: number): Promise<T[]> {
        let consumedItems: T[] = [];
        await this.lock.acquire(async () => {
            const consumedCount = Math.min(count, this.queue.length);
            if (consumedCount > 0) {
                consumedItems = this.queue.splice(0, consumedCount);
            }
        });

        if (consumedItems.length > 0) {
            // [MODIFIED] 消费后，安排定时保存
            this.scheduleSave();
        }

        return consumedItems;
    }

    /**
     * 从队列中消费一个项目。
     */
    public async consumeOne(): Promise<T | null> {
        const items = await this.consume(1);
        return items.length > 0 ? items[0] : null;
    }

    // [NEW] 安排一个延迟的存盘操作 (debounce)
    private scheduleSave(): void {
        // 如果已有定时器，则清除它
        if (this.saveTimer) {
            clearTimeout(this.saveTimer);
        }
        // 设置一个新的定时器
        this.saveTimer = setTimeout(() => {
            this.persist();
        }, this.saveInterval);
    }

    /**
     * [NEW] 将当前内存队列的状态持久化到磁盘文件。
     * 这是一个线程安全的操作。
     */
    public async persist(): Promise<void> {
        // 如果有正在等待的定时器，清除它，因为我们马上就要保存了
        if (this.saveTimer) {
            clearTimeout(this.saveTimer);
            this.saveTimer = null;
        }

        await this.lock.acquire(async () => {
            await putJSONFile(this.cacheFilePath, this.queue, false);
        });
    }

    // [REMOVED] 不再需要 preloadCacheFromFile 和 rotateFiles 方法
}