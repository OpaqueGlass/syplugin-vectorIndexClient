<template>
    <button 
        class="b3-button b3-button--outline fn__size200 fn__flex-center" 
        @click="handleClick"
    >
        {{ props.btnName }}
    </button>
</template>
<script lang="ts" setup>
import { handleSettionBtnAction } from '@/manager/settingAction';

const props = defineProps<{
    btnName: string,
    btndo: () => void,
    settingKey: string,
}>();

let timeout: ReturnType<typeof setTimeout> | null = null;

const handleClick = () => {
    if (timeout) {
        clearTimeout(timeout);
    }

    timeout = setTimeout(() => {
        if (props.btndo) {
            props.btndo();
        } else {
            handleSettionBtnAction(props.settingKey);
        }
        timeout = null; 
    }, 900);
};
</script>