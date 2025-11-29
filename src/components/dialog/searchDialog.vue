<template>
    <div style="height: 100%; display: flex; flex-direction: column; padding: 1em;">
        <!-- 搜索栏和选项 -->
        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;">
            <div class="b3-form__icon" style="flex-grow: 1;">
                <svg class="b3-form__icon-icon">
                    <use xlink:href="#iconSearch"></use>
                </svg>
                <input type="text" class="b3-text-field fn__block b3-form__icon-input" v-model="searchQuery"
                    :placeholder="lang('search_placeholder')" @keyup.enter="performSearch" ref="searchInput" />
            </div>
            <select v-model="ragType" class="b3-select">
                <option value="lightrag">lightrag</option>
                <option value="chroma">chroma</option>
            </select>
            <button @click="performSearch" class="b3-button b3-button--primary">{{ lang('search') }}</button>
        </div>

        <!-- 结果列表 -->
        <div style="flex-grow: 1; overflow-y: auto; border: 1px solid var(--b3-border-color); border-radius: var(--b3-border-radius);">
            <!-- Chroma results (list) -->
            <ul class="b3-list b3-list--background fn__flex-1" v-if="!isLoading && searchResults.length > 0 && ragType === 'chroma'">
                <li v-for="(item, index) in searchResults" :key="index"
                    class="b3-list-item"
                    @click="onItemClick(item)">
                    <span class="b3-list-item__text" style="white-space: normal; line-height: 1.5;">{{ item.content }}</span>
                    <span class="b3-list-item__meta" v-if="item.metadata">{{ JSON.stringify(item.metadata) }}</span>
                </li>
            </ul>

            <!-- Lightrag result (single preview) -->
            <div v-if="!isLoading && searchResults.length > 0 && ragType === 'lightrag'" 
                 style="padding: 15px; line-height: 1.6; white-space: pre-wrap; height: 100%; overflow-y: auto; display: flex; flex-direction: column; justify-content: space-between;">
                 <div style="text-align: right; margin-top: 10px;">
                    <button @click="onCopyItem(searchResults[0])" class="b3-button">{{ lang('copy_item') }}</button>
                </div>
                <p>{{ searchResults[0].content }}</p>
                <div style="text-align: right; margin-top: 10px;">
                    <button @click="onCopyItem(searchResults[0])" class="b3-button">{{ lang('copy_item') }}</button>
                </div>
            </div>

            <div v-if="isLoading" style="text-align: center; padding: 20px;">{{ lang('searching') }}...</div>
            <div v-if="!isLoading && searchResults.length === 0 && hasSearched" style="text-align: center; padding: 20px;">{{ lang('no_results') }}</div>
        </div>

        <!-- 提示 -->
        <div class="search__tip" style="height: auto; padding-top: 8px;">
            <kbd>Enter</kbd> {{ lang('perform_search') }}
            <kbd>{{ lang('dialog_panel_switchDoc_click') }}</kbd> {{ lang('open_item') }}
        </div>
    </div>
</template>

<script lang="ts" setup>
import { ref, onMounted } from 'vue';
import { lang } from '@/utils/lang';
import { openRefLinkByAPI, showPluginMessage } from '@/utils/common';
import { getPluginInstance } from '@/utils/pluginHelper';
import { useProvider } from '@/utils/indexerHelper';
import { checkClipboard } from '@/utils/commonCheck';

// 定义接口
interface QueryResult {
    docId: string;
    blockId: string | null;
    content: string;
    metadata: any;
}

const props = defineProps<{
    dialog?: {
        destroy: () => void;
    };
    outdatedKeys: string[],
    defaultSettings: Record<string, any>
}>();

const searchQuery = ref('');
const ragType = ref('chroma');
const searchResults = ref<QueryResult[]>([]);
const isLoading = ref(false);
const hasSearched = ref(false);
const searchInput = ref<HTMLInputElement | null>(null);

// 搜索函数
const performSearch = async () => {
    if (!searchQuery.value.trim()) return;

    isLoading.value = true;
    hasSearched.value = true;
    searchResults.value = [];

    const plugin = getPluginInstance();
    if (!plugin) {
        console.error("Plugin instance not found");
        isLoading.value = false;
        return;
    }

    try {
        const provider = useProvider();
        const data = await provider.query(searchQuery.value, "document", 30, ragType.value);
        searchResults.value = data as QueryResult[];
    } catch (error) {
        console.error('Search failed:', error);
    } finally {
        isLoading.value = false;
    }
};

// 列表项点击事件
const onItemClick = (item: QueryResult) => {
    const idToOpen = item.blockId || item.docId;
    if (idToOpen) {
        openRefLinkByAPI({ paramDocId: idToOpen });
        if (props.dialog) {
            props.dialog.destroy();
        }
    }
};

const onCopyItem = (result: QueryResult) => {
    checkClipboard();
    const text = result.content;
    const item = new ClipboardItem({ "text/plain": new Blob([text], { type: 'text/plain' }) });
    navigator.clipboard.write([item]);
    showPluginMessage(lang("success:copy"));
};

onMounted(() => {
    searchInput.value?.focus();
});

</script>