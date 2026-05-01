/*
  Copyright (C) 2026 OpaqueGlass

  This program is released under the AGPLv3 license.
  For details, see:
  - License Text: https://www.gnu.org/licenses/agpl-3.0.html
  - License Summary: https://tldrlegal.com/license/gnu-affero-general-public-license-v3-(agpl-3.0)

  THERE IS NO WARRANTY FOR THE PROGRAM, TO THE EXTENT PERMITTED BY APPLICABLE LAW. EXCEPT WHEN 
  OTHERWISE STATED IN WRITING THE COPYRIGHT HOLDERS AND/OR OTHER PARTIES PROVIDE THE PROGRAM 
  "AS IS" WITHOUT WARRANTY OF ANY KIND, EITHER EXPRESSED OR IMPLIED, INCLUDING, BUT NOT LIMITED TO, 
  THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE. THE ENTIRE RISK
  AS TO THE QUALITY AND PERFORMANCE OF THE PROGRAM IS WITH YOU. SHOULD THE PROGRAM PROVE DEFECTIVE, 
  YOU ASSUME THE COST OF ALL NECESSARY SERVICING, REPAIR OR CORRECTION.

  IN NO EVENT UNLESS REQUIRED BY APPLICABLE LAW OR AGREED TO IN WRITING WILL ANY COPYRIGHT HOLDER, 
  OR ANY OTHER PARTY WHO MODIFIES AND/OR CONVEYS THE PROGRAM AS PERMITTED ABOVE, BE LIABLE TO YOU 
  FOR DAMAGES, INCLUDING ANY GENERAL, SPECIAL, INCIDENTAL OR CONSEQUENTIAL DAMAGES ARISING OUT OF 
  THE USE OR INABILITY TO USE THE PROGRAM (INCLUDING BUT NOT LIMITED TO LOSS OF DATA OR DATA BEING
  RENDERED INACCURATE OR LOSSES SUSTAINED BY YOU OR THIRD PARTIES OR A FAILURE OF THE PROGRAM TO
  OPERATE WITH ANY OTHER PROGRAMS), EVEN IF SUCH HOLDER OR OTHER PARTY HAS BEEN ADVISED OF THE
  POSSIBILITY OF SUCH DAMAGES.
*/
/**
 * 插件主入口文件
 * @license AGPL-3.0
 * @author OpaqueGlass
 */
import {
    Plugin,
    showMessage,
    getFrontend,
} from "siyuan";
import * as siyuan from "siyuan";
import "@/index.scss";

import { createApp } from "vue";
import settingVue from "./components/settings/settingCustomPage.vue";
import { setLanguage } from "./utils/lang";
import { commonPushCheck, debugPush, errorPush, logPush, setDebugLevel, warnPush } from "./logger";
import { initSettingProperty } from './manager/settingPageManager';
import { setPluginInstance } from "./utils/pluginHelper";
import { loadSettings } from "./manager/settingManager";
import EventHandler from "./manager/eventHandler";
import { removeStyle, setStyle } from "./manager/setStyle";
import { bindCommand } from "./manager/shortcutHandler";
import { generateUUID } from "@/utils/common";
import { startWorkerOnce, useWorker } from "./utils/indexerHelper";
import { DistributedLeaderClient } from "./manager/distributeInstanceManager";
import { bindApi2Window, unbindApi } from "./expose_api";
import OpenAI from 'openai';
import { ChromaClient } from "chromadb";


const STORAGE_NAME = "menu-config";

export default class OGVectorClientPlugin extends Plugin {
    private myEventHandler: EventHandler;
    private distributeInstanceManager: DistributedLeaderClient;

    async onload() {
        this.data[STORAGE_NAME] = {readonlyText: "Readonly"};
        setLanguage(this.i18n);
        setPluginInstance(this);
        initSettingProperty();
        bindCommand(this);
        // 载入设置项，此项必须在setPluginInstance之后被调用
        this.myEventHandler = new EventHandler();
        let wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        this.distributeInstanceManager = new DistributedLeaderClient(`${wsProtocol}//${window.location.host}/ws/broadcast?channel=opaqueglassvectorclient`, async (isLeader)=>{
            const worker = await useWorker();
            await worker.setLeaderFlag(isLeader);
        });
	    // 示例：将得到的svg复制过来，将元素类型修改为symbol，然后设置一个id应该就行
        // this.addIcons(`<symbol id="ogiconCopyImage" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-images"><path d="M18 22H4a2 2 0 0 1-2-2V6"/><path d="m22 13-1.296-1.296a2.41 2.41 0 0 0-3.408 0L11 18"/><circle cx="12" cy="8" r="2"/><rect width="16" height="16" x="6" y="2" rx="2"/></symbol>
        // <symbol id="ogiconSquareFunction" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-square-function"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><path d="M9 17c2 0 2.8-1 2.8-2.8V10c0-2 1-3.3 3.2-3"/><path d="M9 11.2h5.7"/></symbol>
        //     `);
    }

    onLayoutReady(): void {
        loadSettings().then(()=>{
            this.myEventHandler.bindHandler();
            setStyle();
            setDebugLevel(commonPushCheck());
            startWorkerOnce();
            bindApi2Window();
        }).catch((e)=>{
            showMessage("载入设置项失败。Load plugin settings faild. " + this.name);
            errorPush(e);
        });
    }

    onunload(): void {
        // 善后
        this.myEventHandler.unbindHandler();
        // 移除所有已经插入的导航区
        removeStyle();
        this.distributeInstanceManager.sendLeaveNotification();
        unbindApi();
    }

    async query(text: string, serviceId?: string) {
        const worker = await useWorker();
        return worker.query(text, serviceId);
    }
    async getAvailableServices() {
        const worker = await useWorker();
        return worker.getAvailableServices();
    }

    openSetting() {
        // 生成Dialog内容
        const uid = generateUUID();
        // 创建dialog
        const app = createApp(settingVue);
        const settingDialog = new siyuan.Dialog({
            "title": this.i18n["setting_panel_title"],
            "content": `
            <div id="og_plugintemplate_${uid}" style="overflow: hidden; position: relative;height: 100%;"></div>
            `,
            "width": isMobile() ? "92vw":"1040px",
            "height": isMobile() ? "50vw":"80vh",
            "destroyCallback": ()=>{app.unmount(); },
        });
        app.mount(`#og_plugintemplate_${uid}`);
    }
}

function isMobile() {
    return window.top.document.getElementById("sidebar") ? true : false;
};
