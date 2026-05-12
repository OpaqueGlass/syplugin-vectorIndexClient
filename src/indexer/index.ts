import { debugPush } from "@/logger";
import { getJSONFile, putJSONFile } from "@/syapi";

class AsyncLock {
    private promise = Promise.resolve();
    public async acquire<T>(fn: () => Promise<T>): Promise<T> {
        return new Promise((resolve, reject) => {
            this.promise = this.promise
                .then(() => fn().then(resolve, reject))
                .catch(() => { });
        });
    }
}

// 定义包装类型
interface QueueItem<T> {
    data: T;
    availableAt: number; // 毫秒时间戳
}

export class CacheQueue<T> {
    private readonly cacheDir: string;
    private readonly cacheFilePath: string;
    
    // 队列现在存储包装后的对象
    private queue: QueueItem<T>[] = [];

    private saveTimer: ReturnType<typeof setTimeout> | null = null;
    private readonly saveInterval: number;
    private readonly idSelector?: (item: T) => any;
    private lastPersistedState: string = null;
    private writableFlag: boolean = false;
    private readonly lock = new AsyncLock();

    /**
     * @param cacheDir 缓存目录
     * @param idSelector 用于识别项目中唯一ID的函数，用于去重
     * @param saveInterval 对队列进行修改后，等待多少毫秒后自动存盘，默认为10000ms
     */
    constructor(cacheDir: string, idSelector?: (item: T) => any, saveInterval = 10000) {
        this.cacheDir = cacheDir;
        this.idSelector = idSelector;
        this.saveInterval = saveInterval;
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
                await putJSONFile(this.cacheFilePath, [], false);
                this.queue = [];
            }
        });
    }

    /**
     * 只有当前时间超过了 availableAt 的项才算作“有下一条”
     */
    public hasNext(): boolean {
        const now = Date.now();
        return this.queue.some(q => q.availableAt <= now);
    }

    /**
     * 返回所有项的数量（包含还在冷却中的）
     */
    public totalSize(): number {
        return this.queue.length;
    }

    /**
     * 返回当前可用的项的数量
     */
    public availableSize(): number {
        const now = Date.now();
        return this.queue.filter(q => q.availableAt <= now).length;
    }

    /**
     * 将一个新项目添加到队列中。
     * 如果队列中已存在相同的项目（根据idSelector判断），则会先移除旧项目，再将新项目添加到队尾。
     * 此操作仅修改内存，并通过定时任务自动存盘。
     * @param item 要添加的项目。
     */
    public async addToQueue(item: T, delayMs: number = 0): Promise<void> {
        const availableAt = Date.now() + delayMs;
        debugPush("item added to queue with delay", { item, delayMs });

        await this.lock.acquire(async () => {
            const existingIndex = this.findIndexInQueue(item);
            if (existingIndex !== -1) {
                // 如果存在，移除旧的（实现“更新”逻辑）
                this.queue.splice(existingIndex, 1);
            }
            this.queue.push({ data: item, availableAt });
        });
        this.scheduleSave();
    }

    public async batchAddToQueue(items: { data: T, delayMs?: number }[]): Promise<void> {
        const now = Date.now();
        await this.lock.acquire(async () => {
            for (const entry of items) {
                const availableAt = now + (entry.delayMs || 0);
                const existingIndex = this.findIndexInQueue(entry.data);
                if (existingIndex !== -1) {
                    this.queue.splice(existingIndex, 1);
                }
                this.queue.push({ data: entry.data, availableAt });
            }
        });
        await this.persist();
    }

    public async batchAddToQueueWithDelay(items: T[], delayMs?: number): Promise<void> {
        const now = Date.now();
        await this.lock.acquire(async () => {
            for (const entry of items) {
                const availableAt = now + (delayMs || 0);
                const existingIndex = this.findIndexInQueue(entry);
                if (existingIndex !== -1) {
                    this.queue.splice(existingIndex, 1);
                }
                this.queue.push({ data: entry, availableAt });
            }
        });
        await this.persist();
    }
    private findIndexInQueue(item: T): number {
        if (this.idSelector) {
            const itemId = this.idSelector(item);
            return this.queue.findIndex(q => this.idSelector!(q.data) === itemId);
        }
        return this.queue.findIndex(q => q.data === item);
    }

    /**
     * 从队列中消费指定数量的项目。
     * 此操作仅修改内存，并通过定时任务自动存盘。
     * @param count 希望消费的项目的数量。
     * @returns 一个包含已消费项目的数组。
     */
    public async consume(count: number): Promise<T[]> {
        let consumedData: T[] = [];
        const now = Date.now();

        await this.lock.acquire(async () => {
            // 找出所有已到时间的项的索引
            const availableIndices: number[] = [];
            for (let i = 0; i < this.queue.length; i++) {
                if (this.queue[i].availableAt <= now) {
                    availableIndices.push(i);
                    if (availableIndices.length === count) break;
                }
            }

            if (availableIndices.length > 0) {
                // 从后往前删，避免索引偏移问题
                const items: QueueItem<T>[] = [];
                for (let i = availableIndices.length - 1; i >= 0; i--) {
                    const [removed] = this.queue.splice(availableIndices[i], 1);
                    items.unshift(removed);
                }
                consumedData = items.map(q => q.data);
            }
        });

        if (consumedData.length > 0) {
            this.scheduleSave();
        }

        return consumedData;
    }

    /**
     * 从队列中消费一个项目。
     */
    public async consumeOne(): Promise<T | null> {
        const items = await this.consume(1);
        return items.length > 0 ? items[0] : null;
    }

    public async peek(count: number): Promise<T[]> {
        const now = Date.now();
        return this.lock.acquire(async () => {
            const availableItems = this.queue.filter(q => q.availableAt <= now).slice(0, count);
            return availableItems.map(q => q.data);
        });
    }

    public async peekOne(): Promise<T | null> {
        const items = await this.peek(1);
        return items.length > 0 ? items[0] : null;
    }

    private scheduleSave(): void {
        if (this.saveTimer) {
            clearTimeout(this.saveTimer);
        }
        this.saveTimer = setTimeout(() => {
            this.persist();
        }, this.saveInterval);
    }

    public async persist(): Promise<void> {
        if (!this.writableFlag) {
            debugPush("非写入模式，停止持久化");
            return;
        }
        if (this.saveTimer) {
            clearTimeout(this.saveTimer);
            this.saveTimer = null;
        }

        await this.lock.acquire(async () => {
            const currentState = JSON.stringify(this.queue);
            if (currentState !== this.lastPersistedState) {
                await putJSONFile(this.cacheFilePath, this.queue, false);
                this.lastPersistedState = currentState;
            }
        });
        debugPush("队列已持久化", { queueLength: this.queue.length });
    }

    /**
     * 停止 CacheQueue 的运行。
     * 清理定时器并确保队列的状态被持久化。
     */
    public async stop(): Promise<void> {
        if (this.saveTimer) {
            clearTimeout(this.saveTimer);
            this.saveTimer = null;
        }
        await this.persist();
    }

    public async reset(): Promise<void> {
        this.queue = [];
        await this.persist();
    }

    public setWritable(writable: boolean) {
        this.writableFlag = writable;
    }
}