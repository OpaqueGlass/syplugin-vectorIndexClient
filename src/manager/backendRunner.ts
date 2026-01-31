import { errorPush, logPush } from "@/logger";
import { getReadOnlyGSettings } from "./settingManager";

// 定义任务状态
export enum TaskStatus {
    IDLE = "IDLE",            
    RUNNING = "RUNNING",      
    STOPPED = "STOPPED",      
    COMPLETED = "COMPLETED",  
    FAILED = "FAILED",        
}

/**
 * 专门用于报告 child_process 依赖缺失的错误
 */
export class DependencyError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "DependencyError";
    }
}

// 尝试获取依赖
let safeSpawn: any = null;
try {
    // 假设 window.require 是可用的
    const childProcess = (window as any).require("child_process");
    if (childProcess && childProcess.spawn) {
        safeSpawn = childProcess.spawn;
    }
} catch (e) {
    // window.require 失败或 child_process 不存在
   logPush("Failed to load child_process module:", e);
}


// 定义类
export class BackendTaskRunner {
    private childProcess: any = null;
    private currentStatus: TaskStatus = TaskStatus.IDLE;
    private outputBuffer: string[] = [];
    private readonly command: string;
    private readonly args: string[];

    /**
     * 静态方法：检查后台运行功能是否可用
     */
    public static isAvailable(): boolean {
        return safeSpawn !== null;
    }

    /**
     * 构造函数：初始化时进行依赖检查，如果失败则抛出异常。
     */
    constructor() {
        // 1. 依赖检查
        if (safeSpawn === null) {
            // 依赖缺失，立即抛出异常
            throw new DependencyError(
                "Backend functionality is unavailable: Failed to load 'child_process' module. Check Node.js integration settings."
            );
        }

        // 2. 加载配置并解析命令 (如果依赖通过检查)
        const g_settings = getReadOnlyGSettings();
        const fullCommand: string = g_settings["backendCMD"] || ""; 

        if (!fullCommand) {
            this.command = "";
            this.args = [];
            errorPush("Backend command (backendCMD) is not set in g_settings.");
        } else {
            // 解析命令和参数
            const parts = fullCommand.trim().split(/\s+/).filter(p => p.length > 0);
            this.command = parts[0];
            this.args = parts.slice(1);
        }
    }
    // --- 接口实现 ---

    /**
     * 获取当前运行状态
     */
    public getStatus(): TaskStatus {
        return this.currentStatus;
    }

    /**
     * 获取所有命令行输出内容（stdout 和 stderr）
     */
    public getOutput(): string {
        return this.outputBuffer.join('\n');
    }

    /**
     * 清空输出缓冲区
     */
    public clearOutput(): void {
        this.outputBuffer = [];
    }
    
    /**
     * 停止当前运行的任务
     * @param updateStatus 是否更新状态为 STOPPED，默认为 true
     */
    public stop(updateStatus: boolean = true): boolean {
        if (this.childProcess && this.currentStatus === TaskStatus.RUNNING) {
            if (updateStatus) {
                this.currentStatus = TaskStatus.STOPPED;
                this.outputBuffer.push("--- Task stopped by user ---");
                logPush("Task stopped by user.");
            }

            // kill 进程
            const success = this.childProcess.kill();
            this.childProcess = null;
            return success;
        }
        return false;
    }

    /**
     * 启动/重新运行任务
     * @param clear 是否在启动前清空旧的输出内容，默认 true
     */
    public start(clear: boolean = true): boolean {
        // 1. 检查是否已经在运行
        if (this.currentStatus === TaskStatus.RUNNING && this.childProcess) {
            console.warn("Task is already running.");
            return false;
        }

        // 2. 检查命令是否有效
        if (!this.command) {
            this.currentStatus = TaskStatus.FAILED;
            this.outputBuffer.push("Cannot start: backendCMD is not configured correctly.");
            return false;
        }

        // 3. 清理旧任务（如果存在，确保完全退出）
        if (this.childProcess) {
            this.stop(false); 
        }

        // 4. 清空输出缓冲区
        if (clear) {
            this.clearOutput();
        }

        // 5. 更新状态并启动
        this.currentStatus = TaskStatus.RUNNING;
        this.outputBuffer.push(`--- Starting command: ${this.command} ${this.args.join(' ')} ---`);
        
        try {
            // 使用 spawn 启动任务
            this.childProcess = safeSpawn(this.command, this.args);
            logPush(`Called backend task: ${this.command} ${this.args.join(' ')}`);

            // 6. 绑定事件
            this.childProcess.on("error", (err: Error) => {
                // 启动或执行错误
                this.handleTaskEnd(null, err);
            });

            this.childProcess.stdout!.on("data", (data: any) => {
                const output = data.toString().trim();
                if (output) {
                    this.outputBuffer.push(output);
                }
            });

            this.childProcess.stderr!.on("data", (data: any) => {
                const output = data.toString().trim();
                if (output) {
                    this.outputBuffer.push(`[STDERR] ${output}`);
                }
            });

            this.childProcess.on("close", (code: number | null) => {
                // 进程退出
                this.handleTaskEnd(code);
            });

            return true;

        } catch (error) {
            this.handleTaskEnd(null, error as Error);
            return false;
        }
    }
    
    /**
     * 重新运行任务：停止并立即重新启动
     */
    public restart(): boolean {
        // 清空输出并启动
        return this.start(true); 
    }

    // --- 内部方法 ---

    /**
     * 内部方法：处理任务启动错误或自然退出
     * @param code 退出代码 (如果是自然退出)
     * @param error 错误对象 (如果是启动错误)
     */
    private handleTaskEnd(code: number | null, error?: Error): void {
        this.childProcess = null;

        if (error) {
            // 启动错误
            this.currentStatus = TaskStatus.FAILED;
            this.outputBuffer.push(`Error: Task failed to start: ${error.message}`);
            errorPush("Backend Task Error:", error);

        } else if (this.currentStatus === TaskStatus.STOPPED) {
             // 状态已由 stop() 方法设置，保持 STOPPED 状态。
        } else if (code === 0) {
            // 正常完成
            this.currentStatus = TaskStatus.COMPLETED;
            this.outputBuffer.push(`Task finished successfully.`);
        } else if (code !== null) {
            // 退出代码非 0
            this.currentStatus = TaskStatus.FAILED;
            this.outputBuffer.push(`Task finished with failure code ${code}.`);
            errorPush(`Task finished with failure code ${code}.`);
        } else {
            // 意外终止（如被信号杀死且未手动stop）
             this.currentStatus = TaskStatus.FAILED;
            this.outputBuffer.push(`Task terminated unexpectedly.`);
        }
        logPush(`Task state changed to: ${this.currentStatus}`);
    }
}