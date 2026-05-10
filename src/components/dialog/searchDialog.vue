<template>
    <div style="height: 100%; display: flex; flex-direction: column; padding: 1.5em; gap: 12px;">
        <div style="display: flex; align-items: center; gap: 12px;">
            <div class="b3-form__icon" style="flex-grow: 1;">
                <div style="position: absolute; left: 8px; top: 0; bottom: 0; display: flex; align-items: center; gap: 4px; z-index: 1;" >
                    <svg class="b3-form__icon-icon" style="width: 16px; height: 16px; position: static;">
                        <use xlink:href="#iconSearch"></use>
                    </svg>
                </div>
                <div style="position: absolute; left: 20px; top: 0; bottom: 0; display: flex; align-items: center; gap: 4px; z-index: 1;" @click="showHistoryMenu">
                    <span class="search__history-icon ariaLabel" 
                        aria-label="Alt+↓" 
                        style="cursor: pointer; display: flex; align-items: center; padding: 4px 2px;">
                        <svg style="width: 10px; height: 10px; opacity: 0.5;"><use xlink:href="#iconDown"></use></svg>
                    </span>
                </div>

                <input type="text" 
                    class="b3-text-field fn__block b3-form__icon-input" 
                    style="font-size: 1.1em; padding: 8px 12px 8px 48px;" 
                    v-model="searchQuery"
                    :placeholder="lang('search_placeholder')" 
                    @keyup.enter="performSearch" 
                    ref="searchInput" />
            </div>
            
            <select v-model="ragType" class="b3-select" :disabled="isTypeListLoading">
                <option v-if="isTypeListLoading" value="">{{ lang('loading') }}...</option>
                <option v-for="type in availableTypes" :key="type" :value="type">
                    {{ type }}
                </option>
            </select>
            
            <button @click="performSearch" class="b3-button b3-button--primary" style="padding: 0 20px; height: 32px;">
                {{ lang('search') }}
            </button>
        </div>

        <div style="flex-grow: 1; overflow-y: auto; border: 1px solid var(--b3-border-color); border-radius: var(--b3-border-radius); ">
            
            <div v-if="!isLoading && searchResults.length > 0 && currentServiceMode === 'qa'" 
                 style="padding: 20px; line-height: 1.8; display: flex; flex-direction: column; height: 100%;">
                <div style="flex-grow: 1; font-size: 1.1em; white-space: pre-wrap;">{{ searchResults[0].content }}</div>
                
                <div style="margin-top: 15px; padding-top: 10px; border-top: 1px dashed var(--b3-border-color); display: flex; justify-content: space-between; align-items: center;">
                    <div class="fn__flex">
                        <span style="font-size: 0.85em; opacity: 0.7; margin-right: 8px;">{{ lang('source') }}:</span>
                        <a v-for="doc in resultDocNames[0]" :key="doc.id" 
                           @click="openDoc(doc.id)"
                           style="cursor: pointer; color: var(--b3-theme-primary); font-size: 0.85em; text-decoration: underline; margin-right: 10px;">
                            {{ doc.name }}
                        </a>
                    </div>
                    <button @click="onCopyItem(searchResults[0])" class="b3-button b3-button--outline">{{ lang('copy_item') }}</button>
                </div>
            </div>

            <ul class="b3-list b3-list--background" v-if="!isLoading && searchResults.length > 0 && currentServiceMode === 'search'">
                <li v-for="(item, index) in searchResults" :key="index"
                    class="b3-list-item" style="padding: 10px; height: auto; flex-direction: column; align-items: flex-start;">
                    <div class="b3-list-item__text" 
                         style="white-space: normal; line-height: 1.5; margin-bottom: 6px; cursor: pointer;"
                         @click="onItemClick(item)">
                        {{ item.content }}
                    </div>
                    <div style="font-size: 0.85em; opacity: 0.8; display: flex; column-gap: 8px; flex-wrap: wrap;">
                        <span style="opacity: 0.6;">{{ lang("source") }}</span>
                        <span v-for="doc in resultDocNames[index]" :key="doc.id" 
                              @click.stop="openDoc(doc.id)"
                              style="color: var(--b3-theme-primary); cursor: pointer; text-decoration: underline;">
                            {{ doc.id }}
                        </span>
                    </div>
                </li>
            </ul>

            <div v-if="isLoading" style="text-align: center; padding: 40px;">
                <div class="fn__loading" style="margin-bottom: 10px;"></div>
                {{ lang('searching') }}...
            </div>
            <div v-if="!isLoading && searchResults.length === 0 && hasSearched" style="text-align: center; padding: 40px; opacity: 0.6;">
                {{ lang('no_results') }}
            </div>
        </div>

        <div class="search__tip" style="height: auto; padding-top: 8px; opacity: 0.6; font-size: 0.9em;">
            <kbd>Enter</kbd> {{ lang('perform_search') }} | 
            <kbd>Click</kbd> {{ lang('open_item') }}
        </div>
    </div>
