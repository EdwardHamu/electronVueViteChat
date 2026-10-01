/*
 * @Author:  
 * @Description:
 * @Date: 2022-12-27 10:33:58
 * @LastEditTime: 2023-01-13 17:43:43
 * @LastEditors:  
 */
import { createApp } from 'vue'
import './style.scss'

import App from './App.vue'
import router from "./router/index";
// import * as ElementPlusIconsVue from '@element-plus/icons-vue'
// import ElementPlus from 'element-plus'
import { createPinia } from 'pinia'
import drag from "v-drag"
import { listenAltF5, listenAllInputFocus } from './utils/utils';
import { initApp } from './i18n/index'
import { installNumberInputMark } from './utils/virtualKeyboard'
import { installDialogNoAutoFocus } from './utils/dialogDefaults'

// 所有 NInputNumber 的内部 <input> 带上 data-num-input="true"（虚拟键盘据此切到数字模式），必须在首次渲染前调用
installNumberInputMark()
// useDialog().create() 打开的弹窗默认不自动聚焦第一个输入框（显式传 autoFocus: true 的除外），见 utils/dialogDefaults.ts
installDialogNoAutoFocus()

// import "./keyboard.min.css";
// import KeyBoard from "vue-keyboard-virtual-next";

// import goViewLib from '@/components/goView/goViewLib.umd.cjs';
// import '@/components/goView/style.css'
listenAltF5(any => {
  window.location.reload()
})
document.onselectstart = function () {
  return false;
};
let app = createApp(App)
const pinia = createPinia()
// for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
//     app.component(key, component)
// }
// app.component("ChartEditor", goViewLib.ChartEditor)
// app.component("ChartPreview", goViewLib.ChartPreview)
// app.component("Project", goViewLib.Project)

const bootstrap = async () => {
  const i18n = await initApp()
  const app = createApp(App)
  app.use(router).use(pinia).use(i18n).use(drag).mount('#app')
}

bootstrap()

// app
//   // .use(KeyBoard)
//   .use(router)
//   .use(pinia)
//   .use(i18n)
//   .use(drag)

//   // .use(ElementPlus, {
//   //     locale: zhCn,
//   //   })
//   .mount('#app')
