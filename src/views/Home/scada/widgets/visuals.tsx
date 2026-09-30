/**
 * 数据看板扩展组件：棒图 / 滑块 / 进度条 / 环形进度条 / 饼图 / 量表（与数值卡片 / 仪表盘等同在「数据看板」分类）。
 *  - 棒图 / 进度条 / 环形进度条 / 量表按「量程」作图（common.resolveRange：组件 min / max → 公差带外扩 → 0~2×标准值 → 0~100）；
 *  - 滑块是这组里唯一可写的组件：拖动时只改本地显示值，松手后经 useControl().write() 写回绑定的数据源
 *    （目前只有「内部变量」可写；绑定只读数据源或未绑定时点按会给出提示）；
 *  - 饼图不绑定单个数据项，而是像表格一样选一个数据源，取其中若干数据项的当前值算占比（items 为空 = 全部）。
 * 编辑模式下画布把组件内容设为 pointer-events: none，所以滑块在编辑时不会被误拖。
 */
import { computed, defineComponent, onBeforeUnmount, ref, watch } from 'vue'
import { dataSourceList, getDataSource } from '../dataSource'
import { formatValue } from '../geometry'
import { isLightColor, normalizeHex } from '../color'
import type { BindingOption, DataPoint, PropField, WidgetDefinition, WidgetInstance } from '../types'
import { icons } from './icons'
import { STATUS_COLORS, displayName, fractionOf, localFraction, pointText, resolveRange, statusColor, toNum, tt, widgetProps } from './common'
import { useControl } from './controlCommon'

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v)
const textOn = (bg: string) => {
  const hex = normalizeHex(bg)
  return hex && isLightColor(hex) ? '#111827' : '#ffffff'
}
const fmt = (n: number) => (Math.abs(n - Math.round(n)) < 1e-9 ? String(Math.round(n)) : n.toFixed(2).replace(/0+$/, '').replace(/\.$/, ''))

// ---------------------------------------------------------------- 字段模板
const F = {
  showTitle: (): PropField => ({ key: 'showTitle', label: () => tt('scada.prop.showTitle'), type: 'boolean' }),
  showValue: (): PropField => ({ key: 'showValue', label: () => tt('scada.prop.showValue'), type: 'boolean' }),
  showRange: (): PropField => ({ key: 'showRange', label: () => tt('scada.prop.showRange'), type: 'boolean' }),
  showScale: (): PropField => ({ key: 'showScale', label: () => tt('scada.prop.showScale'), type: 'boolean' }),
  min: (): PropField => ({ key: 'min', label: () => tt('scada.prop.min'), type: 'number', placeholder: 'auto' }),
  max: (): PropField => ({ key: 'max', label: () => tt('scada.prop.max'), type: 'number', placeholder: 'auto' }),
  decimals: (): PropField => ({ key: 'decimals', label: () => tt('scada.prop.decimals'), type: 'number', min: 0, max: 8, step: 1, placeholder: 'auto' }),
  fontSize: (): PropField => ({ key: 'fontSize', label: () => tt('scada.prop.fontSize'), type: 'number', min: 0, max: 300, step: 1, placeholder: '0 = auto' }),
  statusFill: (): PropField => ({ key: 'statusFill', label: () => tt('scada.prop.statusFill'), type: 'boolean' }),
  fillColor: (): PropField => ({ key: 'fillColor', label: () => tt('scada.prop.fillColor'), type: 'color' }),
  trackColor: (): PropField => ({ key: 'trackColor', label: () => tt('scada.prop.trackColor'), type: 'color' }),
  bg: (): PropField => ({ key: 'bg', label: () => tt('scada.prop.bg'), type: 'color' }),
  fg: (): PropField => ({ key: 'fg', label: () => tt('scada.prop.fg'), type: 'color' }),
  radius: (): PropField => ({ key: 'radius', label: () => tt('scada.prop.radius'), type: 'number', min: 0, max: 100, step: 1 }),
  border: (): PropField => ({ key: 'border', label: () => tt('scada.prop.border'), type: 'boolean' }),
  layout: (): PropField => ({
    key: 'layout', label: () => tt('scada.prop.layout'), type: 'select',
    options: () => [
      { label: tt('scada.prop.horizontal'), value: 'horizontal' },
      { label: tt('scada.prop.vertical'), value: 'vertical' }
    ]
  }),
  textMode: (): PropField => ({
    key: 'textMode', label: () => tt('scada.prop.textMode'), type: 'select',
    options: () => [
      { label: tt('scada.prop.textPercent'), value: 'percent' },
      { label: tt('scada.prop.textValue'), value: 'value' },
      { label: tt('scada.prop.textNone'), value: 'none' }
    ]
  })
}

const def = (type: string, extra: Partial<WidgetDefinition> & { defaultProps: () => Record<string, any>; propSchema: PropField[]; component: any }): WidgetDefinition => ({
  type,
  label: () => tt('scada.widget.' + type),
  description: () => tt('scada.widget.' + type + 'Desc'),
  icon: icons[type],
  category: 'data',
  hasText: true,
  defaultSize: { w: 200, h: 120 },
  minSize: { w: 30, h: 20 },
  needsBinding: true,
  ...extra
})

/** 共用的外框样式 */
const frame = (p: Record<string, any>, extra: Record<string, any> = {}) => ({
  background: p.bg || 'transparent',
  color: p.fg || '#1f2937',
  borderRadius: (Number(p.radius) || 0) + 'px',
  border: p.border ? `1px solid ${p.borderColor || '#cbd5e1'}` : 'none',
  ...extra
})

/** 填充色：随状态变色（默认）或固定填充色 */
const fillOf = (p: Record<string, any>, point: DataPoint | undefined, fallback = '#2563eb') => (p.statusFill ? statusColor(point) : p.fillColor || fallback)

