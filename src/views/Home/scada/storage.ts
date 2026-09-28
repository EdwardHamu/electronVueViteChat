/**
 * 布局持久化抽象。
 * 目前项目的界面偏好（曲线选择、右侧数值块等）都存在 localStorage，这里保持一致；
 * 以后要存到 C# 侧数据库 / 服务器，只需实现 LayoutStorage 并 setLayoutStorage()。
 */
import { normalizeLayout } from './layout'
import type { ScadaLayout } from './types'

export interface LayoutStorage {
  load(): Promise<ScadaLayout | null>
  save(layout: ScadaLayout): Promise<void>
  clear(): Promise<void>
}

export const SCADA_LAYOUT_KEY = 'scadaLayout'

export const localLayoutStorage: LayoutStorage = {
  async load() {
    try {
      const raw = localStorage.getItem(SCADA_LAYOUT_KEY)
      if (!raw) return null
      return normalizeLayout(JSON.parse(raw))
    } catch (err) {
      console.error('[scada] 读取布局失败', err)
      return null
    }
  },
  async save(layout) {
    localStorage.setItem(SCADA_LAYOUT_KEY, JSON.stringify(layout))
  },
  async clear() {
    localStorage.removeItem(SCADA_LAYOUT_KEY)
  }
}

let current: LayoutStorage = localLayoutStorage

export const getLayoutStorage = () => current
export const setLayoutStorage = (storage: LayoutStorage) => {
  current = storage
}

/** 导出 / 导入 JSON 文本（备份、跨设备复制布局） */
export const exportLayoutText = (layout: ScadaLayout) => JSON.stringify(layout, null, 2)
export const importLayoutText = (text: string): ScadaLayout | null => {
  try {
    return normalizeLayout(JSON.parse(text))
  } catch {
    return null
  }
}
