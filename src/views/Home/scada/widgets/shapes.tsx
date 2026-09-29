/**
 * 基础图素：直线 / 折线 / 弧线 / 矩形 / 圆形 / 椭圆 / 扇形 / 弓形 / 多边形 / 管道。
 * 全部用一个 ShapeWidget 按 widget.type 画 SVG（图形随组件矩形拉伸），不需要绑定数据；
 * 闭合图形勾选「随状态变色」并绑定数据后，填充色跟随数据状态（正常 / 超上限 / 超下限 / 无数据）。
 * 管道支持流动动画（常开 / 关闭 / 跟随数据：值 > 0 时流动）。
 */
import { computed, defineComponent } from 'vue'
import { hexToRgb, normalizeHex, rgbToHex } from '../color'
import type { PropField, WidgetDefinition } from '../types'
import { icons } from './icons'
import { statusColor, tt, widgetProps } from './common'

const DEG = Math.PI / 180
/** 椭圆上的点：角度 0 = 3 点钟方向，顺时针为正 */
const polar = (cx: number, cy: number, rx: number, ry: number, deg: number) => ({ x: cx + rx * Math.cos(deg * DEG), y: cy + ry * Math.sin(deg * DEG) })
const fmt = (n: number) => (Math.round(n * 100) / 100).toString()
/** 起止角之间的顺时针弧（终点角小于起点时视为跨过 0°） */
const sweepOf = (start: number, end: number) => {
  let s = ((end - start) % 360 + 360) % 360
  if (s === 0 && end !== start) s = 359.99
  return s
}
const ellipseArc = (cx: number, cy: number, rx: number, ry: number, start: number, end: number) => {
  const sweep = sweepOf(start, end)
  const p1 = polar(cx, cy, rx, ry, start)
  const p2 = polar(cx, cy, rx, ry, start + sweep)
  return { p1, p2, large: sweep > 180 ? 1 : 0 }
}
/** 颜色加深 / 提亮（factor < 1 变暗，> 1 变亮），非法颜色原样返回 */
export const shade = (color: string, factor: number) => {
  const hex = normalizeHex(color)
  const rgb = hex ? hexToRgb(hex) : null
  if (!rgb) return color
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(factor >= 1 ? v + (255 - v) * (factor - 1) : v * factor)))
  return rgbToHex(f(rgb.r), f(rgb.g), f(rgb.b))
}

/** 折线顶点："x,y x,y ..."（百分比 0 ~ 100），解析失败的点跳过 */
export const parsePoints = (text: string): { x: number; y: number }[] => {
  const out: { x: number; y: number }[] = []
  String(text || '')
    .split(/[\s;]+/)
    .filter(Boolean)
    .forEach(pair => {
      const [xs, ys] = pair.split(',')
      const x = Number(xs)
      const y = Number(ys)
      if (Number.isFinite(x) && Number.isFinite(y)) out.push({ x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) })
    })
  return out
}

/** 流动动画的 keyframes 只注入一次 */
let flowStyleInjected = false
const ensureFlowStyle = () => {
  if (flowStyleInjected || typeof document === 'undefined') return
  flowStyleInjected = true
  const style = document.createElement('style')
  style.setAttribute('data-scada-flow', '')
  style.textContent = '@keyframes scada-pipe-flow{to{stroke-dashoffset:var(--scada-flow-len)}}'
  document.head.appendChild(style)
}

