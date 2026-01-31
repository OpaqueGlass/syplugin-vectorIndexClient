// useRunner.ts

import { ref, computed, reactive, readonly } from 'vue';
import { BackendTaskRunner, TaskStatus, DependencyError } from './backendRunner'; // 假设这是您前面实现的类

// 定义状态类型
interface RunnerState {
    status: TaskStatus;
    output: string;
    isAvailable: boolean;
    isInitializing: boolean;
    error: string | null;
}

// 全局唯一的任务运行器实例
let runnerInstance: BackendTaskRunner | null = null;
const state = reactive<RunnerState>({
    status: TaskStatus.IDLE,
    output: '',
    isAvailable: BackendTaskRunner.isAvailable(), // 静态检查
    isInitializing: false,
    error: null,
});

/**
 * 尝试初始化 BackendTaskRunner 实例
 * 通常在插件/应用启动时调用一次
 */
export function initializeRunner(): void {
    if (state.isInitializing || runnerInstance !== null) {
        return; // 避免重复初始化
    }

    state.isInitializing = true;

    if (!state.isAvailable) {
        state.error = "Backend functionality is unavailable: Child process module missing.";
        state.isInitializing = false;
        return;
    }

    try {
        runnerInstance = new BackendTaskRunner();
        state.status = runnerInstance.getStatus();
        state.output = runnerInstance.getOutput();
        state.error = null;
    } catch (e) {
        if (e instanceof DependencyError) {
            state.isAvailable = false;
            state.error = (e as DependencyError).message;
        } else {
            state.error = `Initialization failed: ${(e as Error).message}`;
        }
        runnerInstance = null; // 确保失败时实例为 null
    } finally {
        state.isInitializing = false;
    }
}

/**
 * Vue 组件使用的 Hook：获取任务状态和操作方法
 */
export function useRunner() {
    // 定时器用于更新状态和日志 (在实际应用中，如果 TaskRunner 支持 EventEmitter，则不需要定时器)
    let updateInterval: number | undefined;
    const intervalDuration = 500; // 500ms 更新一次

    const startUpdater = () => {
        if (updateInterval) return;
        updateInterval = window.setInterval(() => {
            if (runnerInstance) {
                state.status = runnerInstance.getStatus();
                // 每次都获取最新日志，但注意频繁调用 getOutput() 可能会有性能开销
                state.output = runnerInstance.getOutput(); 
            }
        }, intervalDuration);
    };

    const stopUpdater = () => {
        if (updateInterval) {
            clearInterval(updateInterval);
            updateInterval = undefined;
        }
    };

    // 暴露给组件的操作函数
    const startTask = () => {
        if (runnerInstance && state.isAvailable) {
            runnerInstance.start();
            startUpdater();
        }
    };

    const stopTask = () => {
        if (runnerInstance && state.isAvailable) {
            runnerInstance.stop();
        }
    };

    const restartTask = () => {
        if (runnerInstance && state.isAvailable) {
            runnerInstance.restart();
            startUpdater();
        }
    };

    // 确保组件开始使用时启动更新
    startUpdater(); 

    // 返回只读状态和操作
    return {
        // 状态
        state: readonly(state),
        // 操作
        startTask,
        stopTask,
        restartTask,
        stopUpdater, // 允许组件在 unmount 时停止更新
        // 辅助计算属性
        isRunning: computed(() => state.status === TaskStatus.RUNNING),
        isIdle: computed(() => state.status === TaskStatus.IDLE || state.status === TaskStatus.COMPLETED || state.status === TaskStatus.STOPPED),
        isFunctional: computed(() => state.isAvailable && runnerInstance !== null),
    };
}