/**
 * 应用内虚拟键盘（src/views/Home/GlobalKeyBoard.tsx）的公共工具：
 *  - 哪些输入框点击后弹出键盘（isKeyboardTarget）、系统配置「触摸键盘输入」开关的判定（isTouchKeyboardEnabled）；
 *  - 数字输入框的标记（NUM_INPUT_ATTR）：naive-ui 的 NInputNumber 在 installNumberInputMark() 之后，内部 <input> 自动带上
 *    data-num-input="true"，键盘据此切到数字模式（isNumberInput）；
 *  - 把键盘输入区的内容写回真正的输入框（writeValueToInput）：走原生 value setter + input / change 事件，
 *    Vue 的 v-model、naive 的 NInput / NInputNumber 都按「用户输入」处理。
 */
import { NInputNumber } from 'naive-ui'
import { noKeyBoardInputClass } from '@/views/Home/config/sysConfig/enum'

/** 键盘面板根元素的 class：里面的输入区自己不触发弹键盘、不记成「最后聚焦的输入框」 */
export const KEYBOARD_ROOT_CLASS = 'global-keyboard-root'

/** 数字输入框标记（加在 <input> 元素上） */
export const NUM_INPUT_ATTR = 'data-num-input'

/** 会弹出虚拟键盘的 <input type>（其余如 checkbox / file / range / date 不弹） */
const KEYBOARD_INPUT_TYPES = ['text', 'password', 'search', 'tel', 'url', 'email', 'number']

/**
 * 系统配置 InputType（「触摸键盘输入」开关，checkedValue 1 / uncheckedValue 0）是否为开启。
 * 兼容宿主可能返回的 true / "1" / "True"；未加载（undefined）视为关闭。
 */
export const isTouchKeyboardEnabled = (v: unknown) => {
  if (v === true || v === 1) return true
  if (typeof v === 'string') return v === '1' || v.toLowerCase() === 'true'
  return false
}

type TextEntry = HTMLInputElement | HTMLTextAreaElement

/** 点击 / 聚焦后应当弹出虚拟键盘的元素 */
export const isKeyboardTarget = (el: EventTarget | null | undefined): el is TextEntry => {
  if (!el || typeof (el as HTMLElement).tagName !== 'string') return false
  const node = el as HTMLElement
  // 键盘自己的输入区
  if (node.closest && node.closest('.' + KEYBOARD_ROOT_CLASS)) return false
  if (node.tagName === 'TEXTAREA') {
    const ta = node as HTMLTextAreaElement
    return !ta.readOnly && !ta.disabled
  }
  if (node.tagName !== 'INPUT') return false
  const input = node as HTMLInputElement
  if (!KEYBOARD_INPUT_TYPES.includes(input.type)) return false
  if (input.readOnly || input.disabled) return false
  // 显式声明不要键盘的区域（如「导出路径」这种点了弹文件夹选择框的输入框）
  if (input.closest('div.' + noKeyBoardInputClass)) return false
  // naive 下拉框（NSelect filterable）的搜索输入框
  if (typeof input.className === 'string' && input.className.includes('selection')) return false
  return true
}

/**
 * 是否数字输入框：带 NUM_INPUT_ATTR 标记（NInputNumber 自动带），或位于 NInputNumber 里（组件显式传了 inputProps、
 * 默认标记被覆盖时的兜底），或原生 type=number / inputmode=numeric|decimal。
 */
export const isNumberInput = (el: Element | null | undefined) => {
  if (!el) return false
  if (el.getAttribute(NUM_INPUT_ATTR) === 'true') return true
  if (el.closest && el.closest('.n-input-number')) return true
  if (el.tagName === 'INPUT' && (el as HTMLInputElement).type === 'number') return true
  const mode = el.getAttribute('inputmode')
  return mode === 'numeric' || mode === 'decimal'
}

/**
 * 把值写进真正的输入框：先聚焦（naive 的 NInputNumber 在失焦时才规整 / 夹紧数值），用原生 setter 写 value
 * （绕过 Vue / naive 对 value 属性的接管），派发 input + change，最后失焦——
 * 触发表单的 blur 校验，也让用户再点一次同一个输入框时能重新弹出键盘（已聚焦的元素再点不会有 focusin）。
 */
export const writeValueToInput = (el: TextEntry, value: string) => {
  const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set
  if (typeof el.focus === 'function') el.focus({ preventScroll: true })
  if (setter) setter.call(el, value)
  else el.value = value
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.dispatchEvent(new Event('change', { bubbles: true }))
  if (typeof el.blur === 'function') el.blur()
}

/**
 * 让弹窗的焦点陷阱放过虚拟键盘（任务 64：设备分组「新增」弹窗卡死）。
 *
 * naive-ui 的 NModal / useDialog / NDrawer 用 vueuc 的 FocusTrap：在 document 上以捕获阶段监听 focus，
 * 焦点一跑到弹窗外面就 resetFocusTo('first') 拉回弹窗里第一个可聚焦元素。虚拟键盘不在弹窗里，它打开时会把焦点移到
 * 自己的输入区 → 焦点陷阱把焦点拉回弹窗里的输入框 → focusin 又「打开」一次键盘 → 键盘再聚焦输入区 ……
 * 全在微任务里来回，页面卡死（弹窗打开时自动聚焦输入框，所以一点「新增」就触发）。
 *
 * 这里在 window 上以捕获阶段监听 focus（比 document 上的监听先执行），焦点落在键盘里时停止传播，
 * 焦点陷阱就看不到这次焦点变化；焦点回到页面其它地方时照常。返回卸载函数。
 */
export const installFocusTrapBypass = () => {
  if (typeof window === 'undefined') return () => {}
  const onFocus = (e: FocusEvent) => {
    const target = e.target as HTMLElement | null
    if (target && typeof target.closest === 'function' && target.closest('.' + KEYBOARD_ROOT_CLASS)) e.stopPropagation()
  }
  window.addEventListener('focus', onFocus, true)
  return () => window.removeEventListener('focus', onFocus, true)
}

let numberMarkInstalled = false
/**
 * 给所有 NInputNumber 的内部 <input> 打上数字输入框标记：改 naive 组件 inputProps 的默认值，
 * 必须在第一次渲染 NInputNumber 之前调用（main.js 里 createApp 之前）。unplugin 自动引入和手写 import 用的是同一个组件对象，都生效。
 * 显式传了 inputProps 的 NInputNumber 会覆盖这个默认值——那种情况由 isNumberInput() 的 `.n-input-number` 兜底，
 * 需要标记时请在自己的 inputProps 里带上 { [NUM_INPUT_ATTR]: 'true' }。
 */
export const installNumberInputMark = () => {
  if (numberMarkInstalled) return
  const comp = NInputNumber as unknown as { props?: Record<string, any> }
  if (!comp.props) return
  comp.props.inputProps = { type: Object, default: () => ({ [NUM_INPUT_ATTR]: 'true' }) }
  numberMarkInstalled = true
}