const ShapeWidget = defineComponent({
  name: 'ScadaShape',
  props: widgetProps,
  setup(props) {
    const p = computed(() => props.widget.props)
    const fill = computed(() => {
      if (p.value.statusFill && props.widget.binding) return statusColor(props.point)
      return p.value.fillColor || 'none'
    })
    const stroke = computed(() => p.value.stroke || '#475569')
    const sw = computed(() => Math.max(0, Number(p.value.strokeWidth) || 0))
    const dash = computed(() => (p.value.dash ? `${sw.value * 3} ${sw.value * 2}` : undefined))

    const renderPipe = (w: number, h: number) => {
      ensureFlowStyle()
      const shape: string = p.value.pipeShape || 'h'
      const auto = shape === 'h' ? h : shape === 'v' ? w : Math.min(w, h) * 0.35
      const t = Math.max(4, Math.min(Math.min(w, h), Number(p.value.thickness) > 0 ? Number(p.value.thickness) : auto))
      const cx = w / 2
      const cy = h / 2
      let d: string
      if (shape === 'h') d = `M0 ${fmt(cy)} H${fmt(w)}`
      else if (shape === 'v') d = `M${fmt(cx)} 0 V${fmt(h)}`
      else {
        // 弯头：连接两条边，中间用四分之一圆弧过渡
        const R = Math.max(t / 2, Math.min(w, h) / 2 - t / 2)
        const r = Math.min(R, Math.min(cx, cy))
        if (shape === 'tl') d = `M${fmt(cx)} 0 V${fmt(cy - r)} A${fmt(r)} ${fmt(r)} 0 0 0 ${fmt(cx - r)} ${fmt(cy)} H0`
        else if (shape === 'tr') d = `M${fmt(cx)} 0 V${fmt(cy - r)} A${fmt(r)} ${fmt(r)} 0 0 1 ${fmt(cx + r)} ${fmt(cy)} H${fmt(w)}`
        else if (shape === 'bl') d = `M${fmt(cx)} ${fmt(h)} V${fmt(cy + r)} A${fmt(r)} ${fmt(r)} 0 0 1 ${fmt(cx - r)} ${fmt(cy)} H0`
        else d = `M${fmt(cx)} ${fmt(h)} V${fmt(cy + r)} A${fmt(r)} ${fmt(r)} 0 0 0 ${fmt(cx + r)} ${fmt(cy)} H${fmt(w)}`
      }
      const color = p.value.color || '#94a3b8'
      const flowMode: string = p.value.flow || 'off'
      const value = props.point?.value
      const flowing = flowMode === 'on' || (flowMode === 'bind' && !!props.widget.binding && typeof value === 'number' && value > 0)
      const dashLen = Math.max(4, t * 0.7)
      const speed = Math.max(1, Math.min(5, Number(p.value.flowSpeed) || 2))
      const dur = 3.2 - speed * 0.5
      const common = { fill: 'none', 'stroke-linecap': 'butt' as const, 'stroke-linejoin': 'round' as const }
      return (
        <>
          <path d={d} stroke={shade(color, 0.55)} stroke-width={t} {...common} />
          <path d={d} stroke={color} stroke-width={t * 0.78} {...common} />
          <path d={d} stroke={shade(color, 1.55)} stroke-width={t * 0.28} stroke-opacity={0.75} {...common} />
          {flowing && (
            <path
              d={d}
              stroke={p.value.flowColor || '#38bdf8'}
              stroke-width={t * 0.45}
              stroke-dasharray={`${fmt(dashLen)} ${fmt(dashLen)}`}
              {...common}
              style={{
                '--scada-flow-len': `${(p.value.reverse ? 1 : -1) * dashLen * 2}px`,
                animation: `scada-pipe-flow ${dur}s linear infinite`
              } as any}
            />
          )}
        </>
      )
    }

    const renderShape = (w: number, h: number) => {
      const type = props.widget.type
      const half = sw.value / 2
      const cx = w / 2
      const cy = h / 2
      const base = { fill: fill.value, stroke: stroke.value, 'stroke-width': sw.value, 'stroke-dasharray': dash.value, 'stroke-linejoin': 'round' as const, 'stroke-linecap': 'round' as const }
      switch (type) {
        case 'line': {
          const dir: string = p.value.direction || 'horizontal'
          const d =
            dir === 'vertical' ? `M${fmt(cx)} 0 V${fmt(h)}` : dir === 'down' ? `M0 0 L${fmt(w)} ${fmt(h)}` : dir === 'up' ? `M0 ${fmt(h)} L${fmt(w)} 0` : `M0 ${fmt(cy)} H${fmt(w)}`
          return <path d={d} {...base} fill="none" />
        }
        case 'polyline': {
          const pts = parsePoints(p.value.vertices)
          if (pts.length < 2) return null
          const d = pts.map((pt, i) => `${i ? 'L' : 'M'}${fmt((pt.x / 100) * w)} ${fmt((pt.y / 100) * h)}`).join(' ')
          return <path d={d} {...base} fill="none" />
        }
        case 'arc': {
          const a = ellipseArc(cx, cy, Math.max(1, cx - half), Math.max(1, cy - half), Number(p.value.startAngle) || 0, Number(p.value.endAngle) || 0)
          return <path d={`M${fmt(a.p1.x)} ${fmt(a.p1.y)} A${fmt(cx - half)} ${fmt(cy - half)} 0 ${a.large} 1 ${fmt(a.p2.x)} ${fmt(a.p2.y)}`} {...base} fill="none" />
        }
        case 'rect':
          return <rect x={half} y={half} width={Math.max(0, w - sw.value)} height={Math.max(0, h - sw.value)} rx={Number(p.value.radius) || 0} {...base} />
        case 'circle': {
          const r = Math.max(1, Math.min(w, h) / 2 - half)
          return <circle cx={cx} cy={cy} r={r} {...base} />
        }
        case 'ellipse':
          return <ellipse cx={cx} cy={cy} rx={Math.max(1, cx - half)} ry={Math.max(1, cy - half)} {...base} />
        case 'sector': {
          const rx = Math.max(1, cx - half)
          const ry = Math.max(1, cy - half)
          const a = ellipseArc(cx, cy, rx, ry, Number(p.value.startAngle) || 0, Number(p.value.endAngle) || 0)
          return <path d={`M${fmt(cx)} ${fmt(cy)} L${fmt(a.p1.x)} ${fmt(a.p1.y)} A${fmt(rx)} ${fmt(ry)} 0 ${a.large} 1 ${fmt(a.p2.x)} ${fmt(a.p2.y)} Z`} {...base} />
        }
        case 'segment': {
          // 弓形：一条边是弦（贴着组件某一边），另一侧是半椭圆弧
          const o: string = p.value.orientation || 'up'
          const x0 = half
          const y0 = half
          const x1 = w - half
          const y1 = h - half
          let d: string
          if (o === 'down') d = `M${fmt(x0)} ${fmt(y0)} A${fmt(cx - half)} ${fmt(y1 - y0)} 0 0 0 ${fmt(x1)} ${fmt(y0)} Z`
          else if (o === 'left') d = `M${fmt(x1)} ${fmt(y0)} A${fmt(x1 - x0)} ${fmt(cy - half)} 0 0 0 ${fmt(x1)} ${fmt(y1)} Z`
          else if (o === 'right') d = `M${fmt(x0)} ${fmt(y0)} A${fmt(x1 - x0)} ${fmt(cy - half)} 0 0 1 ${fmt(x0)} ${fmt(y1)} Z`
          else d = `M${fmt(x0)} ${fmt(y1)} A${fmt(cx - half)} ${fmt(y1 - y0)} 0 0 1 ${fmt(x1)} ${fmt(y1)} Z`
          return <path d={d} {...base} />
        }
        case 'polygon': {
          const n = Math.max(3, Math.min(24, Math.round(Number(p.value.sides) || 5)))
          const rot = Number(p.value.rotation) || 0
          const rx = Math.max(1, cx - half)
          const ry = Math.max(1, cy - half)
          const pts = Array.from({ length: n }, (_, i) => polar(cx, cy, rx, ry, -90 + rot + (360 / n) * i))
          return <polygon points={pts.map(pt => `${fmt(pt.x)},${fmt(pt.y)}`).join(' ')} {...base} />
        }
        case 'pipe':
          return renderPipe(w, h)
        default:
          return null
      }
    }

    return () => {
      const w = Math.max(1, props.widget.w)
      const h = Math.max(1, props.widget.h)
      return (
        <svg class={'block w-full h-full overflow-visible'} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ opacity: p.value.opacity === undefined || p.value.opacity === null ? 1 : Math.max(0, Math.min(100, Number(p.value.opacity))) / 100 }}>
          {renderShape(w, h)}
        </svg>
      )
    }
  }
})

