<template>
  <div class="fn__flex-1 fn__flex config__panel" style="width: auto; height: 100%; max-width: 1280px;">
    <ul class="b3-tab-bar b3-list b3-list--background">
      <li v-for="tab in tabList" :key="tab.key"
          :class="{ 'b3-list-item--focus': activeTab === tab.key, 'b3-list-item': true }" 
          @click="activeTab = tab.key">
        <svg class="b3-list-item__graphic"><use :xlink:href="'#' + tab.iconKey"></use></svg>
        <span class="b3-list-item__text">{{ settingPageLang(tab.key)[0] }}</span>
      </li>
    </ul>

    <div class="config__tab-wrap">
      <Page v-for="tab in tabList" :key="tab.key" v-show="activeTab === tab.key">
        <Column :hide="!tab.isColumn" :column-keys="tab.columnKeys" :column-names="tab.columnNames">
          <template #[key] v-for="(items, key) in tab.props" :key="key">
            <SettingDispatcher 
              v-for="item in items" 
              :key="item.key"
              :item="item"
              :g-setting="g_setting"
              :get-value-by-path="getValueByPath"
              :set-value-by-path="setValueByPath"
            >
              <template #[item.key]="{ modelValue }">
                <div v-if="item.key === 'special_slot'">
                  Custom UI for {{ item.key }}
                </div>
              </template>
            </SettingDispatcher>
          </template>
        </Column>
      </Page>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { ref } from 'vue';
import { settingPageLang } from '@/utils/lang';
import Page from './layout/page.vue';
import Column from './layout/column.vue';
import SettingDispatcher from './itemTypeDispatcher.vue';
import { getGSettings } from '@/manager/settingManager';
import { getTabProperties, getValueByPath, setValueByPath } from '@/manager/settingPageManager';

const g_setting = getGSettings();
const tabList = getTabProperties();
const activeTab = ref(tabList[0]?.key);
</script>