/** 百分比 / 数值 / 不显示 */
const modeText = (mode: string, f: number | null, point: DataPoint | undefined, decimals: number | null | undefined) => {
  if (mode === 'none') return ''
  if (mode === 'value') return pointText(point, decimals) + (point?.unit ? ' ' + point.unit : '')
  return f === null ? '--' : Math.round(f * 100) + '%'
}

// ---------------------------------------------------------------- 棒图
const BarGauge = defineComponent({
  name: 'ScadaBarGauge',
  props: widgetProps,
  setup(props) {
    const p = computed(() => props.widget.props)
    const range = computed(() => resolveRange(props.point, p.value.min, p.value.max))
    return () => {
      const pv = p.value
      const point = props.point
      const vertical = pv.layout !== 'horizontal'
      const f = fractionOf(point?.value, range.value)
      const fl = fractionOf(point?.lower, range.value)
      const fu = fractionOf(point?.upper, range.value)
      const hasBand = fl !== null && fu !== null && fu > fl
      const fill = fillOf(pv, point)
      const track = pv.trackColor || '#e5e7eb'
      const name = displayName(props.widget, point)
      const showScale = pv.showScale !== false
      const titleH = pv.showTitle ? 22 : 0
      const valueH = pv.showValue !== false ? 20 : 0
      const W = Math.max(20, props.widget.w)
      const H = Math.max(20, props.widget.h - titleH - valueH)
      const pad = 6
      const labelSpace = showScale ? (vertical ? 36 : 14) : 0
      const bandSpace = hasBand ? 6 : 0
      // 棒体
      let bar: { x: number; y: number; w: number; h: number }
      if (vertical) {
        const bw = clamp((W - labelSpace - bandSpace - pad * 2) * 0.6, 6, 48)
        bar = { x: Math.max(pad, (W - labelSpace - bandSpace - bw) / 2), y: pad, w: bw, h: Math.max(4, H - pad * 2) }
      } else {
        const bh = clamp((H - labelSpace - bandSpace - pad * 2) * 0.6, 6, 48)
        bar = { x: pad, y: Math.max(pad, (H - labelSpace - bandSpace - bh) / 2), w: Math.max(4, W - pad * 2), h: bh }
      }
      const along = vertical ? bar.h : bar.w // 沿量程方向的长度
      const at = (t: number) => (vertical ? bar.y + bar.h * (1 - t) : bar.x + bar.w * t)
      const bandStart = vertical ? bar.x + bar.w + 2 : bar.y + bar.h + 2
      const tickStart = bandStart + bandSpace
      const majors = along >= 60 ? 5 : 3
      const minorsPer = along >= 120 ? 4 : along >= 60 ? 2 : 1
      const ticks: any[] = []
      if (showScale) {
        for (let i = 0; i < majors; i++) {
          const t = i / (majors - 1)
          const pos = at(t)
          const label = formatValue(range.value.min + (range.value.max - range.value.min) * t, point?.precision)
          if (vertical) {
            ticks.push(<line key={'M' + i} x1={tickStart} y1={pos} x2={tickStart + 6} y2={pos} stroke="currentColor" stroke-width="1" />)
            ticks.push(<text key={'T' + i} x={tickStart + 8} y={pos} font-size="10" fill="currentColor" opacity="0.75" dominant-baseline="middle">{label}</text>)
          } else {
            const anchor = i === 0 ? 'start' : i === majors - 1 ? 'end' : 'middle'
            ticks.push(<line key={'M' + i} x1={pos} y1={tickStart} x2={pos} y2={tickStart + 5} stroke="currentColor" stroke-width="1" />)
            ticks.push(<text key={'T' + i} x={pos} y={tickStart + 14} font-size="9" fill="currentColor" opacity="0.75" text-anchor={anchor}>{label}</text>)
          }
          if (i < majors - 1) {
            for (let m = 1; m <= minorsPer; m++) {
              const tm = t + (m / (minorsPer + 1)) / (majors - 1)
              const pm = at(tm)
              ticks.push(vertical
                ? <line key={`m${i}-${m}`} x1={tickStart} y1={pm} x2={tickStart + 3} y2={pm} stroke="currentColor" stroke-width="0.8" opacity="0.6" />
                : <line key={`m${i}-${m}`} x1={pm} y1={tickStart} x2={pm} y2={tickStart + 3} stroke="currentColor" stroke-width="0.8" opacity="0.6" />)
            }
          }
        }
      }
      const fillRect = f === null || f <= 0 ? null : vertical
        ? { x: bar.x, y: bar.y + bar.h * (1 - f), w: bar.w, h: bar.h * f }
        : { x: bar.x, y: bar.y, w: bar.w * f, h: bar.h }
      return (
        <div class={'w-full h-full flex flex-col overflow-hidden'} style={frame(pv)} data-scada-bar-gauge>
          {pv.showTitle ? <div class={'px-2 text-sm truncate text-center shrink-0'} style={{ lineHeight: titleH + 'px' }}>{name || tt('scada.widget.unbound')}</div> : null}
          <svg class={'flex-1 min-h-0 w-full'} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
            <rect x={bar.x} y={bar.y} width={bar.w} height={bar.h} rx="2" fill={track} />
            {fillRect ? <rect x={fillRect.x} y={fillRect.y} width={fillRect.w} height={fillRect.h} rx="2" fill={fill} /> : null}
            {hasBand ? (
              vertical ? (
                <>
                  <rect x={bandStart} y={bar.y} width="4" height={bar.h} fill="#fecaca" />
                  <rect x={bandStart} y={at(fu!)} width="4" height={Math.max(1, (fu! - fl!) * bar.h)} fill="#86efac" />
                </>
              ) : (
                <>
                  <rect x={bar.x} y={bandStart} width={bar.w} height="4" fill="#fecaca" />
                  <rect x={at(fl!)} y={bandStart} width={Math.max(1, (fu! - fl!) * bar.w)} height="4" fill="#86efac" />
                </>
              )
            ) : null}
            {ticks}
          </svg>
          {pv.showValue !== false ? (
            <div class={'px-2 text-center font-bold truncate shrink-0 value-number'} style={{ lineHeight: valueH + 'px', fontSize: '13px', color: statusColor(point) }}>
              {pointText(point, pv.decimals)}{point?.unit ? <span class={'font-normal text-xs ml-1'}>{point.unit}</span> : null}
            </div>
          ) : null}
        </div>
      )
    }
  }
})

