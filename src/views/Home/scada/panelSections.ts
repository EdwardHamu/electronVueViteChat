/**
 * 属性面板各区块的折叠状态（任务 61）。
 *  - 全局共享、按区块 id 记：单个组件 / 多选 / 画布三种面板里同 id 的区块（比如「操作」）共用一份，
 *    选中别的组件、退出再进入编辑都保持折叠；
 *  - 存 localStorage（scadaPanelCollapsed，折叠着的区块 id 数组），下次打开还是这样；损坏 / 不是字符串数组当作没有折叠；
 *  - 折叠只是界面状态：不进布局、不进撤销历史。
 */
import { reactive } from 'vue'

export const PANEL_COLLAPSED_KEY = 'scadaPanelCollapsed'

/** 读 localStorage 里的折叠列表：空 / 损坏 / 不是字符串数组都当没有，去重、丢掉过长的 id */
export const parseCollapsed = (raw: string | null | undefined): string[] => {
  if (!raw) return []
  try {
    const v = JSON.parse(raw)
    if (!Array.isArray(v)) return []
    return Array.from(new Set(v.filter((x): x is string => typeof x === 'string' && x.length > 0 && x.length <= 40)))
  } catch {
    return []
  }
}

const state = reactive<Record<string, boolean>>({})
let loaded = false
const load = () => {
  if (loaded) return
  loaded = true
  try {
    parseCollapsed(typeof localStorage !== 'undefined' ? localStorage.getItem(PANEL_COLLAPSED_KEY) : null).forEach(id => (state[id] = true))
  } catch {
    /* localStorage 不可用：只在内存里记 */
  }
}
const persist = () => {
  try {
    localStorage.setItem(PANEL_COLLAPSED_KEY, JSON.stringify(Object.keys(state).filter(k => state[k])))
  } catch {
    /* 存不了不影响使用 */
  }
}

/** 区块是否折叠着（读响应式状态：在渲染里调用会自动跟踪折叠 / 展开） */
export const isSectionCollapsed = (id: string) => {
  load()
  return !!state[id]
}

export const setSectionCollapsed = (id: string, collapsed: boolean) => {
  load()
  if (collapsed) state[id] = true
  else delete state[id]
  persist()
}

export const toggleSection = (id: string) => setSectionCollapsed(id, !isSectionCollapsed(id))

/** 当前折叠着的区块 id（测试 / 调试用） */
export const collapsedSections = () => {
  load()
  return Object.keys(state).filter(k => state[k])
}

/** 全部展开（测试 / 调试用） */
export const expandAllSections = () => {
  load()
  Object.keys(state).forEach(k => delete state[k])
  persist()
}
