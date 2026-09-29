/**
 * 颜色选择器的预设颜色表：所有 ColorField 共用一份，增删后持久化到 localStorage（key `scadaColorPresets`），
 * 与布局存储（storage.ts）一样走 localStorage，重启后仍在。列表被清空或数据损坏时回落到默认表。
 */
import { reactive } from 'vue'
import { normalizeHex } from './color'

export const COLOR_PRESETS_KEY = 'scadaColorPresets'
/** 预设数量上限：8 列网格 × 8 行 */
export const COLOR_PRESETS_MAX = 64

/** 默认预设：黑白灰 + 常用状态色 + 工业看板常用底色（8 的倍数，正好铺满网格） */
export const DEFAULT_COLOR_PRESETS: readonly string[] = [
  '#ffffff', '#f4f5f7', '#e5e7eb', '#9ca3af', '#64748b', '#374151', '#1f2937', '#000000',
  '#ff0000', '#ff8d3f', '#f59e0b', '#facc15', '#22c55e', '#10b981', '#06b6d4', '#2563eb',
  '#1e3a8a', '#7c3aed', '#ec4899', '#a16207', '#0f172a', '#111827', '#0b3d2e', '#f8fafc'
]

const state = reactive({
  colors: [] as string[],
  loaded: false
})

const sanitize = (list: unknown): string[] => {
  if (!Array.isArray(list)) return []
  const out: string[] = []
  list.forEach(item => {
    const hex = normalizeHex(item)
    if (hex && !out.includes(hex)) out.push(hex)
  })
  return out.slice(0, COLOR_PRESETS_MAX)
}

const persist = () => {
  try {
    localStorage.setItem(COLOR_PRESETS_KEY, JSON.stringify(state.colors))
  } catch (err) {
    console.warn('[scada] save color presets failed', err)
  }
}

export const loadColorPresets = (): string[] => {
  if (state.loaded) return state.colors
  let saved: string[] = []
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(COLOR_PRESETS_KEY) : null
    if (raw) saved = sanitize(JSON.parse(raw))
  } catch (err) {
    console.warn('[scada] load color presets failed', err)
  }
  state.colors = saved.length ? saved : DEFAULT_COLOR_PRESETS.slice()
  state.loaded = true
  return state.colors
}

/** 响应式的预设列表（首次访问时自动从 localStorage 加载） */
export const useColorPresets = () => {
  loadColorPresets()
  return state
}

/** 加入一个预设（追加到末尾）；已存在、非法或超出上限时返回 false */
export const addColorPreset = (color: string): boolean => {
  loadColorPresets()
  const hex = normalizeHex(color)
  if (!hex || state.colors.includes(hex) || state.colors.length >= COLOR_PRESETS_MAX) return false
  state.colors.push(hex)
  persist()
  return true
}

export const removeColorPreset = (color: string): boolean => {
  loadColorPresets()
  const hex = normalizeHex(color)
  if (!hex) return false
  const i = state.colors.indexOf(hex)
  if (i < 0) return false
  state.colors.splice(i, 1)
  persist()
  return true
}

export const hasColorPreset = (color: string): boolean => {
  loadColorPresets()
  const hex = normalizeHex(color)
  return !!hex && state.colors.includes(hex)
}

export const resetColorPresets = () => {
  loadColorPresets()
  state.colors = DEFAULT_COLOR_PRESETS.slice()
  persist()
}