// ---------------------------------------------------------------- 滑块
const Slider = defineComponent({
  name: 'ScadaSlider',
  props: widgetProps,
  setup(props) {
    const p = computed(() => props.widget.props)
    const { interactive, write } = useControl(props)
    const trackRef = ref<HTMLElement>()
    const dragging = ref(false)
    const dragValue = ref<number | null>(null)
    /** 松手后到数据源刷新前先显示写入的值，避免闪回旧值 */
    const pending = ref<number | null>(null)
    let pendingTimer: ReturnType<typeof setTimeout> | null = null
    const lo = computed(() => toNum(p.value.min) ?? 0)
    const hi = computed(() => {
      const v = toNum(p.value.max)
      return v !== null && v > lo.value ? v : lo.value + 100
    })
    const step = computed(() => {
      const s = toNum(p.value.step)
      return s !== null && s > 0 ? s : 0
    })
    const digits = computed(() => {
      const d = toNum(p.value.decimals)
      if (d !== null && d >= 0) return Math.min(8, Math.floor(d))
      const s = String(step.value)
      const i = s.indexOf('.')
      return i > -1 ? Math.min(8, s.length - i - 1) : 0
    })
    const quantize = (v: number) => {
      let r = v
      if (step.value > 0) r = lo.value + Math.round((v - lo.value) / step.value) * step.value
      return Number(clamp(r, lo.value, hi.value).toFixed(digits.value))
    }
    const editable = computed(() => interactive.value && !p.value.readOnly)
    const current = computed<number | null>(() => {
      if (dragging.value && dragValue.value !== null) return dragValue.value
      if (pending.value !== null) return pending.value
      const v = props.point?.value
      return v === null || v === undefined ? null : v
    })
    const clearPending = () => {
      pending.value = null
      if (pendingTimer) {
        clearTimeout(pendingTimer)
        pendingTimer = null
      }
    }
    watch(() => props.point?.value, clearPending)
    onBeforeUnmount(clearPending)

    const valueAt = (e: PointerEvent) => {
      const el = trackRef.value
      if (!el) return null
      const r = el.getBoundingClientRect()
      const vertical = p.value.layout === 'vertical'
      // 组件可能被旋转 / 翻转：把指针位置换算回滑块自己的坐标轴
      const { fx, fy } = localFraction(r, e.clientX, e.clientY, props.widget)
      const f = r.width > 0 && r.height > 0 ? (vertical ? 1 - fy : fx) : 0
      return quantize(lo.value + (hi.value - lo.value) * clamp(f, 0, 1))
    }
    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      if (!editable.value) {
        // 只读属性：静默；未绑定 / 数据源只读：借 write() 给出统一提示
        if (!p.value.readOnly) write(current.value ?? lo.value)
        return
      }
      e.preventDefault()
      e.stopPropagation()
      const v = valueAt(e)
      if (v === null) return
      dragging.value = true
      dragValue.value = v
      const el = e.currentTarget as HTMLElement | null
      if (el && el.setPointerCapture) {
        try {
          el.setPointerCapture(e.pointerId)
        } catch {
          /* ignore */
        }
      }
    }
    const onMove = (e: PointerEvent) => {
      if (!dragging.value) return
      const v = valueAt(e)
      if (v !== null) dragValue.value = v
    }
    const onUp = async (e: PointerEvent) => {
      if (!dragging.value) return
      const v = valueAt(e) ?? dragValue.value
      dragging.value = false
      dragValue.value = null
      if (v === null) return
      pending.value = v
      if (pendingTimer) clearTimeout(pendingTimer)
      pendingTimer = setTimeout(clearPending, 1500)
      const ok = await write(v)
      if (!ok) clearPending()
    }
    const onCancel = () => {
      dragging.value = false
      dragValue.value = null
    }

    return () => {
      const pv = p.value
      const vertical = pv.layout === 'vertical'
      const W = props.widget.w
      const H = props.widget.h
      const value = current.value
      const f = value === null ? 0 : clamp((value - lo.value) / (hi.value - lo.value), 0, 1)
      const thumb = clamp(Math.round((vertical ? W : H) * 0.5), 12, 28)
      const thick = clamp(Math.round(thumb * 0.32), 4, 10)
      const fill = editable.value ? pv.fillColor || '#2563eb' : '#94a3b8'
      const track = pv.trackColor || '#e5e7eb'
      const name = displayName(props.widget, props.point)
      const text = value === null ? '--' : fmt(Number(value.toFixed(digits.value))) + (props.point?.unit ? ' ' + props.point.unit : '')
      const cursor = editable.value ? (dragging.value ? 'grabbing' : 'pointer') : 'default'
      const thumbStyle = {
        width: thumb + 'px', height: thumb + 'px', borderRadius: '50%', background: pv.thumbColor || '#ffffff',
        border: `2px solid ${fill}`, boxShadow: '0 1px 3px rgba(0,0,0,.3)', position: 'absolute' as const, boxSizing: 'border-box' as const
      }
      const area = vertical ? (
        <div
          class={'relative flex-1 min-h-0 w-full select-none'}
          style={{ touchAction: editable.value ? 'none' : 'auto', cursor }}
          data-slider-area
          onPointerdown={onDown} onPointermove={onMove} onPointerup={onUp} onPointercancel={onCancel}
          onContextmenu={(e: MouseEvent) => { if (dragging.value) e.preventDefault() }}
        >
          <div ref={trackRef} class={'absolute'} data-slider-track style={{ left: '50%', marginLeft: -thick / 2 + 'px', top: thumb / 2 + 'px', bottom: thumb / 2 + 'px', width: thick + 'px', borderRadius: thick + 'px', background: track }}>
            <div class={'absolute left-0 right-0 bottom-0'} style={{ height: f * 100 + '%', borderRadius: thick + 'px', background: fill }} />
          </div>
          <div style={{ ...thumbStyle, left: '50%', marginLeft: -thumb / 2 + 'px', bottom: `calc(${f * 100}% - ${f * thumb}px)` }} />
        </div>
      ) : (
        <div
          class={'relative flex-1 min-h-0 w-full select-none'}
          style={{ touchAction: editable.value ? 'none' : 'auto', cursor }}
          data-slider-area
          onPointerdown={onDown} onPointermove={onMove} onPointerup={onUp} onPointercancel={onCancel}
          onContextmenu={(e: MouseEvent) => { if (dragging.value) e.preventDefault() }}
        >
          <div ref={trackRef} class={'absolute'} data-slider-track style={{ top: '50%', marginTop: -thick / 2 + 'px', left: thumb / 2 + 'px', right: thumb / 2 + 'px', height: thick + 'px', borderRadius: thick + 'px', background: track }}>
            <div class={'absolute top-0 bottom-0 left-0'} style={{ width: f * 100 + '%', borderRadius: thick + 'px', background: fill }} />
          </div>
          <div style={{ ...thumbStyle, top: '50%', marginTop: -thumb / 2 + 'px', left: `calc(${f * 100}% - ${f * thumb}px)` }} />
        </div>
      )
      const labelCls = 'text-[11px] leading-4 opacity-70 shrink-0 truncate'
      return (
        <div class={['w-full h-full flex overflow-hidden px-1', vertical ? 'flex-col items-center' : 'flex-col'].join(' ')} style={frame(pv, { opacity: editable.value || pv.readOnly ? 1 : 0.7 })} data-scada-slider>
          {pv.showTitle ? <div class={'text-sm truncate text-center shrink-0 leading-5 w-full'}>{name || tt('scada.widget.unbound')}</div> : null}
          {vertical ? (
            <>
              {pv.showValue !== false ? <div class={'text-xs font-bold truncate shrink-0 leading-4 value-number'} style={{ color: fill }} data-slider-value>{text}</div> : null}
              {pv.showRange !== false ? <div class={labelCls}>{fmt(hi.value)}</div> : null}
              {area}
              {pv.showRange !== false ? <div class={labelCls}>{fmt(lo.value)}</div> : null}
            </>
          ) : (
            <>
              {area}
              {pv.showRange !== false || pv.showValue !== false ? (
                <div class={'flex items-center justify-between gap-1 shrink-0 h-4'}>
                  <span class={labelCls}>{pv.showRange !== false ? fmt(lo.value) : ''}</span>
                  {pv.showValue !== false ? <span class={'text-xs font-bold truncate value-number'} style={{ color: fill }} data-slider-value>{text}</span> : null}
                  <span class={labelCls}>{pv.showRange !== false ? fmt(hi.value) : ''}</span>
                </div>
              ) : null}
            </>
          )}
        </div>
      )
    }
  }
})

