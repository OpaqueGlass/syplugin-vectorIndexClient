<!-- Use settingCustomPage.vue -->
<template>
    <div class="fn__flex-1 fn__flex config__panel" style="width: auto; height: 100%; max-width: 1280px;">
        <ul class="b3-tab-bar b3-list b3-list--background">
            <!-- 这里可以插入设置项目，但是似乎没有必要 -->
            <li v-for="(tab, index) in tabList" :key="index"
                :class="{ 'b3-list-item--focus': activeTab === tab.key, 'b3-list-item': true }" @click="changeTab(tab.key)">
                <svg class="b3-list-item__graphic">
                    <use :xlink:href="'#' + tab.iconKey"></use>
                </svg>
                <!-- 这里是svg图标 -->
                <span class="b3-list-item__text">{{ settingPageLang(tab.key)[0] }}</span>
            </li>
        </ul>
        <div class="config__tab-wrap">
            <!-- TODO: 这里换成v-for根据列表生成，不再手动填充了 -->
            <!-- 在Page上通过当前显示的标签页名称key一致匹配确定是否显示这个标签页 -->
            <Page v-for="(tab, index) in tabList" v-show="activeTab === tab.key">
                <Column :hide="!tab.isColumn" :column-keys="tab.columnKeys" :column-names="tab.columnNames" >
                    <template #[key] v-for="(items, key) in tab.props">
                        <template v-for="(item, index) in items">
                            <template v-if="['TEXTAREA', 'CUSTOM', 'ORDER', 'TIPS'].indexOf(item.type) == -1">
                                <Item :key="index" :setting-key="item.key"  :config-name="item.configName" :config-desp="item.description">
                                    <template v-if="item.type == 'SWITCH'">
                                        <Switch 
                                        :model-value="getValueByPath(g_setting, item.key)"
                                        @update:model-value="val=>setValueByPath(g_setting, item.key, val)"
                                        ></Switch>
                                    </template>
                                    <template v-else-if="item.type == 'SELECT'">
                                        <Select :option-names="item.optionNames" :option-keys="item.options"
                                            :model-value="getValueByPath(g_setting, item.key)"
                                        @update:model-value="val=>setValueByPath(g_setting, item.key, val)"></Select>
                                    </template>
                                    <template v-else-if="item.type == 'NUMBER'">
                                        <Input :min="item.min" :max="item.max" :type="item.type"
                                            :model-value="getValueByPath(g_setting, item.key)"
                                        @update:model-value="val=>setValueByPath(g_setting, item.key, val)"></Input>
                                    </template>
                                    <template v-else-if="item.type == 'TEXT'">
                                        <Input :min="item.min" :max="item.max" :type="item.type"
                                            :model-value="getValueByPath(g_setting, item.key)"
                                        @update:model-value="val=>setValueByPath(g_setting, item.key, val)"></Input>
                                    </template>
                                    <template v-else-if="item.type == 'BUTTON'">
                                        <Button :btn-name="settingLang(item.key)[2]" :btndo="item.btndo" :setting-key="item.key"></Button>
                                    </template>
                                    
                                    <template v-else>
                                        出错啦，不能载入设置项，请检查设置代码实现。 Key: {{ item.key }}
                                        <br />
                                        Oops, can't load settings, check code please. Key: {{ item.key }}
                                    </template>
                                </Item>
                            </template>
                            <template v-else>
                                <Block :setting-key="item.key" :config-name="item.configName" :config-desp="item.description">
                                    <template v-if="item.type == 'TEXTAREA'">
                                        <Textarea :model-value="getValueByPath(g_setting, item.key)"
                                        @update:model-value="val=>setValueByPath(g_setting, item.key, val)"></Textarea>
                                    </template>
                                    <!-- <template v-else-if="item.type == 'ORDER'">
                                        <Order :option-names="item.optionNames" :option-desps="item.optionDesps" :option-keys="item.options"
                                            :setting-key="item.key" v-model="createBinding(item.key]"></Order>
                                    </template> -->
                                </Block>
                            </template>
                        </template>
                    </template>
                    
                </Column>
                

                
            </Page>
        </div>
    </div>
</template>
  
<script lang="ts" setup>
import { ref, computed } from 'vue';
import { settingLang, settingPageLang } from '@/utils/lang';
import Page from './layout/page.vue';
import Column from './layout/column.vue';
import Block from "./layout/block.vue";
import Item from './layout/item.vue';
import Button from './items/button.vue';
import Switch from './items/switch.vue';
import Input from './items/input.vue';
import Select from './items/select.vue';
import Textarea from './items/textarea.vue';
// import Order from './items/order.vue'; // 由于sortablejs默认对document绑定事件，在不需要使用该功能的插件上可能影响性能，本模板自v0.1.0其默认禁用；要使用此依赖，需要重新引入sortablejs，一并取消上面ORDER类型的注释；
import { getGSettings } from '@/manager/settingManager';
import { getTabProperties, getValueByPath, setValueByPath } from '@/manager/settingPageManager';
// const props = defineProps<{
//     tabs: Array<ITabProperty>
// }>();

const g_setting = getGSettings();

const tabList = getTabProperties();

const activeTab = ref(tabList[0].key);


// 创建动态计算属性
const createBinding = (path: string) => {
    return computed({
        get: () => getValueByPath(g_setting.value, path),
        set: (newValue) => setValueByPath(g_setting.value, path, newValue)
    });
};

function changeTab(key: string) {
    activeTab.value = key;
}
</script>
  
<style>
.tab-menu {
    list-style: none;
    padding: 0;
    margin: 0;
}

.tab-menu li {
    display: inline-block;
    margin-right: 10px;
    cursor: pointer;
}

.tab-menu li.active {
    font-weight: bold;
}</style>