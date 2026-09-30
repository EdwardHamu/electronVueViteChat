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

// ---------------------------------------------------------------- 旋转 / 翻转 / 视觉外框（任务 59）
//
// 组件的 x / y / w / h 描述「旋转前」的外框，旋转 / 翻转绕外框中心进行（CSS transform）。
// 旋转只有 0 / 90 / 180 / 270 四档，所以画面上看到的外框（视觉外框）始终是轴对齐矩形：90 / 270 时宽高互换、中心不变。
// 对齐 / 分布 / 缩放 / 画布越界判断都按视觉外框算，最后再换算回 x / y / w / h。

export type Rotation = 0 | 90 | 180 | 270

/** 归一化为 0 / 90 / 180 / 270（其它角度取最近的 90° 倍数；非数字为 0） */
export const normRotate = (r: unknown): Rotation => {
  const n = Number(r)
  if (!Number.isFinite(n)) return 0
  return ((((Math.round(n / 90) % 4) + 4) % 4) * 90) as Rotation
}

/** 是否 90° / 270°（此时视觉外框的宽高与 w / h 互换） */
export const isQuarterTurn = (r: unknown) => {
  const n = normRotate(r)
  return n === 90 || n === 270
}

type Rotatable = WidgetRect & { rotate?: number }

/** 旋转前的外框 → 画面上看到的外框（中心不变，90° / 270° 宽高互换） */
export const visualRect = (w: Rotatable): WidgetRect => {
  if (!isQuarterTurn(w.rotate)) return { x: w.x, y: w.y, w: w.w, h: w.h }
  return { x: w.x + (w.w - w.h) / 2, y: w.y + (w.h - w.w) / 2, w: w.h, h: w.w }
}

/** 视觉外框 → 旋转前的外框（visualRect 的逆运算）；旋转 90° / 270° 时 x / y 取整，避免出现 .5 的坐标 */
export const layoutFromVisual = (v: WidgetRect, rotate?: number): WidgetRect => {
  if (!isQuarterTurn(rotate)) return { x: v.x, y: v.y, w: v.w, h: v.h }
  return { x: Math.round(v.x + (v.w - v.h) / 2), y: Math.round(v.y + (v.h - v.w) / 2), w: v.h, h: v.w }
}

/** 一组矩形的外接矩形；空数组返回 null */
export const unionRect = (rects: WidgetRect[]): WidgetRect | null => {
  if (!rects.length) return null
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  rects.forEach(r => {
    x0 = Math.min(x0, r.x)
    y0 = Math.min(y0, r.y)
    x1 = Math.max(x1, r.x + r.w)
    y1 = Math.max(y1, r.y + r.h)
  })
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

/** 按「视觉外框」把组件限制在画布内（旋转 90° / 270° 时宽高互换后再夹紧），返回旋转前的外框；min 是 w / h 的最小值（未旋转口径） */
export const clampLayoutRect = (rect: WidgetRect, rotate: number | undefined, canvas: { width: number; height: number }, min: { w: number; h: number }): WidgetRect => {
  if (!isQuarterTurn(rotate)) return clampRect(rect, canvas, min)
  const v = clampRect(visualRect({ ...rect, rotate }), canvas, { w: min.h, h: min.w })
  return layoutFromVisual(v, rotate)
}

/** 组件外层 div 的 CSS transform（先翻转、再旋转，绕中心）；没有旋转 / 翻转返回空串 */
export const transformCss = (w: { rotate?: number; flipX?: boolean; flipY?: boolean }) => {
  const r = normRotate(w.rotate)
  const parts: string[] = []
  if (r) parts.push(`rotate(${r}deg)`)
  if (w.flipX || w.flipY) parts.push(`scale(${w.flipX ? -1 : 1}, ${w.flipY ? -1 : 1})`)
  return parts.join(' ')
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
