/**
 * naive-ui 弹窗（useDialog().create() / .info / .success / .warning / .error）的全局默认值调整（任务 65）。
 *
 * 默认 autoFocus = true：弹窗一打开就把焦点放进第一个可聚焦元素（通常是第一个输入框），在本应用里会
 *  - 触摸键盘开启时立刻弹出虚拟键盘（用户还没点输入框）；
 *  - 和虚拟键盘、弹窗焦点陷阱互相抢焦点（任务 64 的卡死就是这样触发的，那边已另外修复）。
 * 这里改成默认不自动聚焦：调用方没写 autoFocus 时按 false 处理；显式传 autoFocus: true 的仍然自动聚焦。
 *
 * 实现：DialogEnvironment（真正带 autoFocus 属性的组件）naive 没有导出，改不了它的默认值；
 * 但 NDialogProvider 的 setup 把弹窗列表（dialogList）交给自己的 render 去逐个渲染 DialogEnvironment，
 * 所以包一层 setup，把交给 render 的列表换成「没写 autoFocus 的补上 false」的计算属性。
 * useDialog() 拿到的 api（create 等）不变，create 返回的 DialogReactive 也还是原来那个对象（改它的属性照常生效）。
 * 必须在第一次渲染 NDialogProvider 之前调用（main.js 里 createApp 之前）；unplugin 自动引入和手写 import 是同一个组件对象。
 */
import { NDialogProvider } from 'naive-ui'
import { computed, type Ref } from 'vue'

let installed = false

export const installDialogNoAutoFocus = () => {
  if (installed) return
  const comp = NDialogProvider as unknown as { setup?: (...args: any[]) => any }
  const rawSetup = comp.setup
  if (typeof rawSetup !== 'function') return
  comp.setup = function (this: unknown, ...args: any[]) {
    const state = rawSetup.apply(this, args)
    const list = state && (state.dialogList as Ref<Record<string, any>[]> | undefined)
    if (!list || !('value' in list)) return state
    return {
      ...state,
      dialogList: computed(() => list.value.map(d => (d.autoFocus === undefined ? { ...d, autoFocus: false } : d)))
    }
  }
  installed = true
}