// ---------------------------------------------------------------- 进度条
const ProgressBar = defineComponent({
  name: 'ScadaProgressBar',
  props: widgetProps,
  setup(props) {
    const p = computed(() => props.widget.props)
    const range = computed(() => resolveRange(props.point, p.value.min, p.value.max))
    return () => {
      const pv = p.value
      const point = props.point
      const vertical = pv.layout === 'vertical'
      const f = fractionOf(point?.value, range.value)
      const fill = fillOf(pv, point)
      const track = pv.trackColor || '#e5e7eb'
      const text = modeText(pv.textMode || 'percent', f, point, pv.decimals)
      const name = displayName(props.widget, point)
      const radius = (Number(pv.radius) || 0) + 'px'
      const titleH = pv.showTitle ? 20 : 0
      const barLen = vertical ? props.widget.h - titleH : props.widget.w
      const barThick = vertical ? props.widget.w : props.widget.h - titleH
      const fontSize = Number(pv.fontSize) > 0 ? Number(pv.fontSize) : clamp(Math.min(barThick * 0.6, (barLen / Math.max(3, text.length)) * 1.4), 9, 40)
      const fp = (f || 0) * 100
      const textNode = (color: string) => (
        <div class={'absolute inset-0 flex items-center justify-center font-bold whitespace-nowrap value-number'} style={{ fontSize: fontSize + 'px', color }}>{text}</div>
      )
      return (
        <div class={'w-full h-full flex flex-col overflow-hidden'} style={{ color: pv.fg || '#1f2937' }} data-scada-progress>
          {pv.showTitle ? <div class={'px-1 text-xs truncate shrink-0 leading-5'}>{name || tt('scada.widget.unbound')}</div> : null}
          <div class={'relative flex-1 min-h-0 overflow-hidden'} style={{ background: track, borderRadius: radius, border: pv.border ? '1px solid #cbd5e1' : 'none', boxSizing: 'border-box' }}>
            {text ? textNode(pv.fg || '#1f2937') : null}
            {/* 已填充部分：外层裁切，内层撑回整条宽度，让文字在填充区内保持居中并用对比色 */}
            <div class={'absolute overflow-hidden'} style={vertical
              ? { left: 0, right: 0, bottom: 0, height: fp + '%', borderRadius: radius, background: fill }
              : { top: 0, bottom: 0, left: 0, width: fp + '%', borderRadius: radius, background: fill }} data-progress-fill>
              {text && f ? (
                <div class={'absolute'} style={vertical
                  ? { left: 0, right: 0, bottom: 0, height: 100 / f + '%' }
                  : { top: 0, bottom: 0, left: 0, width: 100 / f + '%' }}>{textNode(textOn(fill))}</div>
              ) : null}
            </div>
          </div>
        </div>
      )
    }
  }
})

