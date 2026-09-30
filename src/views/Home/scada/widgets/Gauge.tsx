/**
 * 示例组件：仪表盘（SVG 240° 弧），外环显示公差带，指针 / 数值颜色随状态变化
 */
import { computed, defineComponent } from 'vue'
import { formatValue } from '../geometry'
import type { WidgetDefinition } from '../types'
import { displayName, fractionOf, pointText, resolveRange, statusColor, tt, widgetProps } from './common'
import { icons } from './icons'

const CX = 50
const CY = 50
const START = 210 // 起始角（左下）
const SWEEP = 240 // 顺时针扫过的角度

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))
const polar = (r: number, deg: number) => {
  const rad = (deg * Math.PI) / 180
  return { x: CX + r * Math.cos(rad), y: CY - r * Math.sin(rad) }
}
const angleAt = (f: number) => START - SWEEP * clamp01(f)
/** 从比例 f0 到 f1 的弧线 path */
const arcPath = (r: number, f0: number, f1: number) => {
  f0 = clamp01(f0)
  f1 = clamp01(f1)
  if (f1 - f0 < 0.0005) return ''
  const a0 = angleAt(f0)
  const a1 = angleAt(f1)
  const p0 = polar(r, a0)
  const p1 = polar(r, a1)
  const large = a0 - a1 > 180 ? 1 : 0
  return `M ${p0.x.toFixed(2)} ${p0.y.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`
}
const Gauge = defineComponent({
  name: 'ScadaGauge',
  props: widgetProps,
  setup(props) {
    const p = computed(() => props.widget.props)
    const color = computed(() => statusColor(props.point))
    /** 量程：优先组件属性，其次按公差带外扩 50%，再次 0 ~ 2×标准值，最后 0 ~ 100（common.resolveRange） */
    const range = computed(() => resolveRange(props.point, p.value.min, p.value.max))
    const frac = (v: number | null | undefined) => fractionOf(v, range.value)
    return () => {
      const point = props.point
      const name = displayName(props.widget, point)
      const f = frac(point?.value)
      const fl = frac(point?.lower)
      const fu = frac(point?.upper)
      const needleAngle = angleAt(f === null ? 0 : f)
      const tip = polar(30, needleAngle)
      const tail = polar(6, needleAngle + 180)
      const precision = point?.precision
      const text = pointText(point, p.value.decimals)
      const valueFont = text.length > 6 ? 9 : 12
      return (
        <div class={'w-full h-full flex flex-col rounded-md overflow-hidden border border-solid border-gray-300'}
          style={{ background: p.value.bg || '#ffffff', color: p.value.fg || '#1f2937' }}>
          {p.value.showTitle && (
            <div class={'px-2 leading-6 text-sm truncate text-center shrink-0'}>{name || tt('scada.widget.unbound')}</div>
          )}
          <svg class={'flex-1 min-h-0 w-full'} viewBox="0 0 100 74" preserveAspectRatio="xMidYMid meet">
            {/* 外环：公差带 */}
            <path d={arcPath(45, 0, 1)} stroke={fl !== null && fu !== null ? '#fecaca' : '#e5e7eb'} stroke-width="3" fill="none" stroke-linecap="round" />
            {fl !== null && fu !== null && <path d={arcPath(45, fl, fu)} stroke="#86efac" stroke-width="3" fill="none" />}
            {/* 主环：轨道 + 当前值 */}
            <path d={arcPath(37, 0, 1)} stroke="#e5e7eb" stroke-width="9" fill="none" stroke-linecap="round" />
            {f !== null && f > 0 && <path d={arcPath(37, 0, f)} stroke={color.value} stroke-width="9" fill="none" stroke-linecap="round" />}
            {/* 指针 */}
            <line x1={tail.x.toFixed(2)} y1={tail.y.toFixed(2)} x2={tip.x.toFixed(2)} y2={tip.y.toFixed(2)} stroke={p.value.fg || '#1f2937'} stroke-width="2" stroke-linecap="round" />
            <circle cx={CX} cy={CY} r="3.2" fill={p.value.fg || '#1f2937'} />
            {/* 数值 / 单位 */}
            <text x={CX} y="41" text-anchor="middle" font-size={valueFont} font-weight="bold" fill={color.value} class={'value-number'}>{text}</text>
            {point?.unit && <text x={CX} y="61" text-anchor="middle" font-size="6" fill="currentColor" opacity="0.8">{point.unit}</text>}
            {/* 量程 */}
            <text x="25" y="68" text-anchor="start" font-size="5" fill="currentColor" opacity="0.7">{formatValue(range.value.min, precision)}</text>
            <text x="75" y="68" text-anchor="end" font-size="5" fill="currentColor" opacity="0.7">{formatValue(range.value.max, precision)}</text>
          </svg>
        </div>
      )
    }
  }
})

export const gaugeDefinition: WidgetDefinition = {
  type: 'gauge',
  label: () => tt('scada.widget.gauge'),
  description: () => tt('scada.widget.gaugeDesc'),
  icon: icons.gauge,
  category: 'data',
  defaultSize: { w: 200, h: 180 },
  minSize: { w: 90, h: 90 },
  needsBinding: true,
  defaultProps: () => ({ showTitle: true, min: null, max: null, decimals: null, bg: '#ffffff', fg: '#1f2937' }),
  propSchema: [
    { key: 'showTitle', label: () => tt('scada.prop.showTitle'), type: 'boolean' },
    { key: 'min', label: () => tt('scada.prop.min'), type: 'number', placeholder: 'auto' },
    { key: 'max', label: () => tt('scada.prop.max'), type: 'number', placeholder: 'auto' },
    { key: 'decimals', label: () => tt('scada.prop.decimals'), type: 'number', min: 0, max: 8, step: 1, placeholder: 'auto' },
    { key: 'bg', label: () => tt('scada.prop.bg'), type: 'color' },
    { key: 'fg', label: () => tt('scada.prop.fg'), type: 'color' }
  ],
  component: Gauge
}

export default Gauge
