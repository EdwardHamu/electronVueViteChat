/**
 * 画布几何工具（纯函数，便于单测）
 */
import type { CanvasConfig, WidgetRect } from './types'

export const snap = (v: number, grid: number) => {
  if (!grid || grid <= 1) return Math.round(v)
  return Math.round(v / grid) * grid
}

/** 把矩形限制在画布内，并保证不小于最小尺寸 */
export const clampRect = (rect: WidgetRect, canvas: { width: number; height: number }, min: { w: number; h: number }): WidgetRect => {
  let w = Math.max(min.w, Math.min(rect.w, canvas.width))
  let h = Math.max(min.h, Math.min(rect.h, canvas.height))
  let x = Math.max(0, Math.min(rect.x, canvas.width - w))
  let y = Math.max(0, Math.min(rect.y, canvas.height - h))
  return { x, y, w, h }
}

/** 等比缩放系数：让 W×H 的逻辑画布完整放进 cw×ch 的容器 */
export const fitScale = (cw: number, ch: number, W: number, H: number) => {
  if (!cw || !ch || !W || !H) return 1
  return Math.min(cw / W, ch / H)
}

export const rectsOverlap = (a: WidgetRect, b: WidgetRect) => {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

/**
 * 在画布上找一个不与现有组件重叠的位置（按网格逐行扫描），找不到则层叠放置
 */
export const findFreeSpot = (widgets: WidgetRect[], size: { w: number; h: number }, canvas: CanvasConfig): { x: number; y: number } => {
  const step = Math.max(canvas.grid || 10, 10)
  const w = Math.min(size.w, canvas.width)
  const h = Math.min(size.h, canvas.height)
  for (let y = 0; y + h <= canvas.height; y += step) {
    for (let x = 0; x + w <= canvas.width; x += step) {
      const candidate = { x, y, w, h }
      if (!widgets.some(r => rectsOverlap(candidate, r))) {
        return { x, y }
      }
    }
  }
  const n = widgets.length
  const off = (n % 10) * step * 2
  return clampRect({ x: off, y: off, w, h }, canvas, { w, h })
}

export const cloneDeep = <T,>(v: T): T => JSON.parse(JSON.stringify(v))

/** 数值格式化：null / 非数字显示占位符 */
export const formatValue = (value: number | null | undefined, precision?: number, placeholder = '--') => {
  if (value === null || value === undefined || Number.isNaN(value)) return placeholder
  const p = typeof precision === 'number' && precision >= 0 && precision <= 10 ? precision : 2
  return Number(value).toFixed(p)
}