</template>

<script lang="ts" setup>
import { ref, onMounted, computed, watch } from 'vue';
import { lang } from '@/utils/lang';
import { openRefLinkByAPI, showPluginMessage } from '@/utils/pluginCommon';
import { useWorker } from '@/utils/indexerHelper';
import { checkClipboard } from '@/utils/pluginCheck';
import { debugPush, errorPush, logPush } from '@/logger';
import { isValidStr } from '@/utils/commonCheck';
import { getBlockDBItem } from '@/syapi/custom';
import { JSONStorage } from '@/utils/jsonStorageUtil';
import { Menu } from 'siyuan';

interface DocInfo {
    id: string;
    name: string;
}

const props = defineProps<{
    dialog?: { destroy: () => void };
}>();

const searchQuery = ref('');
const ragType = ref('');
const availableTypes = ref<string[]>([]);
const searchResults = ref<QueryResult[]>([]);
const resultDocNames = ref<Record<number, DocInfo[]>>({}); // 存储每行对应的文档名称列表

const isLoading = ref(false);
const isTypeListLoading = ref(true);
const hasSearched = ref(false);
const currentServiceMode = ref<ServiceQueryType>('search');
const searchInput = ref<HTMLInputElement | null>(null);
const historyList = ref<string[]>([]);
const STORAGE_KEYS = {
    LAST_STATE: "last_search_state",
    HISTORY: "search_history"
};

const jsonStorage = new JSONStorage("searchui.json");

const fetchDocNamesByIds = async (ids: string[]): Promise<DocInfo[]> => {
    if (!ids || ids.length === 0) return [];
    const results: DocInfo[] = [];
    for (const id of ids) {
        const block = await getBlockDBItem(id);
        if (block === null) {
            continue;
        }
        results.push({
            id: id,
            name: block?.content || block?.markdown || id.substring(0, 8) // 示例：取 root_id 或 截取 ID
        });
    }
    return results;
};

const saveLastState = () => {
    const state = {
        query: searchQuery.value,
        ragType: ragType.value,
        results: searchResults.value,
        resultDocs: resultDocNames.value,
        mode: currentServiceMode.value
    };
    jsonStorage.set(STORAGE_KEYS.LAST_STATE, state);
};

// 保存到历史列表
const addToHistory = (query: string) => {
    if (!query.trim()) return;
    // 过滤重复并保持最近的在前面
    const newHistory = [query, ...historyList.value.filter(i => i !== query)].slice(0, 20);
    historyList.value = newHistory;
    jsonStorage.set(STORAGE_KEYS.HISTORY, newHistory);
};

// 加载初始数据
const loadPersistedData = async () => {
    // 加载历史列表
    const history = await jsonStorage.get(STORAGE_KEYS.HISTORY);
    if (Array.isArray(history)) historyList.value = history;

    // 加载最后一次状态
    const lastState = await jsonStorage.get(STORAGE_KEYS.LAST_STATE);
    if (lastState) {
        searchQuery.value = lastState.query || '';
        ragType.value = lastState.ragType || '';
        searchResults.value = lastState.results || [];
        resultDocNames.value = lastState.resultDocs || {};
        currentServiceMode.value = lastState.mode || 'search';
        hasSearched.value = searchResults.value.length > 0;
    }
};

