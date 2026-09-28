/**
 * 组件共用的小工具：状态配色、显示名、字号自适应
 */
import type { PropType } from 'vue'
import i18n from '@/i18n'
import { formatValue } from '../geometry'
import type { DataPoint, PointStatus, WidgetInstance } from '../types'

export const STATUS_COLORS: Record<PointStatus, string> = {
  ok: '#22c55e',
  high: '#ef4444',
  low: '#3b82f6',
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

/** 根据可用宽高和字符数估算字号 */
export const autoFontSize = (w: number, h: number, chars: number, ratio = 0.6, max = 200) => {
  const byHeight = h
  const byWidth = chars > 0 ? w / (chars * ratio) : h
  return Math.max(10, Math.min(max, byHeight, byWidth))
}

export const tt = (key: string) => i18n.global.t(key)

/** 所有组态组件统一的 props 定义 */
export const widgetProps = {
  widget: { type: Object as PropType<WidgetInstance>, required: true as const },
  point: { type: Object as PropType<DataPoint | undefined>, default: undefined },
  editing: { type: Boolean, default: false },
  history: { type: Array as PropType<number[]>, default: () => [] }
}
