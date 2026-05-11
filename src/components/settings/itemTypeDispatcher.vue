<template>
  <component 
    :is="isBlockType ? Block : Item" 
    :setting-key="item.key" 
    :config-name="item.configName" 
    :config-desp="item.description"
  >
    <template v-if="item.type === 'CUSTOM'">
      <component 
        v-if="item.component != null" 
        :is="item.component" 
        v-bind="item.props"
        v-model="modelValue"
      />
      <slot v-else :name="item.key" :item="item" :model-value="modelValue"></slot>
    </template>

    <Switch 
      v-else-if="item.type === 'SWITCH'" 
      v-model="modelValue" 
    />
    
    <Select 
      v-else-if="item.type === 'SELECT'" 
      v-model="modelValue" 
      :option-names="item.optionNames" 
      :option-keys="item.options" 
    />

    <Input 
      v-else-if="['NUMBER', 'TEXT'].includes(item.type)" 
      v-model="modelValue" 
      :type="item.type" 
      :min="item.min" 
      :max="item.max" 
    />

    <Button 
      v-else-if="item.type === 'BUTTON'" 
      :btn-name="settingLang(item.key)[2]" 
      :btndo="item.btndo" 
      :setting-key="item.key"
    />

    <Textarea 
      v-else-if="item.type === 'TEXTAREA'" 
      v-model="modelValue" 
    />

    <template v-else-if="item.type !== 'TIPS'">
      <div style="color: var(--b3-theme-error)">
        Unknown Type: {{ item.type }} (Key: {{ item.key }})
        未知设置项类型 {{ item.type }} (Key: {{ item.key }})
      </div>
    </template>
  </component>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { settingLang } from '@/utils/lang';
import Item from './layout/item.vue';
import Block from './layout/block.vue';
import Switch from './items/switch.vue';
import Select from './items/select.vue';
import Input from './items/input.vue';
import Button from './items/button.vue';
import Textarea from './items/textarea.vue';

const props = defineProps<{
  item: any;
  gSetting: any;
  getValueByPath: Function;
  setValueByPath: Function;
}>();

// 是否属于 Block 类型的逻辑提取
const isBlockType = computed(() => 
  ['TEXTAREA', 'CUSTOM', 'ORDER', 'TIPS'].includes(props.item.type)
);

// 统一的双向绑定处理
const modelValue = computed({
  get: () => props.getValueByPath(props.gSetting, props.item.key),
  set: (val) => props.setValueByPath(props.gSetting, props.item.key, val)
});
</script>