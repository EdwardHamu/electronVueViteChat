/**
 * 示例组件：迷你趋势——宿主保留最近 N 个值（keepHistory），这里用 SVG 折线画出来，可叠加公差线
 */
import { computed, defineComponent } from 'vue'
import { formatValue } from '../geometry'
import type { WidgetDefinition } from '../types'
import { displayName, pointText, STATUS_COLORS, statusColor, tt, widgetProps } from './common'

const PAD_X = 6
const HEADER = 24

const Sparkline = defineComponent({
  name: 'ScadaSparkline',
  props: widgetProps,
  setup(props) {
    const p = computed(() => props.widget.props)
    const color = computed(() => p.value.lineColor || statusColor(props.point))
    const geometry = computed(() => {
      const w = props.widget.w
      const h = props.widget.h - (p.value.showTitle ? HEADER : 0)
      const data = props.history || []
      const point = props.point
      const values = data.slice()
      if (p.value.showLimits && point) {
        if (point.upper !== undefined) values.push(point.upper)
        if (point.lower !== undefined) values.push(point.lower)
      }
      let min = values.length ? Math.min(...values) : 0
      let max = values.length ? Math.max(...values) : 1
      if (max - min < 1e-9) {
        const pad = Math.abs(max) * 0.05 || 1
        min -= pad
        max += pad
      } else {
        const pad = (max - min) * 0.1
        min -= pad
        max += pad
      }
      const top = 4
      const bottom = h - 4
      const yOf = (v: number) => bottom - ((v - min) / (max - min)) * (bottom - top)
      const n = Math.max(2, Number(p.value.points) || 60)
      const xOf = (i: number) => PAD_X + (i / (n - 1)) * (w - PAD_X * 2)
      const offset = Math.max(0, n - data.length)
      const pts = data.map((v, i) => `${xOf(offset + i).toFixed(1)},${yOf(v).toFixed(1)}`)
      const area = pts.length > 1 ? `M ${xOf(offset).toFixed(1)} ${bottom} L ${pts.join(' L ')} L ${xOf(offset + data.length - 1).toFixed(1)} ${bottom} Z` : ''
      return { w, h, yOf, pts: pts.join(' '), area, min, max }
    })
    return () => {
      const point = props.point
      const g = geometry.value
      const name = displayName(props.widget, point)
      return (
        <div class={'w-full h-full flex flex-col rounded-md overflow-hidden border border-solid border-gray-300'}
          style={{ background: p.value.bg || '#ffffff', color: p.value.fg || '#1f2937' }}>
          {p.value.showTitle && (
            <div class={'px-2 text-sm flex items-center justify-between shrink-0'} style={{ height: HEADER + 'px' }}>
              <span class={'truncate'}>{name || tt('scada.widget.unbound')}</span>
              <span class={'font-bold value-number shrink-0 ml-2'} style={{ color: statusColor(point) }}>
                {pointText(point, p.value.decimals)}{point?.unit ? ' ' + point.unit : ''}
              </span>
            </div>
          )}
          <svg class={'flex-1 min-h-0 w-full'} viewBox={`0 0 ${g.w} ${g.h}`} preserveAspectRatio="none">
            {p.value.showLimits && point?.upper !== undefined && (
              <line x1={PAD_X} x2={g.w - PAD_X} y1={g.yOf(point.upper)} y2={g.yOf(point.upper)} stroke={STATUS_COLORS.high} stroke-width="1" stroke-dasharray="4 3" />
            )}
            {p.value.showLimits && point?.lower !== undefined && (
              <line x1={PAD_X} x2={g.w - PAD_X} y1={g.yOf(point.lower)} y2={g.yOf(point.lower)} stroke={STATUS_COLORS.low} stroke-width="1" stroke-dasharray="4 3" />
            )}
            {p.value.showLimits && point?.standard !== undefined && (
              <line x1={PAD_X} x2={g.w - PAD_X} y1={g.yOf(point.standard)} y2={g.yOf(point.standard)} stroke="#9ca3af" stroke-width="1" stroke-dasharray="2 3" />
            )}
            {p.value.fill && g.area && <path d={g.area} fill={color.value} opacity="0.12" />}
            {g.pts && <polyline points={g.pts} fill="none" stroke={color.value} stroke-width={p.value.lineWidth || 2} stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke" />}
            {!(props.history && props.history.length) && (
              <text x={g.w / 2} y={g.h / 2} text-anchor="middle" font-size="12" fill="#9ca3af">{tt('scada.widget.noData')}</text>
            )}
          </svg>
          {p.value.showRange && (
            <div class={'px-2 pb-0.5 text-[10px] flex justify-between opacity-70 shrink-0'}>
              <span>{formatValue(g.min, point?.precision)}</span>
              <span>{formatValue(g.max, point?.precision)}</span>
            </div>
          )}
        </div>
      )
    }
  }
})

export const sparklineDefinition: WidgetDefinition = {
  type: 'sparkline',
  label: () => tt('scada.widget.sparkline'),
  description: () => tt('scada.widget.sparklineDesc'),
  defaultSize: { w: 300, h: 140 },
  minSize: { w: 100, h: 50 },
  needsBinding: true,
  keepHistory: 300,
  defaultProps: () => ({ showTitle: true, showLimits: true, showRange: false, fill: true, points: 60, lineWidth: 2, lineColor: '', decimals: null, bg: '#ffffff', fg: '#1f2937' }),
  propSchema: [
    { key: 'showTitle', label: () => tt('scada.prop.showTitle'), type: 'boolean' },
    { key: 'showLimits', label: () => tt('scada.prop.showLimits'), type: 'boolean' },
    { key: 'showRange', label: () => tt('scada.prop.showRange'), type: 'boolean' },
    { key: 'fill', label: () => tt('scada.prop.fill'), type: 'boolean' },
    { key: 'points', label: () => tt('scada.prop.points'), type: 'number', min: 2, max: 300, step: 1 },
    { key: 'lineWidth', label: () => tt('scada.prop.lineWidth'), type: 'number', min: 1, max: 10, step: 1 },
    { key: 'lineColor', label: () => tt('scada.prop.lineColor'), type: 'color' },
    { key: 'decimals', label: () => tt('scada.prop.decimals'), type: 'number', min: 0, max: 8, step: 1, placeholder: 'auto' },
    { key: 'bg', label: () => tt('scada.prop.bg'), type: 'color' },
    { key: 'fg', label: () => tt('scada.prop.fg'), type: 'color' }
  ],
  component: Sparkline
}

export default Sparkline
