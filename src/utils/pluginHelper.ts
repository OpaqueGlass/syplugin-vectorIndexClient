import { Dialog } from "siyuan";
import { Ref, ref } from "vue";

let searchPanelDialog: Ref<Dialog|null> = ref(null);
let pluginInstance: any = null;

export function setPluginInstance(instance:any) {
    pluginInstance = instance;
}
export function getPluginInstance() {
    return pluginInstance;
}


export function useSearchPanel() {
    return searchPanelDialog;
}