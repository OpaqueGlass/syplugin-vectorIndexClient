<template>
  <div class="task-manager-container">
    <h2>⚙️ 后台任务管理器</h2>
    
    <div class="status-panel">
      <div :class="['status-box', statusClass]">
        状态: **{{ statusDisplay }}**
      </div>
      <div v-if="state.error" class="error-message">
        ❌ 错误: {{ state.error }}
      </div>
      <div v-else-if="!isFunctional" class="warning-message">
        ⚠️ 功能不可用，请检查插件环境配置。
      </div>
    </div>
    
    <div class="controls">
      <button 
        @click="startTask" 
        :disabled="isRunning || !isFunctional"
        class="btn btn-start"
      >
        ▶️ 开始
      </button>
      <button 
        @click="stopTask" 
        :disabled="!isRunning || !isFunctional"
        class="btn btn-stop"
      >
        ⏹️ 停止
      </button>
      <button 
        @click="restartTask" 
        :disabled="isRunning || !isFunctional"
        class="btn btn-restart"
      >
        🔄 重启
      </button>
    </div>

    <div class="log-area">
      <h3>📜 任务日志</h3>
      <pre class="log-output">{{ state.output || "等待任务启动..." }}</pre>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onUnmounted } from 'vue';
import { useRunner, TaskStatus } from './useRunner';

// 引入 useRunner hook
const { 
  state, 
  startTask, 
  stopTask, 
  restartTask, 
  isRunning, 
  isIdle,
  isFunctional,
  stopUpdater // 引入停止更新的函数
} = useRunner();

// 计算属性：状态类名，用于颜色区分
const statusClass = computed(() => {
  switch (state.value.status) {
    case TaskStatus.RUNNING: return 'status-running';
    case TaskStatus.COMPLETED: return 'status-success';
    case TaskStatus.FAILED: return 'status-error';
    case TaskStatus.STOPPED: return 'status-warning';
    default: return 'status-idle';
  }
});

// 计算属性：友好的状态显示文本
const statusDisplay = computed(() => {
  switch (state.value.status) {
    case TaskStatus.IDLE: return '空闲';
    case TaskStatus.RUNNING: return '运行中...';
    case TaskStatus.STOPPED: return '已停止 (手动)';
    case TaskStatus.COMPLETED: return '已完成 (成功)';
    case TaskStatus.FAILED: return '已失败 (异常)';
    default: return '未知';
  }
});

// 在组件卸载时清理定时器，避免内存泄漏
onUnmounted(() => {
  stopUpdater();
});
</script>

<style scoped>
/* 简单的 CSS 样式，无额外依赖 */
.task-manager-container {
  padding: 20px;
  max-width: 800px;
  margin: 0 auto;
  font-family: sans-serif;
  border: 1px solid #ccc;
  border-radius: 8px;
}

.status-panel {
  margin-bottom: 20px;
  padding: 10px;
  border: 1px solid #eee;
  border-radius: 4px;
}

.status-box {
  padding: 8px 12px;
  border-radius: 4px;
  font-weight: bold;
  color: white;
  text-align: center;
}

.status-idle { background-color: #6c757d; }
.status-running { background-color: #007bff; } /* Blue */
.status-success { background-color: #28a745; } /* Green */
.status-error { background-color: #dc3545; } /* Red */
.status-warning { background-color: #ffc107; } /* Yellow/Orange */

.error-message, .warning-message {
  margin-top: 10px;
  padding: 8px;
  border-radius: 4px;
  color: #721c24;
  background-color: #f8d7da;
  border-color: #f5c6cb;
}

.controls {
  margin-bottom: 20px;
  display: flex;
  gap: 10px;
}

.btn {
  padding: 10px 15px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: background-color 0.3s;
  font-weight: bold;
}

.btn-start { background-color: #28a745; color: white; }
.btn-stop { background-color: #dc3545; color: white; }
.btn-restart { background-color: #ffc107; color: #333; }

.btn:disabled {
  background-color: #e9ecef;
  color: #6c757d;
  cursor: not-allowed;
}

.log-area {
  margin-top: 20px;
}

.log-output {
  white-space: pre-wrap; /* 保持换行和空格 */
  background-color: #212529;
  color: #fff;
  padding: 15px;
  border-radius: 4px;
  height: 300px; /* 固定高度 */
  overflow-y: auto; /* 允许滚动 */
  font-family: monospace;
  border: 1px solid #333;
}
</style>