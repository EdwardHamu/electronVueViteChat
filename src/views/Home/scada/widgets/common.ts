/**
 * 组件共用的小工具：状态配色、显示名、字号自适应
 */
import type { PropType } from 'vue'
import i18n from '@/i18n'
import { formatValue, normRotate } from '../geometry'
import type { DataPoint, PointStatus, WidgetInstance } from '../types'

/**
 * 状态配色。high / low 与首页右侧数值块（RightValueBlock）一致：
 * 超上限 = 橙色 text-[#ff8d3f]（'up'），低于下限 = 红色 text-[#ff0000]（'dowm'）
 */
export const STATUS_COLORS: Record<PointStatus, string> = {
  ok: '#22c55e',
  high: '#ff8d3f',
  low: '#ff0000',
  offline: '#9ca3af',
  none: '#64748b'
}

export const statusColor = (point: DataPoint | undefined, overrides?: Partial<Record<PointStatus, string>>) => {
  const s: PointStatus = point ? point.status : 'offline'
  return (overrides && overrides[s]) || STATUS_COLORS[s]
}

/** 组件标题：优先用户填写的 title，其次数据项名，最后绑定时记录的名字 */
export const displayName = (widget: WidgetInstance, point?: DataPoint) => {
  return widget.title || point?.name || widget.binding?.label || ''
}

/** 数值文本：组件 props.decimals 优先，其次数据源 precision */
export const pointText = (point: DataPoint | undefined, decimals?: number | null) => {
  if (!point) return '--'
  if (point.value === null && point.text) return point.text
  const p = typeof decimals === 'number' && decimals >= 0 ? decimals : point.precision
  return formatValue(point.value, p)
}

/** 宽松的数字解析：空串 / null / 非数字返回 null */
export const toNum = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/**
 * 量程：组件属性 min / max 可以只填一个（另一个取自动值）；自动值依次按公差带外扩 50%、0 ~ 2×标准值、0 ~ 100。
 * 填的上限不大于下限时整体回退到自动量程。（仪表盘 / 棒图 / 进度条 / 环形进度条 / 量表等按量程作图的组件共用）
 */
export const resolveRange = (point: DataPoint | undefined, minProp: unknown, maxProp: unknown) => {
  let autoMin = 0
  let autoMax = 100
  if (point && point.lower !== undefined && point.upper !== undefined && point.upper > point.lower) {
    const span = point.upper - point.lower
    autoMin = point.lower - span * 0.5
    autoMax = point.upper + span * 0.5
  } else if (point && point.standard) {
    autoMax = point.standard * 2
  }
  const min = toNum(minProp) ?? autoMin
  const max = toNum(maxProp) ?? autoMax
  return max > min ? { min, max } : { min: autoMin, max: autoMax }
}

/** 值在量程内的比例（0~1）；无值返回 null */
export const fractionOf = (v: number | null | undefined, range: { min: number; max: number }) => {
  if (v === null || v === undefined || !Number.isFinite(v)) return null
  const f = (v - range.min) / (range.max - range.min)
  return f < 0 ? 0 : f > 1 ? 1 : f
}

/** 根据可用宽高和字符数估算字号 */
export const autoFontSize = (w: number, h: number, chars: number, ratio = 0.6, max = 200) => {
  const byHeight = h
  const byWidth = chars > 0 ? w / (chars * ratio) : h
  return Math.max(10, Math.min(max, byHeight, byWidth))
}

/**
 * 指针在元素「自身坐标」里的位置比例（0 ~ 1，x 向右、y 向下）。组件被旋转 / 翻转后，画面上的外接框和组件自己的坐标轴不是一回事
 * （例如顺时针转 90° 的横向滑块，画面上从上到下才是它的从左到右），拖动取值的组件（滑块）用它按组件的 rotate / flipX / flipY 反算回去。
 * rect 取元素的 getBoundingClientRect()：画布的缩放已经包含在里面，比例与缩放无关。
 */
export const localFraction = (rect: { left: number; top: number; width: number; height: number }, clientX: number, clientY: number, w: { rotate?: number; flipX?: boolean; flipY?: boolean }) => {
  const u = rect.width > 0 ? (clientX - rect.left) / rect.width : 0
  const v = rect.height > 0 ? (clientY - rect.top) / rect.height : 0
  let fx = u
  let fy = v
  // 先撤销旋转（顺时针 90° 的逆运算），再撤销翻转（渲染时是先翻转再旋转）
  switch (normRotate(w.rotate)) {
    case 90:
      fx = v
      fy = 1 - u
      break
    case 180:
      fx = 1 - u
      fy = 1 - v
      break
    case 270:
      fx = 1 - v
      fy = u
      break
  }
  if (w.flipX) fx = 1 - fx
  if (w.flipY) fy = 1 - fy
  return { fx, fy }
}

/** 取文案；带 {name} 占位的文案必须把值通过 values 传给 vue-i18n（先 t() 再 replace 会把占位符吃掉） */
export const tt = (key: string, values?: Record<string, unknown>) => (values ? i18n.global.t(key, values) : i18n.global.t(key))

/** 所有组态组件统一的 props 定义 */
export const widgetProps = {
  widget: { type: Object as PropType<WidgetInstance>, required: true as const },
  point: { type: Object as PropType<DataPoint | undefined>, default: undefined },
  editing: { type: Boolean, default: false },
  history: { type: Array as PropType<number[]>, default: () => [] }
}
