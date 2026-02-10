import { lang } from "./lang";
import { showPluginMessage } from "./pluginCommon";

export function checkClipboard(sendMessage = true) {
    if (!navigator.clipboard) {
        if (sendMessage) {
            showPluginMessage(lang("error:clipboard"));
        }
        return false;
    }
    return true;
}