// ---------------------------------------------------------------- 环形进度条
const RingProgress = defineComponent({
  name: 'ScadaRingProgress',
  props: widgetProps,
  setup(props) {
    const p = computed(() => props.widget.props)
    const range = computed(() => resolveRange(props.point, p.value.min, p.value.max))
    return () => {
      const pv = p.value
      const point = props.point
      const f = fractionOf(point?.value, range.value)
      const fill = fillOf(pv, point)
      const track = pv.trackColor || '#e5e7eb'
      const width = clamp(toNum(pv.ringWidth) ?? 10, 1, 48)
      const r = 50 - width / 2 - 1
      const C = 2 * Math.PI * r
      const start = toNum(pv.startAngle) ?? 0
      const text = modeText(pv.textMode || 'percent', f, point, pv.decimals)
      const name = displayName(props.widget, point)
      const inner = (r - width / 2) * 2 // 内径（viewBox 单位）
      const fontSize = Number(pv.fontSize) > 0 ? Number(pv.fontSize) : clamp((inner * 0.9) / Math.max(2, text.length * 0.6), 6, 26)
      const withTitle = !!(pv.showTitle && name)
      // 有标题时数值与标题一起竖向居中：数值基线略下移，标题贴在数值下方
      const valueY = withTitle ? 51 : 50 + fontSize * 0.35
      const titleY = text ? valueY + Math.min(12, fontSize * 0.85) : 53
      return (
        <div class={'w-full h-full flex flex-col overflow-hidden'} style={frame(pv)} data-scada-ring>
          <svg class={'flex-1 min-h-0 w-full'} viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
            <circle cx="50" cy="50" r={r} fill="none" stroke={track} stroke-width={width} />
            {f !== null && f > 0 ? (
              <circle cx="50" cy="50" r={r} fill="none" stroke={fill} stroke-width={width} stroke-dasharray={`${(C * f).toFixed(3)} ${C.toFixed(3)}`}
                stroke-linecap={pv.roundCap !== false && f < 1 ? 'round' : 'butt'} transform={`rotate(${start - 90} 50 50)`} data-ring-value={f.toFixed(4)} />
            ) : null}
            {text ? <text x="50" y={valueY} text-anchor="middle" font-size={fontSize} font-weight="bold" fill={pv.statusFill ? fill : 'currentColor'} class={'value-number'}>{text}</text> : null}
            {withTitle ? <text x="50" y={titleY} text-anchor="middle" font-size={Math.min(8, Math.max(4, inner / Math.max(4, name.length * 1.1)))} fill="currentColor" opacity="0.75">{name}</text> : null}
          </svg>
        </div>
      )
    }
  }
})

