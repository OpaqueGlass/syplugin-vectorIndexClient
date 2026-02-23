<template>
    <button 
        class="b3-button b3-button--outline fn__size200 fn__flex-center" 
        @click="handleClick"
    >
        {{ props.btnName }}
    </button>
</template>
<script lang="ts" setup>
const props = defineProps<{
    btnName: string,
    btndo: () => void
}>();

let timeout: ReturnType<typeof setTimeout> | null = null;

const handleClick = () => {
    if (timeout) {
        clearTimeout(timeout);
    }

    timeout = setTimeout(() => {
        props.btndo();
        timeout = null; 
    }, 900);
};
</script>