// ---------------------------------------------------------------- 属性字段
const F = {
  stroke: (): PropField => ({ key: 'stroke', label: () => tt('scada.prop.lineColor'), type: 'color' }),
  strokeWidth: (): PropField => ({ key: 'strokeWidth', label: () => tt('scada.prop.lineWidth'), type: 'number', min: 0, max: 60, step: 1 }),
  dash: (): PropField => ({ key: 'dash', label: () => tt('scada.prop.dash'), type: 'boolean' }),
  fillColor: (): PropField => ({ key: 'fillColor', label: () => tt('scada.prop.fillColor'), type: 'color' }),
  statusFill: (): PropField => ({ key: 'statusFill', label: () => tt('scada.prop.statusFill'), type: 'boolean' }),
  opacity: (): PropField => ({ key: 'opacity', label: () => tt('scada.prop.opacity'), type: 'number', min: 0, max: 100, step: 5 }),
  startAngle: (): PropField => ({ key: 'startAngle', label: () => tt('scada.prop.startAngle'), type: 'number', min: 0, max: 360, step: 5 }),
  endAngle: (): PropField => ({ key: 'endAngle', label: () => tt('scada.prop.endAngle'), type: 'number', min: 0, max: 360, step: 5 })
}
const closedFields = () => [F.fillColor(), F.statusFill(), F.stroke(), F.strokeWidth(), F.dash(), F.opacity()]
const openFields = () => [F.stroke(), F.strokeWidth(), F.dash(), F.opacity()]

