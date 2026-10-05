/**
 * 标准趋势：可绑定多个数据项的时间趋势图（迷你趋势的完整版）。
 *  - 多数据绑定：绑定列表存在 props.bindings（DataBinding[]），由属性面板复用数据项选择浮窗逐个添加，
 *    每条绑定记录自己的数据源，组件按绑定各自订阅 / 读取；
 *  - 组件自己按秒采样维护每条曲线的历史（带时间戳，与宿主 history 无关）；
 *  - 明确的 X / Y 坐标轴：X 轴为时间轴（显示格式可自定义，YYYY MM DD HH mm ss 令牌），Y 轴为数值轴，带刻度和网格线；
 *  - 公差线：取第一条绑定的上 / 下限画横向虚线，公差值直接标注在对应虚线旁。
 */
import { computed, defineComponent, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { formatValue } from '../geometry'
import { getDataSource } from '../dataSource'
import type { DataBinding, DataPoint, WidgetDefinition } from '../types'
import { STATUS_COLORS, tt, widgetProps } from './common'
import { formatDate } from './controlCommon'
import { icons } from './icons'

/** 曲线调色板（按绑定顺序取色，循环使用） */
const SERIES_COLORS = ['#2563eb', '#dc2626', '#16a34a', '#f59e0b', '#7c3aed', '#0891b2', '#be185d', '#4b5563']

const LEGEND_H = 22
const ML = 46 // 左侧留给 Y 轴刻度
const MR = 12
const MT = 8
const MB = 20 // 底部留给 X 轴刻度

interface TrendSample {
  t: number
  v: number
}

const bufKey = (b: DataBinding) => `${b.source}|${b.key}`

const Trend = defineComponent({
  name: 'ScadaTrend',
  props: widgetProps,
  setup(props) {
    const p = computed(() => props.widget.props)
    const bindings = computed<DataBinding[]>(() =>
      Array.isArray(p.value.bindings) ? (p.value.bindings as DataBinding[]).filter(b => b && typeof b === 'object' && !!b.source && !!b.key) : []
    )
    const spanMs = computed(() => Math.max(5, Number(p.value.timeSpan) || 60) * 1000)
    const readOf = (b: DataBinding): DataPoint | undefined => getDataSource(b.source)?.read(b.key)
    /** 图例 / 提示用名称：数据源里的当前名称优先，数据项已被删时退回绑定时记下的名称 */
    const labelOf = (b: DataBinding) => {
      const opt = getDataSource(b.source)?.options().find(o => o.key === b.key)
      return opt ? opt.label : b.label || b.key
    }

    // ---- 自己维护带时间戳的历史：每秒采样一次当前值
    const buffers = new Map<string, TrendSample[]>()
    const rev = ref(0)
    const now = ref(Date.now())

    // ---- 按绑定订阅（每条绑定各自的数据源；与表格组件相同的按需订阅模式）
    let unsubs: (() => void)[] = []
    const clearSubs = () => {
      unsubs.forEach(u => u())
      unsubs = []
    }
    watch(
      () => bindings.value.map(bufKey).join(','),
      () => {
        clearSubs()
        unsubs = bindings.value
          .map(b => getDataSource(b.source)?.subscribe?.(b.key))
          .filter((u): u is () => void => typeof u === 'function')
        // 被移除的绑定丢弃对应曲线
        const keep = new Set(bindings.value.map(bufKey))
        Array.from(buffers.keys()).forEach(k => { if (!keep.has(k)) buffers.delete(k) })
        rev.value++
      },
      { immediate: true }
    )

    const sample = () => {
      now.value = Date.now()
      let changed = false
      bindings.value.forEach(b => {
        const pt = readOf(b)
        const v = pt && typeof pt.value === 'number' && Number.isFinite(pt.value) ? pt.value : null
        if (v === null) return
        const k = bufKey(b)
        let buf = buffers.get(k)
        if (!buf) {
          buf = []
          buffers.set(k, buf)
        }
        const last = buf[buf.length - 1]
        // 同一次更新（时间戳相同且值未变）不重复记录
        const t = pt?.time && pt.time > 0 ? pt.time : now.value
        if (last && last.t === t && last.v === v) return
        buf.push({ t, v })
        // 只保留窗口内的点（多留 1/4 作缓冲）
        const minT = now.value - spanMs.value * 1.25
        while (buf.length > 2 && buf[0].t < minT) buf.shift()
        if (buf.length > 3000) buf.splice(0, buf.length - 3000)
        changed = true
      })
      if (changed) rev.value++
    }
    let timer: ReturnType<typeof setInterval> | null = null
    onMounted(() => {
      sample()
      timer = setInterval(sample, 1000)
    })
    onBeforeUnmount(() => {
      if (timer) clearInterval(timer)
      clearSubs()
    })

    /** 小数位：组件属性优先，否则跟随数据项精度 */
    const decimalsOf = (pt?: DataPoint) => {
      const d = Number(p.value.decimals)
      return Number.isFinite(d) && p.value.decimals !== null && p.value.decimals !== '' ? d : pt?.precision
    }

    // ---- 几何计算
    const geometry = computed(() => {
      void rev.value // 采样后重算
      const showLegend = p.value.showLegend !== false
      const w = props.widget.w
      const h = props.widget.h - (showLegend ? LEGEND_H : 0)
      const x0 = ML
      const x1 = Math.max(x0 + 10, w - MR)
      const y0 = MT
      const y1 = Math.max(y0 + 10, h - MB)
      const t1 = now.value
      const t0 = t1 - spanMs.value
      const firstPoint = bindings.value.length ? readOf(bindings.value[0]) : undefined
      const showLimits = p.value.showLimits !== false
      const upper = showLimits ? firstPoint?.upper : undefined
      const lower = showLimits ? firstPoint?.lower : undefined
      const standard = showLimits ? firstPoint?.standard : undefined

      // Y 轴范围：窗口内全部采样值 + 公差线
      const vals: number[] = []
      bindings.value.forEach(b => {
        const buf = buffers.get(bufKey(b))
        if (buf) buf.forEach(s => { if (s.t >= t0 - 1000) vals.push(s.v) })
      })
      if (upper !== undefined) vals.push(upper)
      if (lower !== undefined) vals.push(lower)
      if (standard !== undefined) vals.push(standard)
      let min = vals.length ? Math.min(...vals) : 0
      let max = vals.length ? Math.max(...vals) : 1
      if (max - min < 1e-9) {
        const pad = Math.abs(max) * 0.05 || 1
        min -= pad
        max += pad
      } else {
        const pad = (max - min) * 0.1
        min -= pad
        max += pad
      }
      const xOf = (t: number) => x0 + ((t - t0) / (t1 - t0)) * (x1 - x0)
      const yOf = (v: number) => y1 - ((v - min) / (max - min)) * (y1 - y0)

      // 曲线
      const lines = bindings.value.map((b, i) => {
        const buf = (buffers.get(bufKey(b)) || []).filter(s => s.t >= t0 && s.t <= t1)
        return {
          key: bufKey(b),
          color: SERIES_COLORS[i % SERIES_COLORS.length],
          pts: buf.map(s => `${xOf(s.t).toFixed(1)},${yOf(s.v).toFixed(1)}`).join(' ')
        }
      })

      // 刻度：Y 轴 5 个，X 轴 5 个
      const yTicks = [0, 1, 2, 3, 4].map(i => {
        const v = min + ((max - min) * i) / 4
        return { y: yOf(v), label: formatValue(v, decimalsOf(firstPoint)) }
      })
      const fmt = String(p.value.timeFormat || '').trim() || 'HH:mm:ss'
      const xTicks = [0, 1, 2, 3, 4].map(i => {
        const t = t0 + ((t1 - t0) * i) / 4
        return { x: xOf(t), label: formatDate(t, fmt), anchor: i === 0 ? 'start' : i === 4 ? 'end' : 'middle' }
      })
      const hasData = lines.some(l => l.pts.length > 0)
      return { w, h, x0, x1, y0, y1, xOf, yOf, lines, yTicks, xTicks, upper, lower, standard, firstPoint, hasData, showLegend }
    })

    return () => {
      const g = geometry.value
      const lw = Number(p.value.lineWidth) || 2
      const dec = decimalsOf(g.firstPoint)
      const limitLabel = (v: number) => formatValue(v, dec)
      return (
        <div class={'w-full h-full flex flex-col rounded-md overflow-hidden border border-solid border-gray-300'}
          style={{ background: p.value.bg || '#ffffff', color: p.value.fg || '#1f2937' }} data-scada-trend>
          {g.showLegend && (
            <div class={'px-2 flex items-center gap-3 overflow-hidden shrink-0 text-xs'} style={{ height: LEGEND_H + 'px' }}>
              {bindings.value.length ? (
                bindings.value.map((b, i) => {
                  const pt = readOf(b)
                  return (
                    <span key={bufKey(b)} class={'flex items-center gap-1 min-w-0 shrink'} title={labelOf(b)}>
                      <span class={'shrink-0 rounded-full'} style={{ width: '8px', height: '8px', background: SERIES_COLORS[i % SERIES_COLORS.length] }} />
                      <span class={'truncate'}>{labelOf(b)}</span>
                      <span class={'shrink-0 font-bold value-number'}>
                        {pt && pt.value !== null && pt.value !== undefined ? formatValue(pt.value, dec) : '--'}{pt?.unit ? ' ' + pt.unit : ''}
                      </span>
                    </span>
                  )
                })
              ) : (
                <span class={'opacity-50'}>{tt('scada.widget.unbound')}</span>
              )}
            </div>
          )}
          <svg class={'flex-1 min-h-0 w-full'} viewBox={`0 0 ${g.w} ${g.h}`} preserveAspectRatio="none">
            {/* 网格 + Y 轴刻度 */}
            {g.yTicks.map((tk, i) => (
              <g key={'y' + i}>
                <line x1={g.x0} x2={g.x1} y1={tk.y} y2={tk.y} stroke="#e5e7eb" stroke-width="1" />
                <text x={g.x0 - 5} y={tk.y + 3} text-anchor="end" font-size="9" fill="#6b7280">{tk.label}</text>
              </g>
            ))}
            {/* X 轴刻度（时间） */}
            {g.xTicks.map((tk, i) => (
              <g key={'x' + i}>
                <line x1={tk.x} x2={tk.x} y1={g.y0} y2={g.y1} stroke="#f3f4f6" stroke-width="1" />
                <line x1={tk.x} x2={tk.x} y1={g.y1} y2={g.y1 + 3} stroke="#9ca3af" stroke-width="1" />
                <text x={tk.x} y={g.y1 + 13} text-anchor={tk.anchor} font-size="9" fill="#6b7280">{tk.label}</text>
              </g>
            ))}
            {/* 坐标轴 */}
            <line x1={g.x0} x2={g.x0} y1={g.y0} y2={g.y1} stroke="#9ca3af" stroke-width="1" />
            <line x1={g.x0} x2={g.x1} y1={g.y1} y2={g.y1} stroke="#9ca3af" stroke-width="1" />
            {/* 公差虚线 + 数值标注在线旁 */}
            {g.standard !== undefined && (
              <line x1={g.x0} x2={g.x1} y1={g.yOf(g.standard)} y2={g.yOf(g.standard)} stroke="#9ca3af" stroke-width="1" stroke-dasharray="2 3" />
            )}
            {g.upper !== undefined && (
              <g>
                <line x1={g.x0} x2={g.x1} y1={g.yOf(g.upper)} y2={g.yOf(g.upper)} stroke={STATUS_COLORS.high} stroke-width="1" stroke-dasharray="4 3" />
                <text x={g.x1 - 3} y={g.yOf(g.upper) - 3} text-anchor="end" font-size="9" fill={STATUS_COLORS.high}>{limitLabel(g.upper)}</text>
              </g>
            )}
            {g.lower !== undefined && (
              <g>
                <line x1={g.x0} x2={g.x1} y1={g.yOf(g.lower)} y2={g.yOf(g.lower)} stroke={STATUS_COLORS.low} stroke-width="1" stroke-dasharray="4 3" />
                <text x={g.x1 - 3} y={g.yOf(g.lower) + 10} text-anchor="end" font-size="9" fill={STATUS_COLORS.low}>{limitLabel(g.lower)}</text>
              </g>
            )}
            {/* 曲线 */}
            {g.lines.map(l => l.pts && (
              <polyline key={l.key} points={l.pts} fill="none" stroke={l.color} stroke-width={lw} stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke" />
            ))}
            {!g.hasData && (
              <text x={(g.x0 + g.x1) / 2} y={(g.y0 + g.y1) / 2} text-anchor="middle" font-size="12" fill="#9ca3af">{tt('scada.widget.noData')}</text>
            )}
          </svg>
        </div>
      )
    }
  }
})

export const trendDefinition: WidgetDefinition = {
  type: 'trend',
  hasText: true,
  label: () => tt('scada.widget.trend'),
  description: () => tt('scada.widget.trendDesc'),
  icon: icons.trend,
  category: 'data',
  defaultSize: { w: 420, h: 240 },
  minSize: { w: 160, h: 100 },
  needsBinding: false,
  multiBinding: true,
  defaultProps: () => ({ bindings: [], timeSpan: 60, timeFormat: 'HH:mm:ss', showLegend: true, showLimits: true, lineWidth: 2, decimals: null, bg: '#ffffff', fg: '#1f2937' }),
  propSchema: [
    { key: 'timeSpan', label: () => tt('scada.prop.timeSpan'), type: 'number', min: 5, max: 86400, step: 1 },
    { key: 'timeFormat', label: () => tt('scada.prop.timeFormat'), type: 'text', placeholder: 'HH:mm:ss' },
    { key: 'showLegend', label: () => tt('scada.prop.showLegend'), type: 'boolean' },
    { key: 'showLimits', label: () => tt('scada.prop.showLimits'), type: 'boolean' },
    { key: 'lineWidth', label: () => tt('scada.prop.lineWidth'), type: 'number', min: 1, max: 10, step: 1 },
    { key: 'decimals', label: () => tt('scada.prop.decimals'), type: 'number', min: 0, max: 8, step: 1, placeholder: 'auto' },
    { key: 'bg', label: () => tt('scada.prop.bg'), type: 'color' },
    { key: 'fg', label: () => tt('scada.prop.fg'), type: 'color' }
  ],
  component: Trend
}

export default Trend
