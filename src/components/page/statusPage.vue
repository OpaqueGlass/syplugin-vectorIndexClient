<template>
  <div class="container">
    <section class="section">
      <h2 class="title">{{ lang('statusTitle') }}</h2>
      <div class="status-grid">
        <div class="card">
          <p class="label">{{ lang('queueTotal') }}</p>
          <p class="value">{{ queueStatus.totalSize }}</p>
        </div>
        
        <div class="card">
          <p class="label">{{ lang('queueAvailable') }}</p>
          <p class="value">{{ queueStatus.availableSize }}</p>
        </div>

        <div class="card status-card" :class="{ 'is-working': queueStatus.isWorking }">
          <div class="status-info">
            <p class="label">{{ lang('workingStatus') }}</p>
            <p class="status-text">
              {{ queueStatus.isWorking ? lang('statusRunning') : lang('statusIdle') }}
            </p>
          </div>
          <div class="status-indicator"></div>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="header-row">
        <h2 class="title error-title">{{ lang('errorLogTitle') }}</h2>
        <span class="badge">{{ errorList.length }} {{ lang('errorCountUnit') }}</span>
      </div>

      <div v-if="errorList.length > 0" class="table-container">
        <table class="error-table">
          <thead>
            <tr>
              <th>{{ lang('tableDocId') }}</th>
              <th>{{ lang('tableErrorMsg') }}</th>
              <th>{{ lang('tableTime') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(err, index) in errorList" :key="index">
              <td class="font-mono">{{ err.docId }}</td>
              <td class="error-text">{{ err.result }}</td>
              <td class="time-text">{{ formatDate(err.time) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      
      <div v-else class="empty-state">
        {{ lang('noErrors') }}
      </div>
    </section>
  </div>
</template>

<script lang="ts" setup>
import { logPush } from '@/logger';
import { useWorker } from '@/utils/indexerHelper';
import { lang } from '@/utils/lang';
import { onMounted, ref } from 'vue';

let worker = null;

// 获取数据
const errorList = ref([])
const queueStatus = ref({});
const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleString();
};

onMounted(async ()=>{
    worker = await useWorker()
    errorList.value = await worker.getRecentTaskInfo();
    queueStatus.value = await worker.getQueueStatus();
})
</script>

<style scoped>
.container {
  max-width: 900px;
  margin: 2rem auto;
  padding: 0 1rem;
  font-family: sans-serif;
  color: #333;
}

.section {
  margin-bottom: 3rem;
}

.title {
  font-size: 1.25rem;
  font-weight: 600;
  margin-bottom: 1rem;
}

/* 状态卡片布局 */
.status-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1.5rem;
}

.card {
  padding: 1.25rem;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}

.label {
  font-size: 0.875rem;
  color: #6b7280;
  margin: 0 0 0.5rem 0;
}

.value {
  font-size: 1.75rem;
  font-weight: 700;
  margin: 0;
}

/* 工作状态特殊样式 */
.status-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.status-card.is-working {
  border-color: #bbf7d0;
}

.status-text {
  font-size: 1.1rem;
  font-weight: 600;
  margin: 0;
}

.status-indicator {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #9ca3af;
}

.is-working .status-indicator {
  background: #22c55e;
  box-shadow: 0 0 8px #22c55e;
}

/* 表格样式 */
.header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.error-title {
  color: #dc2626;
  margin: 0;
}

.badge {
  background: #fee2e2;
  color: #b91c1c;
  padding: 0.25rem 0.75rem;
  border-radius: 99px;
  font-size: 0.75rem;
}

.table-container {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  overflow: hidden;
}

.error-table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
}

.error-table th {
  background: #f8fafc;
  padding: 0.75rem 1rem;
  font-size: 0.75rem;
  color: #64748b;
  text-transform: uppercase;
}

.error-table td {
  padding: 1rem;
  border-top: 1px solid #e5e7eb;
  font-size: 0.875rem;
}

.font-mono { font-family: monospace; color: #4b5563; }
.error-text { color: #ef4444; }
.time-text { color: #94a3b8; }

.empty-state {
  text-align: center;
  padding: 3rem;
  border: 2px dashed #e5e7eb;
  border-radius: 8px;
  color: #9ca3af;
}
</style>