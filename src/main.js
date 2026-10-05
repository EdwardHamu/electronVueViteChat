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
// 全局禁止鼠标选中文字（HMI 触摸屏防误选）。
// 例外：输入框 / 文本域 / contenteditable，以及显式声明可选中的区域（加 .selectable-text 类，
// 如数据处理函数弹窗的「组件属性」浮窗）——这些地方返回 undefined 走浏览器默认行为，可以正常拖选复制。
document.onselectstart = function (e) {
  const node = e && e.target
  const el = node instanceof Element ? node : node && node.parentElement
  if (el && el.closest('input, textarea, [contenteditable], .selectable-text')) return
  return false;
};
// 全局屏蔽右键菜单（含触摸屏长按触发的 contextmenu）：
// 只有显式声明了右键功能的区域（data-allow-contextmenu，如顶部「数据组态」tab 的展示菜单）走自己的处理，
// 其余一律 preventDefault，不弹浏览器 / WebView 默认菜单。
document.addEventListener('contextmenu', function (e) {
  const node = e.target
  const el = node instanceof Element ? node : node && node.parentElement
  if (el && el.closest('[data-allow-contextmenu]')) return
  e.preventDefault()
})
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