// --- 菜单逻辑 ---
const showHistoryMenu = (event: MouseEvent) => {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const menu = new Menu();
    event.preventDefault();
    event.stopPropagation();
    if (historyList.value.length === 0) {
        menu.addItem({ label: lang("no_history"), disabled: true });
    } else {
        menu.addItem({
            label: lang("clear_history"),
            click: async () => {
                historyList.value = [];
                jsonStorage.set(STORAGE_KEYS.HISTORY, []);
            }
        });
        menu.addSeparator();
        historyList.value.forEach(text => {
            menu.addItem({
                label: text,
                click: () => {
                    searchQuery.value = text;
                    performSearch();
                }
            });
        });
    }

    menu.open({
        x: rect.left,
        y: rect.bottom,
        isLeft: false
    });
};

// 监听 ragType 变化，自动更新当前服务的模式 (qa/search)
watch(ragType, async (newType) => {
    if (!newType) return;
    const worker = await useWorker();
    const mode = await worker.getServiceQueryType(newType);
    logPush("ragTYpe", mode)
    currentServiceMode.value = mode as 'qa' | 'search';
});

// 搜索函数
const performSearch = async () => {
    if (!searchQuery.value.trim() || !ragType.value) return;

    if (!availableTypes.value.includes(ragType.value)) {
        showPluginMessage("此后端方案暂不可用，进入插件设置或状态页确认连接情况吧");
        return;
    }
    isLoading.value = true;
    hasSearched.value = true;
    
    try {
        const worker = await useWorker();
        const data = await worker.query(searchQuery.value.trim(), ragType.value) as QueryResult[];
        searchResults.value = currentServiceMode.value === 'qa' ? data.slice(0, 1) : data;

        // 获取文档名称...
        const docPromises = searchResults.value.map(async (item, i) => {
            if (item.ids) {
                const docs = await fetchDocNamesByIds(item.ids);
                resultDocNames.value[i] = docs;
            }
        });
        
        await Promise.all(docPromises);
        
        addToHistory(searchQuery.value.trim());
        saveLastState();
    } catch (error) {
        errorPush('Search failed:', error);
    } finally {
        isLoading.value = false;
    }
};

// 跳转文档
const openDoc = async (id: string) => {
    const blockDBItem = await getBlockDBItem(id)
    if (isValidStr(id) && blockDBItem) {
        if (blockDBItem.type === "d") {
            openRefLinkByAPI({ paramDocId: id, removeCurrentTab: false });
        } else {
            openRefLinkByAPI({ paramDocId: id, removeCurrentTab: true, openInFocus: true });
        }
        props.dialog?.destroy();
    } else {
        showPluginMessage(lang("error_doc_not_found"));
    }
};

const onItemClick = async (item: QueryResult) => {
    if (item.ids && item.ids.length > 0) {
        const blockDBItem = await getBlockDBItem(item.ids[0]);
        openDoc(blockDBItem?.root_id);
    }
};

const onCopyItem = (result: QueryResult) => {
    checkClipboard();
    navigator.clipboard.writeText(result.content);
    showPluginMessage(lang("success:copy"));
};

onMounted(async () => {
    searchInput.value?.focus();
    try {
        const worker = await useWorker();
        // 获取所有可用服务
        const services = await worker.getAvailableServices() as string[];
        availableTypes.value = services;
        // 加载持久化的数据
        await loadPersistedData();

        if (!ragType.value && services.length > 0) {
            ragType.value = services[0];
        }
    } catch (e) {
        errorPush("Failed to load services", e);
    } finally {
        isTypeListLoading.value = false;
    }
});
</script>

<style scoped>
.b3-list-item:hover {
    background-color: var(--b3-list-hover);
}
.b3-select {
    cursor: pointer;
    max-width: 150px;
}
</style>