// ---------------------------------------------------------------- 饼图
const PALETTE = ['#2563eb', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316', '#84cc16', '#ec4899', '#64748b', '#14b8a6', '#a855f7']

const polarAt = (cx: number, cy: number, r: number, deg: number) => {
  const rad = (deg * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}
/** 环形扇区（inner = 0 时为普通扇形），角度按 SVG 坐标顺时针，-90 为正上方 */
const sectorPath = (cx: number, cy: number, R: number, inner: number, a0: number, a1: number) => {
  const large = a1 - a0 > 180 ? 1 : 0
  const p0 = polarAt(cx, cy, R, a0)
  const p1 = polarAt(cx, cy, R, a1)
  const n = (v: number) => v.toFixed(3)
  if (inner <= 0) return `M ${n(cx)} ${n(cy)} L ${n(p0.x)} ${n(p0.y)} A ${n(R)} ${n(R)} 0 ${large} 1 ${n(p1.x)} ${n(p1.y)} Z`
  const q0 = polarAt(cx, cy, inner, a1)
  const q1 = polarAt(cx, cy, inner, a0)
  return `M ${n(p0.x)} ${n(p0.y)} A ${n(R)} ${n(R)} 0 ${large} 1 ${n(p1.x)} ${n(p1.y)} L ${n(q0.x)} ${n(q0.y)} A ${n(inner)} ${n(inner)} 0 ${large} 0 ${n(q1.x)} ${n(q1.y)} Z`
}

const Pie = defineComponent({
  name: 'ScadaPie',
  props: widgetProps,
  setup(props) {
    const p = computed(() => props.widget.props)
    const provider = computed(() => getDataSource(p.value.source) || dataSourceList()[0])
    const rows = computed(() => {
      const prov = provider.value
      if (!prov) return [] as { o: BindingOption; point?: DataPoint }[]
      const opts = prov.options()
      const picked: string[] = Array.isArray(p.value.items) ? p.value.items : []
      let list = picked.length ? (picked.map(k => opts.find(o => o.key === k)).filter(Boolean) as BindingOption[]) : opts
      const max = Number(p.value.maxSlices) > 0 ? Number(p.value.maxSlices) : Infinity
      list = list.slice(0, max)
      return list.map(o => ({ o, point: prov.read(o.key) }))
    })
    // 订阅用到的数据项（轮询型数据源只请求被用到的项）；数据源 / 项目列表变化时重新订阅
    let unsubs: (() => void)[] = []
    const clear = () => {
      unsubs.forEach(u => u())
      unsubs = []
    }
    watch(
      () => `${provider.value?.id || ''}|${rows.value.map(r => r.o.key).join(',')}`,
      () => {
        clear()
        const prov = provider.value
        if (!prov || !prov.subscribe) return
        unsubs = rows.value.map(r => prov.subscribe!(r.o.key))
      },
      { immediate: true }
    )
    onBeforeUnmount(clear)
    const colors = computed(() => {
      const list = String(p.value.colors || '')
        .split(/[\n,;]+/)
        .map(s => normalizeHex(s.trim()))
        .filter(Boolean) as string[]
      return list.length ? list : PALETTE
    })

    return () => {
      const pv = p.value
      const slices = rows.value.map((r, i) => {
        const v = r.point?.value
        return { key: r.o.key, label: r.o.label, unit: r.point?.unit || r.o.unit, point: r.point, value: typeof v === 'number' && v > 0 ? v : 0, color: colors.value[i % colors.value.length] }
      })
      const total = slices.reduce((s, x) => s + x.value, 0)
      const legend = pv.legend || 'right'
      const fontSize = Number(pv.fontSize) > 0 ? Number(pv.fontSize) : 12
      const donut = pv.donut ? 26 : 0
      const R = 48
      let angle = -90
      const paths: any[] = []
      const labels: any[] = []
      if (total > 0) {
        const nonZero = slices.filter(s => s.value > 0)
        if (nonZero.length === 1) {
          const s = nonZero[0]
          paths.push(<circle key={s.key} cx="50" cy="50" r={R} fill={s.color} data-pie-slice={s.key} />)
          if (donut) paths.push(<circle key="hole" cx="50" cy="50" r={donut} fill={pv.bg || '#ffffff'} />)
          if (pv.showLabels !== false) labels.push(<text key={'l' + s.key} x="50" y={donut ? 50 - (R + donut) / 2 + 2 : 52} text-anchor="middle" font-size="7" font-weight="bold" fill={textOn(s.color)}>100%</text>)
        } else {
          for (const s of slices) {
            if (s.value <= 0) continue
            const frac = s.value / total
            const a0 = angle
            const a1 = angle + frac * 360
            angle = a1
            paths.push(<path key={s.key} d={sectorPath(50, 50, R, donut, a0, Math.min(a1, a0 + 359.999))} fill={s.color} stroke={pv.bg || '#ffffff'} stroke-width="0.8" data-pie-slice={s.key} />)
            if (pv.showLabels !== false && frac >= 0.06) {
              const m = polarAt(50, 50, donut ? (R + donut) / 2 : R * 0.62, (a0 + a1) / 2)
              labels.push(<text key={'l' + s.key} x={m.x.toFixed(2)} y={(m.y + 2.2).toFixed(2)} text-anchor="middle" font-size={frac >= 0.12 ? 7 : 5.5} font-weight="bold" fill={textOn(s.color)}>{Math.round(frac * 100)}%</text>)
            }
          }
        }
      }
      const name = props.widget.title || provider.value?.label() || ''
      const legendNode = legend !== 'none' && slices.length ? (
        <div class={['min-w-0 min-h-0 overflow-auto shrink-0', legend === 'bottom' ? 'w-full max-h-[45%] px-2 pb-1 flex flex-wrap gap-x-3' : 'max-w-[50%] pr-2 py-1 self-center'].join(' ')} style={{ fontSize: fontSize + 'px' }} data-pie-legend>
          {slices.map(s => (
            <div key={s.key} class={'flex items-center gap-1 leading-5 min-w-0'}>
              <span class={'inline-block shrink-0 rounded-sm'} style={{ width: '0.8em', height: '0.8em', background: s.color }} />
              <span class={'truncate'}>{s.label}</span>
              <span class={'ml-auto pl-2 value-number whitespace-nowrap opacity-80'}>
                {pointText(s.point, pv.decimals)}{s.unit ? ' ' + s.unit : ''}
                {total > 0 ? ` (${Math.round((s.value / total) * 100)}%)` : ''}
              </span>
            </div>
          ))}
        </div>
      ) : null
      return (
        <div class={'w-full h-full flex flex-col overflow-hidden'} style={frame(pv)} data-scada-pie>
          {pv.showTitle ? <div class={'px-2 text-sm truncate text-center shrink-0 leading-6'}>{name}</div> : null}
          <div class={['flex-1 min-h-0 flex', legend === 'bottom' ? 'flex-col' : 'flex-row'].join(' ')}>
            <div class={'flex-1 min-w-0 min-h-0 relative'}>
              <svg class={'w-full h-full'} viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
                {total > 0 ? paths : <circle cx="50" cy="50" r={R} fill="#e5e7eb" />}
                {total > 0 ? labels : <text x="50" y="53" text-anchor="middle" font-size="7" fill="#6b7280">{slices.length ? tt('scada.widget.noData') : tt('scada.panel.noOptions')}</text>}
              </svg>
            </div>
            {legendNode}
          </div>
        </div>
      )
    }
  }
})

// ---------------------------------------------------------------- 量表（半圆刻度表）
const MCX = 50
const MCY = 54
const mpolar = (r: number, deg: number) => {
  const rad = (deg * Math.PI) / 180
  return { x: MCX + r * Math.cos(rad), y: MCY - r * Math.sin(rad) }
}
/** 比例 → 角度：0 在左（180°），1 在右（0°） */
const mangle = (t: number) => 180 - 180 * clamp(t, 0, 1)
const marc = (r: number, t0: number, t1: number) => {
  t0 = clamp(t0, 0, 1)
  t1 = clamp(t1, 0, 1)
  if (t1 - t0 < 0.0005) return ''
  const p0 = mpolar(r, mangle(t0))
  const p1 = mpolar(r, mangle(t1))
  const large = t1 - t0 > 0.5 ? 1 : 0
  return `M ${p0.x.toFixed(2)} ${p0.y.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`
}

const Meter = defineComponent({
  name: 'ScadaMeter',
  props: widgetProps,
  setup(props) {
    const p = computed(() => props.widget.props)
    const range = computed(() => resolveRange(props.point, p.value.min, p.value.max))
    return () => {
      const pv = p.value
      const point = props.point
      const { min, max } = range.value
      const f = fractionOf(point?.value, range.value)
      const fl = fractionOf(point?.lower, range.value)
      const fu = fractionOf(point?.upper, range.value)
      const hasBand = pv.showZones !== false && fl !== null && fu !== null && fu > fl
      const name = displayName(props.widget, point)
      const divisions = clamp(Math.round(toNum(pv.divisions) ?? 5), 1, 20)
      const minorsPer = divisions <= 10 ? 4 : 1
      const ticks: any[] = []
      const span = max - min
      const labelDigits = Math.abs(span / divisions - Math.round(span / divisions)) < 1e-9 ? 0 : Math.min(2, Math.max(1, point?.precision ?? 1))
      for (let i = 0; i <= divisions; i++) {
        const t = i / divisions
        const a = mangle(t)
        const o = mpolar(41, a)
        const q = mpolar(35, a)
        ticks.push(<line key={'M' + i} x1={o.x.toFixed(2)} y1={o.y.toFixed(2)} x2={q.x.toFixed(2)} y2={q.y.toFixed(2)} stroke="currentColor" stroke-width="1.2" />)
        if (divisions <= 12 || i % 2 === 0) {
          const l = mpolar(28, a)
          ticks.push(<text key={'T' + i} x={l.x.toFixed(2)} y={(l.y + 1.8).toFixed(2)} text-anchor="middle" font-size="5" fill="currentColor" opacity="0.8">{(min + span * t).toFixed(labelDigits)}</text>)
        }
        if (i < divisions) {
          for (let m = 1; m <= minorsPer; m++) {
            const am = mangle(t + m / (minorsPer + 1) / divisions)
            const o2 = mpolar(41, am)
            const q2 = mpolar(38, am)
            ticks.push(<line key={`m${i}-${m}`} x1={o2.x.toFixed(2)} y1={o2.y.toFixed(2)} x2={q2.x.toFixed(2)} y2={q2.y.toFixed(2)} stroke="currentColor" stroke-width="0.6" opacity="0.7" />)
          }
        }
      }
      const na = mangle(f === null ? 0 : f)
      const tip = mpolar(34, na)
      const b1 = mpolar(2.2, na + 90)
      const b2 = mpolar(2.2, na - 90)
      const tail = mpolar(6, na + 180)
      const needle = pv.needleColor || '#dc2626'
      const text = pointText(point, pv.decimals) + (point?.unit ? ' ' + point.unit : '')
      return (
        <div class={'w-full h-full flex flex-col overflow-hidden'} style={frame(pv)} data-scada-meter>
          {pv.showTitle ? <div class={'px-2 leading-6 text-sm truncate text-center shrink-0'}>{name || tt('scada.widget.unbound')}</div> : null}
          <svg class={'flex-1 min-h-0 w-full'} viewBox="0 0 100 64" preserveAspectRatio="xMidYMid meet">
            {/* 外环：公差区（低 / 合格 / 高）或灰色轨道 */}
            {hasBand ? (
              <>
                {fl! > 0 ? <path d={marc(45, 0, fl!)} stroke={STATUS_COLORS.low} stroke-width="4" fill="none" opacity="0.8" /> : null}
                <path d={marc(45, fl!, fu!)} stroke={STATUS_COLORS.ok} stroke-width="4" fill="none" opacity="0.8" />
                {fu! < 1 ? <path d={marc(45, fu!, 1)} stroke={STATUS_COLORS.high} stroke-width="4" fill="none" opacity="0.8" /> : null}
              </>
            ) : (
              <path d={marc(45, 0, 1)} stroke={pv.trackColor || '#e5e7eb'} stroke-width="4" fill="none" />
            )}
            <path d={marc(42, 0, 1)} stroke="currentColor" stroke-width="0.8" fill="none" opacity="0.6" />
            {ticks}
            {/* 指针 */}
            <polygon points={`${tip.x.toFixed(2)},${tip.y.toFixed(2)} ${b1.x.toFixed(2)},${b1.y.toFixed(2)} ${tail.x.toFixed(2)},${tail.y.toFixed(2)} ${b2.x.toFixed(2)},${b2.y.toFixed(2)}`} fill={needle} data-meter-needle={f === null ? '' : f.toFixed(4)} />
            <circle cx={MCX} cy={MCY} r="3.4" fill={pv.fg || '#1f2937'} />
            <circle cx={MCX} cy={MCY} r="1.4" fill="#ffffff" />
            {pv.showValue !== false ? <text x={MCX} y="63" text-anchor="middle" font-size="6.5" font-weight="bold" fill={statusColor(point)} class={'value-number'}>{text}</text> : null}
          </svg>
        </div>
      )
    }
  }
})

// ---------------------------------------------------------------- 定义
const sourceField = (): PropField => ({ key: 'source', label: () => tt('scada.panel.source'), type: 'select', options: () => dataSourceList().map(s => ({ label: s.label(), value: s.id })) })

export const visualDefinitions: WidgetDefinition[] = [
  def('barGauge', {
    defaultSize: { w: 120, h: 220 },
    minSize: { w: 30, h: 40 },
    defaultProps: () => ({ layout: 'vertical', showTitle: true, showValue: true, showScale: true, min: null, max: null, decimals: null, statusFill: true, fillColor: '#2563eb', trackColor: '#e5e7eb', bg: '#ffffff', fg: '#1f2937', radius: 4, border: true }),
    propSchema: [F.layout(), F.showTitle(), F.showValue(), F.showScale(), F.min(), F.max(), F.decimals(), F.statusFill(), F.fillColor(), F.trackColor(), F.bg(), F.fg(), F.radius(), F.border()],
    component: BarGauge
  }),
  def('slider', {
    defaultSize: { w: 220, h: 56 },
    minSize: { w: 36, h: 24 },
    defaultProps: () => ({ layout: 'horizontal', showTitle: false, showValue: true, showRange: true, min: 0, max: 100, step: 1, decimals: null, readOnly: false, fillColor: '#2563eb', trackColor: '#e5e7eb', thumbColor: '#ffffff', bg: '', fg: '#1f2937', radius: 0, border: false }),
    propSchema: [
      F.layout(), F.showTitle(), F.showValue(), F.showRange(),
      { key: 'min', label: () => tt('scada.prop.minValue'), type: 'number' },
      { key: 'max', label: () => tt('scada.prop.maxValue'), type: 'number' },
      { key: 'step', label: () => tt('scada.prop.step'), type: 'number', min: 0, step: 0.01 },
      F.decimals(),
      { key: 'readOnly', label: () => tt('scada.prop.readOnly'), type: 'boolean' },
      F.fillColor(), F.trackColor(),
      { key: 'thumbColor', label: () => tt('scada.prop.thumbColor'), type: 'color' },
      F.bg(), F.fg(), F.radius(), F.border()
    ],
    component: Slider
  }),
  def('progressBar', {
    defaultSize: { w: 240, h: 28 },
    minSize: { w: 20, h: 8 },
    defaultProps: () => ({ layout: 'horizontal', showTitle: false, textMode: 'percent', min: null, max: null, decimals: null, statusFill: false, fillColor: '#2563eb', trackColor: '#e5e7eb', fontSize: 0, fg: '#1f2937', radius: 6, border: false }),
    propSchema: [F.layout(), F.showTitle(), F.textMode(), F.min(), F.max(), F.decimals(), F.statusFill(), F.fillColor(), F.trackColor(), F.fontSize(), F.fg(), F.radius(), F.border()],
    component: ProgressBar
  }),
  def('ringProgress', {
    defaultSize: { w: 160, h: 160 },
    minSize: { w: 40, h: 40 },
    defaultProps: () => ({ showTitle: true, textMode: 'percent', min: null, max: null, decimals: null, ringWidth: 10, startAngle: 0, roundCap: true, statusFill: false, fillColor: '#2563eb', trackColor: '#e5e7eb', fontSize: 0, bg: '', fg: '#1f2937', radius: 0, border: false }),
    propSchema: [
      F.showTitle(), F.textMode(), F.min(), F.max(), F.decimals(),
      { key: 'ringWidth', label: () => tt('scada.prop.ringWidth'), type: 'number', min: 1, max: 48, step: 1 },
      { key: 'startAngle', label: () => tt('scada.prop.startAngle'), type: 'number', min: -360, max: 360, step: 1 },
      { key: 'roundCap', label: () => tt('scada.prop.roundCap'), type: 'boolean' },
      F.statusFill(), F.fillColor(), F.trackColor(), F.fontSize(), F.bg(), F.fg(), F.radius(), F.border()
    ],
    component: RingProgress
  }),
  def('pie', {
    defaultSize: { w: 320, h: 200 },
    minSize: { w: 60, h: 60 },
    needsBinding: false,
    defaultProps: () => ({ source: 'product', items: [], maxSlices: 8, donut: false, legend: 'right', showLabels: true, showTitle: false, decimals: null, colors: '', fontSize: 12, bg: '#ffffff', fg: '#1f2937', radius: 4, border: true }),
    propSchema: [
      sourceField(),
      {
        key: 'items', label: () => tt('scada.prop.sliceItems'), type: 'multiselect', placeholder: () => tt('scada.prop.sliceItemsPlaceholder'),
        options: (w?: WidgetInstance) => {
          const prov = getDataSource(w?.props.source) || dataSourceList()[0]
          return prov ? prov.options().map(o => ({ label: o.group ? `${o.group} · ${o.label}` : o.label, value: o.key })) : []
        }
      },
      { key: 'maxSlices', label: () => tt('scada.prop.maxSlices'), type: 'number', min: 0, max: 50, step: 1, placeholder: '0 = all' },
      F.showTitle(),
      { key: 'donut', label: () => tt('scada.prop.donut'), type: 'boolean' },
      {
        key: 'legend', label: () => tt('scada.prop.legend'), type: 'select',
        options: () => [
          { label: tt('scada.prop.legendRight'), value: 'right' },
          { label: tt('scada.prop.legendBottom'), value: 'bottom' },
          { label: tt('scada.prop.textNone'), value: 'none' }
        ]
      },
      { key: 'showLabels', label: () => tt('scada.prop.showLabels'), type: 'boolean' },
      F.decimals(),
      { key: 'colors', label: () => tt('scada.prop.colors'), type: 'textarea', placeholder: () => tt('scada.prop.colorsPlaceholder') },
      { key: 'fontSize', label: () => tt('scada.prop.fontSize'), type: 'number', min: 8, max: 60, step: 1 },
      F.bg(), F.fg(), F.radius(), F.border()
    ],
    component: Pie
  }),
  def('meter', {
    defaultSize: { w: 220, h: 160 },
    minSize: { w: 80, h: 60 },
    defaultProps: () => ({ showTitle: true, showValue: true, showZones: true, min: null, max: null, divisions: 5, decimals: null, needleColor: '#dc2626', trackColor: '#e5e7eb', bg: '#ffffff', fg: '#1f2937', radius: 4, border: true }),
    propSchema: [
      F.showTitle(), F.showValue(),
      { key: 'showZones', label: () => tt('scada.prop.showZones'), type: 'boolean' },
      F.min(), F.max(),
      { key: 'divisions', label: () => tt('scada.prop.divisions'), type: 'number', min: 1, max: 20, step: 1 },
      F.decimals(),
      { key: 'needleColor', label: () => tt('scada.prop.needleColor'), type: 'color' },
      F.trackColor(), F.bg(), F.fg(), F.radius(), F.border()
    ],
    component: Meter
  })
]

export { BarGauge, Slider, ProgressBar, RingProgress, Pie, Meter }
