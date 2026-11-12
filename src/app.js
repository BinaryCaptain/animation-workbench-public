import {mountWorkbench} from './ui.js';
import {exportVideo} from './video-collaboration.js';
import * as core from './collaboration-core.js';
import {connectArkClient} from './ark-client.js';
window.__workbench={...core,exportVideo};
window.animationWorkbench=mountWorkbench(document.querySelector('#app'),{onExport:exportVideo});
let modelStatus={configured:false,provider:'ark',visionEnabled:false};
window.animationWorkbench.getModelStatus=()=>({...modelStatus});
connectArkClient(window.animationWorkbench,{onStatus:status=>{modelStatus=status;}}).catch(()=>{});
