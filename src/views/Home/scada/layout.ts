/**
 * 布局的默认值与反序列化校验（纯函数）
 */
import { normRotate } from './geometry'
import type { CanvasConfig, DataBinding, ScadaLayout, WidgetInstance } from './types'

export const LAYOUT_VERSION = 1

export const DEFAULT_CANVAS: CanvasConfig = {
  width: 1280,
  height: 720,
  background: '#f4f5f7',
  grid: 10
}

export const createEmptyLayout = (width = DEFAULT_CANVAS.width, height = DEFAULT_CANVAS.height): ScadaLayout => ({
  version: LAYOUT_VERSION,
  canvas: { ...DEFAULT_CANVAS, width: Math.round(width), height: Math.round(height) },
  widgets: [],
  updatedAt: Date.now()
})

const num = (v: any, def: number) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : def
}

const normalizeBinding = (raw: any): DataBinding | null => {
  if (!raw || typeof raw !== 'object') return null
  if (typeof raw.source !== 'string' || typeof raw.key !== 'string' || !raw.source || !raw.key) return null
  const b: DataBinding = { source: raw.source, key: raw.key }
  if (typeof raw.label === 'string') b.label = raw.label
  return b
}

const normalizeWidget = (raw: any, index: number): WidgetInstance | null => {
  if (!raw || typeof raw !== 'object') return null
  if (typeof raw.type !== 'string' || !raw.type) return null
  const id = typeof raw.id === 'string' && raw.id ? raw.id : `w_${Date.now().toString(36)}_${index}`
  const widget: WidgetInstance = {
    id,
    type: raw.type,
    title: typeof raw.title === 'string' ? raw.title : '',
    binding: normalizeBinding(raw.binding),
    x: num(raw.x, 0),
    y: num(raw.y, 0),
    w: Math.max(10, num(raw.w, 100)),
    h: Math.max(10, num(raw.h, 60)),
    props: raw.props && typeof raw.props === 'object' ? { ...raw.props } : {}
  }
  if (typeof raw.transform === 'string' && raw.transform.trim()) widget.transform = raw.transform
  // 任务 59：旋转 / 翻转 / 锁定 / 组合 / 隐藏——都是可选字段，只保留有意义的值，老布局没有这些字段照常读取
  const rotate = normRotate(raw.rotate)
  if (rotate) widget.rotate = rotate
  if (raw.flipX === true) widget.flipX = true
  if (raw.flipY === true) widget.flipY = true
  if (raw.locked === true) widget.locked = true
  if (raw.hidden === true) widget.hidden = true
  if (typeof raw.groupId === 'string' && raw.groupId) widget.groupId = raw.groupId
  return widget
}

/**
 * 把任意来源（localStorage / 后端 / 导入文件）的对象整理成合法布局；完全不合法时返回 null。
 * 版本升级的迁移逻辑也放在这里（按 version 逐级处理）。
 */
export const normalizeLayout = (raw: any): ScadaLayout | null => {
  if (!raw || typeof raw !== 'object') return null
  const canvasRaw = raw.canvas && typeof raw.canvas === 'object' ? raw.canvas : {}
  const canvas: CanvasConfig = {
    width: Math.max(100, num(canvasRaw.width, DEFAULT_CANVAS.width)),
    height: Math.max(100, num(canvasRaw.height, DEFAULT_CANVAS.height)),
    background: typeof canvasRaw.background === 'string' && canvasRaw.background ? canvasRaw.background : DEFAULT_CANVAS.background,
    grid: Math.max(1, num(canvasRaw.grid, DEFAULT_CANVAS.grid))
  }
  const widgetsRaw = Array.isArray(raw.widgets) ? raw.widgets : []
  const widgets = widgetsRaw.map(normalizeWidget).filter((w: WidgetInstance | null): w is WidgetInstance => !!w)
  // 去重 id，避免拖拽时选中错乱
  const seen = new Set<string>()
  widgets.forEach((w: WidgetInstance, i: number) => {
    if (seen.has(w.id)) w.id = `${w.id}_${i}`
    seen.add(w.id)
  })
  // 组合至少要有两个成员：落单的 groupId 清掉（比如导入时缺了组件）
  const groupSize = new Map<string, number>()
  widgets.forEach((w: WidgetInstance) => {
    if (w.groupId) groupSize.set(w.groupId, (groupSize.get(w.groupId) || 0) + 1)
  })
  widgets.forEach((w: WidgetInstance) => {
    if (w.groupId && (groupSize.get(w.groupId) || 0) < 2) delete w.groupId
  })
  // let version = num(raw.version, 1)
  // if (version < 2) { ...migrate...; version = 2 }
  return {
    version: LAYOUT_VERSION,
    canvas,
    widgets,
    updatedAt: num(raw.updatedAt, Date.now())
  }
}
