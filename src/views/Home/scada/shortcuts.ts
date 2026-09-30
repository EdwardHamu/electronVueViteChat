/**
 * 编辑模式的页面级快捷键（任务 60）：按键 → 动作 的匹配是这里的纯函数，动作怎么执行在 index.tsx 的 onKeyDown 里。
 * （画布自己的按键——空格平移、+ / - / 0 缩放、Ctrl + A 全选、Ctrl + G / Shift + G 组合、Delete 删除、方向键微调——仍在 Canvas.tsx。）
 *
 *   Ctrl + Z                     撤销（最多回溯最近 10 步）
 *   Ctrl + Y / Ctrl + Shift + Z  重做
 *   Ctrl + S                     保存但留在编辑模式（输入框里也生效）
 *   Ctrl + C / X / V             复制 / 剪切 / 粘贴选中的组件（剪切不动锁定的；连续粘贴依次错开两格）
 *   Ctrl + D                     就地再制（原地偏移两格的副本）
 *   Ctrl + L                     锁定 / 解锁选中的组件
 *   Ctrl + ] / [                 上移 / 下移一层；加 Shift = 置顶 / 置底
 *   Tab / Shift + Tab            选中下一个 / 上一个组件（按层级顺序）
 *   Esc                          先退出全屏，否则取消选中
 *   F11                          全屏编辑 / 退出
 *   F1                           操作说明
 *
 * 约定：Ctrl 在 Mac 上也可以是 ⌘；弹窗 / 颜色浮层打开时一律不响应（让它们自己处理按键）；
 * 焦点在文本输入框里时，撤销 / 复制 / 粘贴 / Tab 等交给浏览器（输入框自己的撤销、复制粘贴文字），只有 Ctrl + S、F1、F11、Esc（退全屏）照常生效。
 */

export type ShortcutId =
  | 'undo'
  | 'redo'
  | 'save'
  | 'copy'
  | 'cut'
  | 'paste'
  | 'duplicate'
  | 'lock'
  | 'forward'
  | 'backward'
  | 'toFront'
  | 'toBack'
  | 'selectNext'
  | 'selectPrev'
  | 'deselect'
  | 'fullscreen'
  | 'help'

/** matchShortcut 只读这几个字段（KeyboardEvent 满足，测试里也可以传普通对象） */
export interface KeyLike {
  key: string
  code?: string
  ctrlKey?: boolean
  metaKey?: boolean
  shiftKey?: boolean
  altKey?: boolean
}

export const matchShortcut = (e: KeyLike): ShortcutId | null => {
  if (!e || typeof e.key !== 'string') return null
  const mod = !!(e.ctrlKey || e.metaKey)
  const key = e.key.toLowerCase()
  if (mod && !e.altKey) {
    if (key === 'z') return e.shiftKey ? 'redo' : 'undo'
    if (!e.shiftKey) {
      if (key === 'y') return 'redo'
      if (key === 's') return 'save'
      if (key === 'c') return 'copy'
      if (key === 'x') return 'cut'
      if (key === 'v') return 'paste'
      if (key === 'd') return 'duplicate'
      if (key === 'l') return 'lock'
    }
    // 方括号：带 Shift 时 key 会变成 { }，所以同时认物理键位 code
    if (e.code === 'BracketRight' || key === ']' || key === '}') return e.shiftKey ? 'toFront' : 'forward'
    if (e.code === 'BracketLeft' || key === '[' || key === '{') return e.shiftKey ? 'toBack' : 'backward'
    return null
  }
  if (mod || e.altKey) return null
  if (e.key === 'Tab') return e.shiftKey ? 'selectPrev' : 'selectNext'
  if (e.key === 'Escape') return 'deselect'
  if (e.key === 'F11') return 'fullscreen'
  if (e.key === 'F1') return 'help'
  return null
}

/** 焦点 / 事件目标是不是文本输入控件（这时撤销 / 复制 / 粘贴 / Tab 归浏览器） */
export const isTextEntry = (target: EventTarget | null | undefined) => {
  const el = target as HTMLElement | null | undefined
  if (!el || !el.tagName) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || !!el.isContentEditable
}

/**
 * 有没有弹窗 / 浮层打开：NModal（弹窗壳关闭后还会留一个空的 .n-modal-container，所以看它的子节点）、颜色浮层；
 * withMenus 时还包括下拉菜单（正在淡出的不算）——Esc 要先用来关它们
 */
export const overlayOpen = (withMenus = false) => {
  if (typeof document === 'undefined') return false
  const sel = withMenus ? '.n-modal-container > *, [data-color-popup], .n-dropdown-menu:not(.popover-transition-leave-active)' : '.n-modal-container > *, [data-color-popup]'
  return !!document.querySelector(sel)
}