const def = (type: string, extra: Partial<WidgetDefinition> & { defaultProps: () => Record<string, any>; propSchema: PropField[] }): WidgetDefinition => ({
  type,
  label: () => tt('scada.widget.' + type),
  description: () => tt('scada.widget.' + type + 'Desc'),
  icon: icons[type],
  category: 'shape',
  defaultSize: { w: 160, h: 120 },
  minSize: { w: 10, h: 10 },
  needsBinding: false,
  component: ShapeWidget,
  ...extra
})

const strokeDefaults = { stroke: '#475569', strokeWidth: 2, dash: false, opacity: 100 }
const closedDefaults = { fillColor: '#dbe3ee', statusFill: false, stroke: '#475569', strokeWidth: 1.5, dash: false, opacity: 100 }

export const shapeDefinitions: WidgetDefinition[] = [
  def('line', {
    defaultSize: { w: 200, h: 20 },
    minSize: { w: 4, h: 4 },
    defaultProps: () => ({ direction: 'horizontal', ...strokeDefaults }),
    propSchema: [
      {
        key: 'direction', label: () => tt('scada.prop.direction'), type: 'select',
        options: () => [
          { label: tt('scada.prop.horizontal'), value: 'horizontal' },
          { label: tt('scada.prop.vertical'), value: 'vertical' },
          { label: tt('scada.prop.diagonalDown'), value: 'down' },
          { label: tt('scada.prop.diagonalUp'), value: 'up' }
        ]
      },
      ...openFields()
    ]
  }),
  def('polyline', {
    defaultProps: () => ({ vertices: '0,0 0,100 100,100', ...strokeDefaults }),
    propSchema: [{ key: 'vertices', label: () => tt('scada.prop.vertices'), type: 'textarea', placeholder: 'x,y x,y … (0-100%)' }, ...openFields()]
  }),
  def('arc', {
    defaultProps: () => ({ startAngle: 180, endAngle: 270, ...strokeDefaults }),
    propSchema: [F.startAngle(), F.endAngle(), ...openFields()]
  }),
  def('rect', {
    defaultProps: () => ({ radius: 0, ...closedDefaults }),
    propSchema: [{ key: 'radius', label: () => tt('scada.prop.radius'), type: 'number', min: 0, max: 200, step: 1 }, ...closedFields()]
  }),
  def('circle', { defaultSize: { w: 120, h: 120 }, defaultProps: () => ({ ...closedDefaults }), propSchema: closedFields() }),
  def('ellipse', { defaultProps: () => ({ ...closedDefaults }), propSchema: closedFields() }),
  def('sector', {
    defaultSize: { w: 140, h: 140 },
    defaultProps: () => ({ startAngle: 210, endAngle: 330, ...closedDefaults }),
    propSchema: [F.startAngle(), F.endAngle(), ...closedFields()]
  }),
  def('segment', {
    defaultSize: { w: 160, h: 80 },
    defaultProps: () => ({ orientation: 'up', ...closedDefaults }),
    propSchema: [
      {
        key: 'orientation', label: () => tt('scada.prop.orientation'), type: 'select',
        options: () => [
          { label: tt('scada.prop.up'), value: 'up' },
          { label: tt('scada.prop.down'), value: 'down' },
          { label: tt('scada.prop.left'), value: 'left' },
          { label: tt('scada.prop.right'), value: 'right' }
        ]
      },
      ...closedFields()
    ]
  }),
  def('polygon', {
    defaultSize: { w: 130, h: 130 },
    defaultProps: () => ({ sides: 5, rotation: 0, ...closedDefaults }),
    propSchema: [
      { key: 'sides', label: () => tt('scada.prop.sides'), type: 'number', min: 3, max: 24, step: 1 },
      { key: 'rotation', label: () => tt('scada.prop.rotation'), type: 'number', min: 0, max: 360, step: 5 },
      ...closedFields()
    ]
  }),
  def('pipe', {
    defaultSize: { w: 240, h: 40 },
    minSize: { w: 12, h: 12 },
    defaultProps: () => ({ pipeShape: 'h', thickness: 0, color: '#94a3b8', flow: 'off', flowColor: '#38bdf8', flowSpeed: 2, reverse: false, opacity: 100 }),
    propSchema: [
      {
        key: 'pipeShape', label: () => tt('scada.prop.pipeShape'), type: 'select',
        options: () => [
          { label: tt('scada.prop.horizontal'), value: 'h' },
          { label: tt('scada.prop.vertical'), value: 'v' },
          { label: tt('scada.prop.elbowTL'), value: 'tl' },
          { label: tt('scada.prop.elbowTR'), value: 'tr' },
          { label: tt('scada.prop.elbowBL'), value: 'bl' },
          { label: tt('scada.prop.elbowBR'), value: 'br' }
        ]
      },
      { key: 'thickness', label: () => tt('scada.prop.thickness'), type: 'number', min: 0, max: 200, step: 2, placeholder: '0 = auto' },
      { key: 'color', label: () => tt('scada.prop.pipeColor'), type: 'color' },
      {
        key: 'flow', label: () => tt('scada.prop.flow'), type: 'select',
        options: () => [
          { label: tt('scada.prop.flowOff'), value: 'off' },
          { label: tt('scada.prop.flowOn'), value: 'on' },
          { label: tt('scada.prop.flowBind'), value: 'bind' }
        ]
      },
      { key: 'flowColor', label: () => tt('scada.prop.flowColor'), type: 'color' },
      { key: 'flowSpeed', label: () => tt('scada.prop.flowSpeed'), type: 'number', min: 1, max: 5, step: 1 },
      { key: 'reverse', label: () => tt('scada.prop.reverse'), type: 'boolean' },
      F.opacity()
    ]
  })
]

export default ShapeWidget
