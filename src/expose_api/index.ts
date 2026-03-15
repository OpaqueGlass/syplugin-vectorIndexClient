import { getReadOnlyGSettings } from "@/manager/settingManager";
import { useWorker } from "@/utils/indexerHelper";


export async function bindApi2Window() {
    const worker = await useWorker();
    window["__opaqueGlassVectorIndexService"] = {
        version: "1.0.0",
        versionCode: 1,
        api: {
            "getAvailableServices": worker.getAvailableServices,
            "query": worker.query,
            "isAvailable": async function() {
                return (await worker.getAllRegisteredServices()).length > 0;
            },
        }
    };
}

export async function unbindApi() {
    delete window["__opaqueGlassVectorIndexService"];
}