/**
 * 组态画布：逻辑尺寸 canvas.width × canvas.height，按容器等比缩放（横竖屏 / 编辑时侧栏占位都能完整显示）。
 * 编辑模式下：
 *  - Pointer Events 拖动组件、拖选区外框上的 8 个手柄（四角 + 四边中点）向任意方向缩放（鼠标、触摸通用），按网格吸附；
 *    Shift + 拖角点等比缩放；
 *  - Ctrl（Mac ⌘）/ Shift + 点击组件加减多选（点组合里的组件选中整个组合，Alt + 点击只选这一个）；多选时拖动 / 缩放 / 方向键 / Delete 作用于所有选中的组件，
 *    最先选中的是「参考对象」（橙色外框，对齐 / 等宽高以它为准）；Ctrl + A 全选，Ctrl + G 组合，Ctrl + Shift + G 取消组合；
 *  - 组件可以旋转 / 翻转（wrapper 上的 CSS transform，命中区域跟着画面走）；锁定的组件不能拖动 / 缩放（角上有小锁标记）；
 *  - 滚轮（或双指捏合）以指针位置为中心缩放视图，键盘 + / - / 0 同样可用；
 *  - 按住空格键拖动鼠标（画布任意位置，包括组件上方）、或按住鼠标中键拖动，平移视图；触摸屏双指同时可缩放 / 平移；
 *  - 选中组件后方向键微调位置（1px；Shift + 方向键按网格步进），Delete 删除；
 *  - 在空白处（画布或画布外的灰色区域）按住拖动：框选（完全落在框内的组件；组合要整个框住才选中），Ctrl / Shift + 框选追加到当前选择；
 *    拖动中按 Esc / 空格、或第二根手指按下（捏合）取消框选并恢复原来的选择；
 *  - 退出编辑（保存 / 取消）视图自动复位为"适配容器"。
 * 每个组件由 WidgetHost 承载：解析数据绑定 → 经过组件的数据处理函数（transform.ts）→ 维护历史值 → 渲染注册表里的组件。
 */
import { computed, defineComponent, onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch, watchEffect, type PropType } from 'vue'
import { useDataPoint } from './dataSource'
import { boundsMin, HANDLE_CURSORS, HANDLE_POS, HANDLES, resizeBounds, scaleItems, type ArrangeItem, type Handle } from './arrange'
import { fitScale, snap, transformCss, unionRect, visualRect } from './geometry'
import { getWidgetDefinition } from './registry'
import { FONT_FAMILY_KEY, fontFamilyCss } from './fonts'
import { toArrangeItem, useScadaStore } from './store'
import { clearTransformReport, compileTransform, reportTransform, runTransform, type TransformContext } from './transform'
import { applyRuntime, resolveParam, setRuntimeProp, SubPool } from './runtime'
import type { DataPoint, WidgetInstance, WidgetRect } from './types'
import { tt } from './widgets/common'

export const ZOOM_MIN = 0.25
export const ZOOM_MAX = 6
/** 平移时画布至少保留在视口内的像素 */

/** 画布视图状态（编辑模式的缩放 / 平移；退出编辑自动复位）。供工具栏、组件库拖放换算使用 */
export const canvasView = reactive({
  el: null as HTMLElement | null,
  /** 逻辑 px → 屏幕 px 的总缩放（适配比例 × zoom） */
  scale: 1,
  /** 用户缩放倍率，1 = 刚好适配容器 */
  zoom: 1,
  panX: 0,
  panY: 0,
  /** 正在拖动平移 */
  panning: false,
  /** 空格键按住中（平移修饰键），供光标样式使用 */
  spaceDown: false
})

let zoomHandler: ((factor: number, cx?: number, cy?: number) => void) | null = null
/** 缩放视图：factor > 1 放大；cx / cy 为容器内坐标，缺省以容器中心为基准 */
export const zoomCanvas = (factor: number, cx?: number, cy?: number) => {
  if (zoomHandler) zoomHandler(factor, cx, cy)
}
export const resetCanvasView = () => {
  canvasView.zoom = 1
  canvasView.panX = 0
  canvasView.panY = 0
}

let viewCenterHandler: (() => { x: number; y: number } | null) | null = null
/**
 * 当前窗口视野正中央对应的画布逻辑坐标（已夹进「视野 ∩ 画布」）：组件库点按组件时把它放在这里，而不是画布左上角。
 * 画布容器还没量出尺寸（没挂载 / 测试环境）返回 null。
 */
export const viewCenterInCanvas = () => (viewCenterHandler ? viewCenterHandler() : null)

let focusProbe: (() => boolean) | null = null
/** 键盘焦点是否在页面空白（body）或画布容器内（页面级快捷键 Tab / Esc 取消选中用：焦点在按钮 / 输入框 / 下拉上时让控件自己处理） */
export const canvasFocused = () => (focusProbe ? focusProbe() : true)

let focusStrictProbe: (() => boolean) | null = null
/** 键盘焦点是否确实在画布容器内（页面空白 body 不算）：用户刚点过画布 / 组件才成立，Ctrl + C 据此判断「复制组件」还是「复制页面上选着的文字」 */
export const canvasHasFocus = () => (focusStrictProbe ? focusStrictProbe() : false)

export const clientToCanvas = (clientX: number, clientY: number) => {
  const el = canvasView.el
  if (!el) return null
  const r = el.getBoundingClientRect()
  if (clientX < r.left || clientX > r.right || clientY < r.top || clientY > r.bottom) return null
  const s = canvasView.scale || 1
  return { x: (clientX - r.left) / s, y: (clientY - r.top) / s }
}

/** 单个组件宿主：解析绑定、执行数据处理函数、维护历史值、渲染注册表里的组件 */
const WidgetHost = defineComponent({
  name: 'ScadaWidgetHost',
  props: {
    widget: { type: Object as PropType<WidgetInstance>, required: true },
    editing: { type: Boolean, default: false }
  },
  setup(props) {
    const def = computed(() => getWidgetDefinition(props.widget.type))
    const raw = useDataPoint(() => props.widget.binding)
    // 历史值用普通数组维护（processed 计算属性不能依赖它，否则每次 push 都会重跑一遍处理函数），渲染时用快照
    let historyArr: number[] = []
    const history = shallowRef<number[]>([])
    // 处理函数的持久状态：代码改变时清空
    const state: Record<string, any> = {}
    let prev: DataPoint | undefined

    const compiled = computed(() => compileTransform(props.widget.transform))
    // ctx.get 读到的其他数据项按需订阅（轮询型数据源才会请求它们）；代码改变 / 卸载时退订
    const extraSubs = new SubPool()
    watch(
      () => compiled.value.source,
      () => {
        Object.keys(state).forEach(k => delete state[k])
        prev = undefined
        extraSubs.clear()
      }
    )
    onBeforeUnmount(() => extraSubs.clear())
    /** ctx.get：监听 / 读取其他数据项（在 processed 计算属性里调用 → 读到的值是响应式依赖，变化时处理函数自动重新执行） */
    const ctxGet = (keyOrName: string, sourceId?: string) => {
      const ref = resolveParam(keyOrName, sourceId, props.widget.binding?.source)
      if (!ref) return undefined
      extraSubs.ensure(ref)
      return ref.prov.read(ref.key)
    }
    /** ctx.setProp：对本组件的运行时属性覆盖（展示模式渲染时合并，见下方 Canvas 渲染处的 applyRuntime） */
    const ctxSetProp = (key: string, value: any) => setRuntimeProp(props.widget.id, key, value)
    /** 交给组件渲染的数据点：原始数据点经过处理函数（若有） */
    const processed = computed(() => {
      const c = compiled.value
      const input = raw.value
      if (!c.fn && !c.error) return { point: input, error: null as string | null }
      const ctx: TransformContext = { widget: props.widget, history: historyArr, state, prev, now: Date.now(), get: ctxGet, setProp: ctxSetProp }
      const result = runTransform(c, input, ctx)
      prev = result.point
      return result
    })
    watch(
      processed,
      r => {
        if (compiled.value.source) reportTransform(props.widget.id, r, raw.value)
        else clearTransformReport(props.widget.id)
      },
      { immediate: true }
    )
    onBeforeUnmount(() => clearTransformReport(props.widget.id))

    watch(
      () => {
        const p = processed.value.point
        return p ? `${p.time || 0}|${p.value}` : ''
      },
      () => {
        const keep = def.value?.keepHistory || 0
        if (!keep) return
        const v = processed.value.point?.value
        if (v === null || v === undefined || !Number.isFinite(v)) return
        historyArr.push(v)
        const max = Math.max(2, Math.min(keep, Number(props.widget.props.points) || keep))
        if (historyArr.length > max) historyArr.splice(0, historyArr.length - max)
        history.value = historyArr.slice()
      }
    )
    watch(
      () => `${props.widget.binding?.source || ''}|${props.widget.binding?.key || ''}`,
      () => {
        historyArr = []
        history.value = []
      }
    )

    return () => {
      const d = def.value
      if (!d) {
        return (
          <div class={'w-full h-full flex items-center justify-center text-xs text-gray-500 bg-gray-100 border border-dashed border-gray-400 rounded'}>
            {tt('scada.widget.unknown')}: {props.widget.type}
          </div>
        )
      }
      const Comp = d.component as any
      return <Comp widget={props.widget} point={processed.value.point} editing={props.editing} history={history.value} />
    }
  }
})

interface DragState {
  mode: 'move' | 'resize'
  handle?: Handle
  pointerId: number
  startX: number
  startY: number
  /** 开始拖动时「可动」（未锁定）的选中组件快照 */
  items: ArrangeItem[]
  /** 它们的视觉外接框（缩放手柄围着它） */
  bounds: WidgetRect
  /** 缩放时外接框允许的最小宽 / 高 */
  minW: number
  minH: number
  /** 位移超过 DRAG_THRESHOLD 才算真正拖动；没动过的「点按」在抬起时才处理选择（Ctrl 点已选中的 = 取消选中；多选里点一个 = 收缩为它） */
  moved: boolean
  click: { id: string; action: 'toggle' | 'collapse'; group: boolean } | null
  /** 锁定提示每次拖动只弹一次 */
  warned: boolean
  /** 撤销历史的合并键：这一次拖动 / 缩放手势里的所有改动只算一步 */
  key: string
}
let dragSeq = 0

/** 点按与拖动的分界（屏幕像素） */
const DRAG_THRESHOLD = 3

/** 平移拖动状态（空格 + 左键 / 中键） */
interface PressState {
  pointerId: number
  startX: number
  startY: number
  panX0: number
  panY0: number
}

/** 框选：起点 / 当前点都是画布逻辑坐标；base = 开始框选时保留的选择（Ctrl / Shift 追加时为原选择，否则为空） */
interface MarqueeState {
  pointerId: number
  startX: number
  startY: number
  x0: number
  y0: number
  x1: number
  y1: number
  base: string[]
  /** 开始框选前的选择（取消时恢复） */
  before: string[]
  active: boolean
}

interface PinchState {
  a: number
  b: number
  dist: number
  midX: number
  midY: number
}

const distance = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y)

/** 方向键 → 位移方向 */
const ARROW_KEYS: Record<string, { dx: number; dy: number }> = {
  ArrowLeft: { dx: -1, dy: 0 },
  ArrowRight: { dx: 1, dy: 0 },
  ArrowUp: { dx: 0, dy: -1 },
  ArrowDown: { dx: 0, dy: 1 }
}

export default defineComponent({
  name: 'ScadaCanvas',
  setup() {
    const scada = useScadaStore()
    const containerRef = ref<HTMLElement>()
    const canvasRef = ref<HTMLElement>()
    const size = reactive({ w: 0, h: 0 })
    let ro: ResizeObserver | null = null
    let drag: DragState | null = null
    const pointers = new Map<number, { x: number; y: number }>()
    let press: PressState | null = null
    let pinch: PinchState | null = null
    let marquee: MarqueeState | null = null
    /** 框选矩形（画布逻辑坐标），用于渲染；null = 没在框选 */
    const marqueeRect = ref<WidgetRect | null>(null)

    const layout = computed(() => scada.current)
    /** 让整个画布刚好放进容器的比例 */
    const fit = computed(() => fitScale(size.w, size.h, layout.value.canvas.width, layout.value.canvas.height))
    /** 实际缩放 = 适配比例 × 用户缩放 */
    const scale = computed(() => fit.value * canvasView.zoom)
    /** 画布左上角始终固定在容器左上角：无论缩放还是拖动都不移动原点 */
    const centerOffset = (_s: number) => ({ x: 0, y: 0 })
    const offset = computed(() => {
      const o = centerOffset(scale.value)
      return { x: o.x + canvasView.panX, y: o.y + canvasView.panY }
    })

    const measure = () => {
      const el = containerRef.value
      if (!el) return
      size.w = el.clientWidth
      size.h = el.clientHeight
      // 容器变小后平移量可能超界，吸附回边缘
      clampPan()
    }
    /**
     * 视野正中央在画布逻辑坐标里的位置：容器（= 当前窗口视野）中心按当前缩放 / 平移反算，再夹进「视野 ∩ 画布」——
     * 画布被平移到一侧、容器中心落在画布外时，取视野里最靠近中心的那一点。容器没量出尺寸时返回 null
     */
    const viewCenter = () => {
      if (!size.w || !size.h) return null
      const s = scale.value
      if (!s || !Number.isFinite(s)) return null
      const c = layout.value.canvas
      const o = offset.value
      const x0 = Math.max(0, -o.x / s)
      const x1 = Math.min(c.width, (size.w - o.x) / s)
      const y0 = Math.max(0, -o.y / s)
      const y1 = Math.min(c.height, (size.h - o.y) / s)
      if (x1 <= x0 || y1 <= y0) return { x: c.width / 2, y: c.height / 2 }
      const cx = (size.w / 2 - o.x) / s
      const cy = (size.h / 2 - o.y) / s
      return { x: Math.min(x1, Math.max(x0, cx)), y: Math.min(y1, Math.max(y0, cy)) }
    }

    watchEffect(() => {
      canvasView.scale = scale.value
    })

    // ---------------------------------------------------------------- 视图缩放 / 平移
    /**
     * 画布不大于容器时左上角固定在容器左上角（不能拖离）；
     * 放大超过容器后允许拖动查看其余部分，但画布边缘不能被拖进容器内侧（不留空边）
     */
    const clampPan = () => {
      if (!size.w || !size.h) return
      const s = scale.value
      const W = layout.value.canvas.width * s
      const H = layout.value.canvas.height * s
      canvasView.panX = W <= size.w ? 0 : Math.min(0, Math.max(size.w - W, canvasView.panX))
      canvasView.panY = H <= size.h ? 0 : Math.min(0, Math.max(size.h - H, canvasView.panY))
    }
    /** 以容器内 (cx, cy) 为不动点缩放；缺省以画布左上角为不动点，缩放后超界部分由 clampPan 吸附回边缘 */
    const zoomAt = (factor: number, cx?: number, cy?: number) => {
      if (!scada.editing || !Number.isFinite(factor) || factor <= 0) return
      const z0 = canvasView.zoom
      const z1 = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z0 * factor))
      if (Math.abs(z1 - z0) < 1e-6) return
      const s0 = fit.value * z0
      const s1 = fit.value * z1
      const px = cx === undefined ? 0 : cx
      const py = cy === undefined ? 0 : cy
      const lx = (px - canvasView.panX) / s0
      const ly = (py - canvasView.panY) / s0
      canvasView.zoom = z1
      canvasView.panX = px - lx * s1
      canvasView.panY = py - ly * s1
      clampPan()
    }
    const onWheel = (e: WheelEvent) => {
      if (!scada.editing) return
      // 只有按住 Ctrl（Mac 上 ⌘）滚动滚轮才缩放；普通滚轮不拦截
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      const el = containerRef.value
      if (!el) return
      const r = el.getBoundingClientRect()
      // deltaMode：0 像素 / 1 行 / 2 页；一格滚轮（约 100px 或 3 行）≈ 缩放 15%
      const unit = e.deltaMode === 1 ? 0.05 : e.deltaMode === 2 ? 1 : 0.0015
      const factor = Math.min(2, Math.max(0.5, Math.exp(-e.deltaY * unit)))
      zoomAt(factor, e.clientX - r.left, e.clientY - r.top)
    }

    const clearPress = () => {
      press = null
      canvasView.panning = false
    }
    const beginPan = (e: PointerEvent) => {
      press = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, panX0: canvasView.panX, panY0: canvasView.panY }
      canvasView.panning = true
    }
    const capturePointer = (el: HTMLElement | undefined, pointerId: number) => {
      if (!el || !el.setPointerCapture) return
      try {
        el.setPointerCapture(pointerId)
      } catch {
        /* 某些环境不支持，忽略 */
      }
    }
    const releasePointer = (el: HTMLElement | undefined, pointerId: number) => {
      if (!el || !el.releasePointerCapture) return
      try {
        if (!el.hasPointerCapture || el.hasPointerCapture(pointerId)) el.releasePointerCapture(pointerId)
      } catch {
        /* ignore */
      }
    }
    // ---------------------------------------------------------------- 框选
    /** 屏幕坐标 → 画布逻辑坐标（按画布元素的实际位置和当前缩放换算） */
    const toCanvasPoint = (clientX: number, clientY: number) => {
      const el = canvasRef.value
      const r = el ? el.getBoundingClientRect() : { left: 0, top: 0 }
      const s = scale.value || 1
      return { x: (clientX - r.left) / s, y: (clientY - r.top) / s }
    }
    /** 完全落在框内的组件（按图层顺序）；组合里的组件只有整个组合的外接框都在框内才算 */
    const marqueeHits = (rect: WidgetRect) => {
      const inside = (v: WidgetRect) => v.x >= rect.x - 0.01 && v.y >= rect.y - 0.01 && v.x + v.w <= rect.x + rect.w + 0.01 && v.y + v.h <= rect.y + rect.h + 0.01
      const widgets = layout.value.widgets
      const groupOk = new Map<string, boolean>()
      return widgets
        .filter(w => {
          if (!w.groupId) return inside(visualRect(w))
          if (!groupOk.has(w.groupId)) {
            const u = unionRect(widgets.filter(e => e.groupId === w.groupId).map(visualRect))
            groupOk.set(w.groupId, !!u && inside(u))
          }
          return !!groupOk.get(w.groupId)
        })
        .map(w => w.id)
    }
    const beginMarquee = (e: PointerEvent) => {
      const additive = e.ctrlKey || e.metaKey || e.shiftKey
      const before = [...scada.selectedIds]
      // 不带修饰键按在空白处：先取消选择（原来的点击空白取消选择行为不变）
      if (!additive) scada.select(null)
      const p = toCanvasPoint(e.clientX, e.clientY)
      marquee = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, x0: p.x, y0: p.y, x1: p.x, y1: p.y, base: additive ? before : [], before, active: false }
    }
    const updateMarquee = (e: PointerEvent) => {
      const m = marquee
      if (!m) return
      if (!m.active) {
        if (Math.hypot(e.clientX - m.startX, e.clientY - m.startY) < DRAG_THRESHOLD) return
        m.active = true
      }
      const p = toCanvasPoint(e.clientX, e.clientY)
      m.x1 = p.x
      m.y1 = p.y
      const rect = { x: Math.min(m.x0, m.x1), y: Math.min(m.y0, m.y1), w: Math.abs(m.x1 - m.x0), h: Math.abs(m.y1 - m.y0) }
      marqueeRect.value = rect
      const hits = marqueeHits(rect)
      const next = [...m.base, ...hits.filter(id => !m.base.includes(id))]
      if (next.length !== scada.selectedIds.length || next.some((id, i) => scada.selectedIds[i] !== id)) scada.setSelection(next)
    }
    /** 结束框选；restore = true 时（Esc / 空格 / 捏合 / pointercancel）恢复开始框选前的选择 */
    const endMarquee = (restore: boolean) => {
      const m = marquee
      if (!m) return
      marquee = null
      marqueeRect.value = null
      if (restore) scada.setSelection(m.before)
    }

    /**
     * 容器按下（画布、画布外的灰色区域，以及按住空格时的组件上方）：
     * 空格 + 左键 / 中键 → 立即平移；第二指 → 捏合缩放；其余情况只记录指针（供捏合识别）
     */
    const onContainerPointerDown = (e: PointerEvent) => {
      if (!scada.editing || drag) return
      if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 1) return
      // 让容器拿到焦点：属性面板里的输入框失焦，之后按空格才会被当作平移修饰键而不是输入
      const el = containerRef.value
      if (el && el.focus) el.focus({ preventScroll: true })
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      capturePointer(el, e.pointerId)
      if (pointers.size >= 2) {
        clearPress()
        // 第二根手指：改为捏合缩放，取消框选
        endMarquee(true)
        const entries = Array.from(pointers.entries())
        const [ida, pa] = entries[entries.length - 2]
        const [idb, pb] = entries[entries.length - 1]
        pinch = { a: ida, b: idb, dist: distance(pa, pb), midX: (pa.x + pb.x) / 2, midY: (pa.y + pb.y) / 2 }
        return
      }
      const byMiddle = e.pointerType === 'mouse' && e.button === 1
      const bySpace = canvasView.spaceDown && (e.pointerType !== 'mouse' || e.button === 0)
      if (byMiddle || bySpace) {
        // 中键要阻止浏览器的自动滚动；空格平移时阻止选中文字
        e.preventDefault()
        beginPan(e)
        return
      }
      // 空白处（画布 / 灰色区域；组件和手柄的 pointerdown 已 stopPropagation，到不了这里）左键 / 触摸：开始框选。
      // 不带修饰键时 beginMarquee 先取消选择（= 原来「点空白取消选择」），带 Ctrl / Shift 保留选择并追加
      if (e.pointerType !== 'mouse' || e.button === 0) {
        e.preventDefault()
        beginMarquee(e)
      }
    }
    const onContainerPointerMove = (e: PointerEvent) => {
      const p = pointers.get(e.pointerId)
      if (!p) return
      p.x = e.clientX
      p.y = e.clientY
      if (pinch) {
        const a = pointers.get(pinch.a)
        const b = pointers.get(pinch.b)
        if (!a || !b) return
        const d = distance(a, b)
        const midX = (a.x + b.x) / 2
        const midY = (a.y + b.y) / 2
        const el = containerRef.value
        const r = el ? el.getBoundingClientRect() : { left: 0, top: 0 }
        if (pinch.dist > 0 && d > 0) zoomAt(d / pinch.dist, midX - r.left, midY - r.top)
        canvasView.panX += midX - pinch.midX
        canvasView.panY += midY - pinch.midY
        clampPan()
        pinch.dist = d
        pinch.midX = midX
        pinch.midY = midY
        return
      }
      if (marquee && marquee.pointerId === e.pointerId) {
        updateMarquee(e)
        return
      }
      if (!press || press.pointerId !== e.pointerId) return
      canvasView.panX = press.panX0 + (e.clientX - press.startX)
      canvasView.panY = press.panY0 + (e.clientY - press.startY)
      clampPan()
    }
    const onContainerPointerUp = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId)) return
      pointers.delete(e.pointerId)
      releasePointer(containerRef.value, e.pointerId)
      if (pinch && (pinch.a === e.pointerId || pinch.b === e.pointerId)) pinch = null
      if (press && press.pointerId === e.pointerId) clearPress()
      if (marquee && marquee.pointerId === e.pointerId) endMarquee(e.type === 'pointercancel')
    }
    const resetGestures = () => {
      pointers.clear()
      pinch = null
      clearPress()
      marquee = null
      marqueeRect.value = null
      canvasView.spaceDown = false
    }

    watch(
      () => scada.editing,
      () => {
        resetGestures()
        resetCanvasView()
      }
    )

    onMounted(() => {
      measure()
      if (typeof ResizeObserver !== 'undefined' && containerRef.value) {
        ro = new ResizeObserver(() => measure())
        ro.observe(containerRef.value)
      } else {
        window.addEventListener('resize', measure)
      }
      canvasView.el = canvasRef.value || null
      window.addEventListener('keydown', onKeyDown)
      window.addEventListener('keyup', onKeyUp)
      window.addEventListener('blur', onWindowBlur)
      // 滚轮需要 preventDefault，必须以非 passive 方式注册
      containerRef.value?.addEventListener('wheel', onWheel, { passive: false })
      zoomHandler = zoomAt
      viewCenterHandler = viewCenter
      focusProbe = focusOnCanvas
      focusStrictProbe = canvasContainsFocus
    })
    onBeforeUnmount(() => {
      if (ro) ro.disconnect()
      window.removeEventListener('resize', measure)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onWindowBlur)
      containerRef.value?.removeEventListener('wheel', onWheel)
      if (zoomHandler === zoomAt) zoomHandler = null
      if (viewCenterHandler === viewCenter) viewCenterHandler = null
      if (focusProbe === focusOnCanvas) focusProbe = null
      if (focusStrictProbe === canvasContainsFocus) focusStrictProbe = null
      resetGestures()
      resetCanvasView()
      if (canvasView.el === canvasRef.value) canvasView.el = null
    })
    watch(canvasRef, el => {
      canvasView.el = el || null
    })

    const isSpace = (e: KeyboardEvent) => e.code === 'Space' || e.key === ' ' || e.key === 'Spacebar'
    /** 焦点是否在页面空白（body）或画布容器内：只有这时空格 / 方向键才由画布处理，焦点在按钮 / 下拉等控件上时让控件自己处理 */
    const focusOnCanvas = () => {
      const active = typeof document !== 'undefined' ? document.activeElement : null
      return !active || active === document.body || !!(containerRef.value && containerRef.value.contains(active))
    }
    const canvasContainsFocus = () => {
      const active = typeof document !== 'undefined' ? document.activeElement : null
      return !!(active && containerRef.value && containerRef.value.contains(active))
    }
    /** 被锁定的组件拦下了操作：提示一下，免得用户以为没反应 */
    const notifyLocked = () => {
      if (window.$message && window.$message.warning) window.$message.warning(tt('scada.tool.lockedHint'))
    }
    /** 方向键微调选中的组件（未锁定的整体平移，整体不越出画布）：1px；Shift 按网格步进 */
    const nudgeSelected = (dx: number, dy: number, byGrid: boolean) => {
      if (!scada.selectedIds.length) return
      const step = byGrid ? Math.max(1, layout.value.canvas.grid || 10) : 1
      if (!scada.nudgeSelection(dx * step, dy * step)) notifyLocked()
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (!scada.editing) return
      const target = e.target as HTMLElement | null
      const tag = target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) return
      if (marquee && e.key === 'Escape') {
        endMarquee(true)
        e.preventDefault()
        return
      }
      if (isSpace(e)) {
        if (!focusOnCanvas()) return
        // 空格 = 平移修饰键：取消进行中的框选
        endMarquee(true)
        canvasView.spaceDown = true
        e.preventDefault() // 防止页面滚动
        return
      }
      // Ctrl / ⌘ + A 全选，+ G 组合，+ Shift + G 取消组合（焦点在按钮 / 下拉上时不拦截）
      if ((e.ctrlKey || e.metaKey) && !e.altKey && typeof e.key === 'string') {
        const k = e.key.toLowerCase()
        if ((k === 'a' || k === 'g') && focusOnCanvas()) {
          if (k === 'a') scada.selectAll()
          else if (e.shiftKey) scada.ungroupSelection()
          else scada.groupSelection()
          e.preventDefault()
          return
        }
      }
      if (e.key === '+' || e.key === '=') {
        zoomAt(1.2)
        e.preventDefault()
        return
      }
      if (e.key === '-' || e.key === '_') {
        zoomAt(1 / 1.2)
        e.preventDefault()
        return
      }
      if (e.key === '0') {
        resetCanvasView()
        e.preventDefault()
        return
      }
      if (!scada.selectedIds.length) return
      if (e.key === 'Delete' || e.key === 'Backspace') {
        // 焦点在按钮 / 下拉 / 颜色面板的色块上时不删组件（选完颜色顺手按退格不能把组件删了）
        if (!focusOnCanvas()) return
        if (scada.removeSelected().locked) notifyLocked()
        e.preventDefault()
        return
      }
      const arrow = ARROW_KEYS[e.key]
      if (arrow) {
        if (!focusOnCanvas()) return
        nudgeSelected(arrow.dx, arrow.dy, e.shiftKey)
        e.preventDefault() // 防止页面滚动
      }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (isSpace(e)) canvasView.spaceDown = false
    }
    /** 切到别的窗口时收不到 keyup，这里兜底复位 */
    const onWindowBlur = () => {
      canvasView.spaceDown = false
      endMarquee(false)
    }

    // ---------------------------------------------------------------- 组件拖动 / 缩放 / 多选
    const selectedSet = computed(() => new Set(scada.selectedIds))
    /** 选区里「可动」（未锁定）的组件；缩放手柄围着它们的视觉外接框 */
    const movable = computed(() => scada.selectedWidgets.filter(w => !w.locked))
    const frame = computed(() => unionRect(movable.value.map(visualRect)))
    /** 网格关闭时只按整数像素取整 */
    const effGrid = () => (scada.gridOn ? layout.value.canvas.grid : 1)

    const focusContainer = () => {
      // preventDefault 后浏览器不会再移动焦点，这里主动让容器拿到焦点：属性面板输入框失焦，方向键 / 空格才会交给画布
      const container = containerRef.value
      if (container && container.focus) container.focus({ preventScroll: true })
    }
    const beginDrag = (e: PointerEvent, mode: DragState['mode'], handle: Handle | undefined, capture: HTMLElement | null, click: DragState['click']) => {
      const items = movable.value.map(toArrangeItem)
      const bounds = unionRect(items.map(visualRect)) || { x: 0, y: 0, w: 0, h: 0 }
      const min = boundsMin(items, bounds)
      drag = { mode, handle, pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, items, bounds, minW: min.minW, minH: min.minH, moved: false, click, warned: false, key: `drag:${++dragSeq}` }
      capturePointer(capture || undefined, e.pointerId)
    }
    const onWidgetPointerDown = (e: PointerEvent, w: WidgetInstance) => {
      if (!scada.editing) return
      if (e.pointerType === 'mouse' && e.button !== 0) return
      if (press || pinch) return
      // 按住空格时不拖组件，事件冒泡到容器去平移
      if (canvasView.spaceDown) return
      e.stopPropagation()
      e.preventDefault()
      focusContainer()
      // Ctrl / ⌘ / Shift：加减多选；Alt：只操作这一个组件（绕过组合）
      const additive = e.ctrlKey || e.metaKey || e.shiftKey
      const group = !e.altKey
      const wasSelected = scada.selectedIds.includes(w.id)
      let click: DragState['click'] = null
      if (additive) {
        // 已选中的先不取消（可能是要拖着一起走），没拖动就抬起才取消
        if (wasSelected) click = { id: w.id, action: 'toggle', group }
        else scada.toggleSelect(w.id, { group })
      } else if (!wasSelected) {
        scada.select(w.id, { group })
      } else if (scada.selectedIds.length > 1) {
        // 多选里按下一个：拖动则整体移动，点按（没拖动）则收缩为只选它
        click = { id: w.id, action: 'collapse', group }
      }
      beginDrag(e, 'move', undefined, e.currentTarget as HTMLElement | null, click)
    }
    /** 八个手柄之一按下：缩放当前选区（单个组件 = 缩放它自己） */
    const onHandlePointerDown = (e: PointerEvent, handle: Handle) => {
      if (!scada.editing) return
      if (e.pointerType === 'mouse' && e.button !== 0) return
      if (press || pinch) return
      if (canvasView.spaceDown) return
      e.stopPropagation()
      e.preventDefault()
      focusContainer()
      beginDrag(e, 'resize', handle, e.currentTarget as HTMLElement | null, null)
    }
    const onPointerMove = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.pointerId) return
      const rawDx = e.clientX - drag.startX
      const rawDy = e.clientY - drag.startY
      if (!drag.moved) {
        if (Math.hypot(rawDx, rawDy) < DRAG_THRESHOLD) return
        drag.moved = true
      }
      if (!drag.items.length) {
        // 选中的全是锁定组件：拖不动，提示一次
        if (!drag.warned) {
          drag.warned = true
          notifyLocked()
        }
        return
      }
      const s = scale.value || 1
      const dx = rawDx / s
      const dy = rawDy / s
      const canvas = layout.value.canvas
      const grid = effGrid()
      const b = drag.bounds
      if (drag.mode === 'move') {
        // 整体平移：外接框左上角吸附网格，整体不越出画布
        const nx = Math.max(0, Math.min(snap(b.x + dx, grid), canvas.width - b.w))
        const ny = Math.max(0, Math.min(snap(b.y + dy, grid), canvas.height - b.h))
        scada.applyPatches(drag.items.map(i => ({ id: i.id, x: i.x + (nx - b.x), y: i.y + (ny - b.y), w: i.w, h: i.h })), { merge: drag.key })
      } else if (drag.handle) {
        const next = resizeBounds(b, drag.handle, dx, dy, { grid, canvas, minW: drag.minW, minH: drag.minH, keepAspect: e.shiftKey })
        scada.applyPatches(scaleItems(drag.items, b, next), { merge: drag.key })
      }
    }
    const onPointerUp = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.pointerId) return
      const d = drag
      drag = null
      if (!d.moved && d.click) {
        if (d.click.action === 'toggle') scada.toggleSelect(d.click.id, { group: d.click.group })
        else scada.select(d.click.id, { group: d.click.group })
      }
    }

    /** 选区外框 + 八个手柄 + 参考对象标记 + 锁定小锁；画在所有组件之上、随画布缩放，尺寸按 1/s 抵消成固定的屏幕像素 */
    const renderOverlay = (s: number) => {
      if (!scada.editing) return null
      const nodes: any[] = []
      const multi = scada.selectedIds.length > 1
      layout.value.widgets.forEach(w => {
        if (!w.locked) return
        const v = visualRect(w)
        const sz = 14 / s
        nodes.push(
          <div
            key={'lock-' + w.id}
            data-lock-badge={w.id}
            class={'absolute flex items-center justify-center rounded-full bg-gray-700 text-white pointer-events-none'}
            style={{ left: v.x + v.w - sz - 2 / s + 'px', top: v.y + 2 / s + 'px', width: sz + 'px', height: sz + 'px' }}
          >
            <svg viewBox="0 0 24 24" width="64%" height="64%" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <rect x="5" y="11" width="14" height="10" rx="2" />
              <path d="M8 11V8a4 4 0 0 1 8 0v3" />
            </svg>
          </div>
        )
      })
      const ref = multi ? scada.selectedWidgets[0] : undefined
      if (ref) {
        const v = visualRect(ref)
        nodes.push(
          <div
            key="ref-badge"
            data-reference-badge={ref.id}
            class={'absolute pointer-events-none whitespace-nowrap rounded bg-amber-500 text-white'}
            style={{ left: v.x + 'px', top: v.y + 'px', transform: `translateY(-100%) scale(${1 / s})`, transformOrigin: '0 100%', fontSize: '10px', lineHeight: '14px', padding: '0 4px' }}
          >
            {tt('scada.tool.reference')}
          </div>
        )
      }
      const f = frame.value
      if (f) {
        if (multi) {
          nodes.push(
            <div
              key="frame"
              data-selection-frame
              class={'absolute pointer-events-none'}
              style={{ left: f.x + 'px', top: f.y + 'px', width: f.w + 'px', height: f.h + 'px', border: `${1 / s}px dashed #2563eb`, boxSizing: 'border-box' }}
            />
          )
        }
        const vis = 10 / s
        // 点击区域比可见的小方块大（触摸屏好点）；选区很小时收小，免得盖住组件本身没法拖动
        const hit = Math.max(10 / s, Math.min(24 / s, Math.min(f.w, f.h) / 3))
        const roomX = f.w * s >= 48
        const roomY = f.h * s >= 48
        HANDLES.forEach(h => {
          // 选区太窄 / 太矮时只留四角，避免相邻手柄挤在一起
          if ((h === 'n' || h === 's') && !roomX) return
          if ((h === 'e' || h === 'w') && !roomY) return
          const p = HANDLE_POS[h]
          nodes.push(
            <div
              key={h}
              data-handle={h}
              class={'absolute flex items-center justify-center'}
              style={{
                left: f.x + f.w * p.fx - hit / 2 + 'px',
                top: f.y + f.h * p.fy - hit / 2 + 'px',
                width: hit + 'px',
                height: hit + 'px',
                cursor: canvasView.spaceDown ? 'grab' : HANDLE_CURSORS[h],
                touchAction: 'none',
                pointerEvents: 'auto'
              }}
              onPointerdown={(e: PointerEvent) => onHandlePointerDown(e, h)}
            >
              <div
                class={'pointer-events-none bg-blue-600'}
                style={{ width: vis + 'px', height: vis + 'px', border: `${1.5 / s}px solid #fff`, borderRadius: 2 / s + 'px', boxShadow: `0 0 0 ${0.5 / s}px rgba(0,0,0,.35)`, boxSizing: 'border-box' }}
              />
            </div>
          )
        })
      }
      const mr = marqueeRect.value
      if (mr) {
        nodes.push(
          <div
            key="marquee"
            data-marquee
            class={'absolute pointer-events-none'}
            style={{ left: mr.x + 'px', top: mr.y + 'px', width: mr.w + 'px', height: mr.h + 'px', border: `${1 / s}px solid #2563eb`, background: 'rgba(37,99,235,.12)', boxSizing: 'border-box' }}
          />
        )
      }
      return (
        <div class={'absolute left-0 top-0 pointer-events-none'} style={{ width: '0px', height: '0px', overflow: 'visible' }} data-scada-overlay>
          {nodes}
        </div>
      )
    }

    return () => {
      const l = layout.value
      const editing = scada.editing
      const s = scale.value
      const multi = scada.selectedIds.length > 1
      const gridStyle = editing && scada.gridOn
        ? {
          backgroundImage: 'linear-gradient(to right, rgba(0,0,0,.07) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,0,0,.07) 1px, transparent 1px)',
          backgroundSize: `${l.canvas.grid}px ${l.canvas.grid}px`
        }
        : {}
      return (
        <div
          ref={containerRef}
          class={'relative w-full h-full overflow-hidden select-none outline-none'}
          tabindex={-1}
          style={{
            background: editing ? '#d9dde3' : 'transparent',
            touchAction: editing ? 'none' : 'auto',
            cursor: canvasView.panning ? 'grabbing' : canvasView.spaceDown ? 'grab' : 'default'
          }}
          onPointerdown={onContainerPointerDown}
          onPointermove={onContainerPointerMove}
          onPointerup={onContainerPointerUp}
          onPointercancel={onContainerPointerUp}
          onLostpointercapture={onContainerPointerUp}
          onContextmenu={(e: MouseEvent) => {
            if (canvasView.panning) e.preventDefault()
          }}
        >
          <div
            ref={canvasRef}
            class={'absolute shadow-sm'}
            style={{
              left: offset.value.x + 'px',
              top: offset.value.y + 'px',
              width: l.canvas.width + 'px',
              height: l.canvas.height + 'px',
              transform: `scale(${s})`,
              transformOrigin: '0 0',
              background: l.canvas.background,
              outline: editing ? '1px solid #9ca3af' : 'none',
              ...gridStyle
            }}
            onPointermove={onPointerMove}
            onPointerup={onPointerUp}
            onPointercancel={onPointerUp}
          >
            {l.widgets.map(w0 => {
              // 展示模式合并脚本 / 处理函数的运行时属性覆盖（props + hidden / x / y / w / h）；编辑模式永远用真实值
              const w = editing ? w0 : applyRuntime(w0)
              const selected = editing && selectedSet.value.has(w.id)
              // 多选时参考对象（最先选中的）用橙色外框，其余蓝色
              const isRef = selected && multi && scada.referenceId === w.id
              const tf = transformCss(w)
              return (
                <div
                  key={w.id}
                  class={'absolute'}
                  data-widget-id={w.id}
                  data-widget-type={w.type}
                  style={{
                    left: w.x + 'px', top: w.y + 'px', width: w.w + 'px', height: w.h + 'px',
                    // 旋转 / 翻转直接作用在 wrapper 上：命中区域、外框都跟着画面走（只有 90° 的倍数，外框仍是轴对齐矩形）
                    transform: tf || undefined,
                    transformOrigin: tf ? '50% 50%' : undefined,
                    opacity: w.hidden && editing ? 0.35 : undefined,
                    display: w.hidden && !editing ? 'none' : undefined,
                    touchAction: editing ? 'none' : 'auto',
                    cursor: editing ? (canvasView.spaceDown ? 'grab' : w.locked ? 'default' : 'move') : 'default',
                    outline: selected ? `2px solid ${isRef ? '#f59e0b' : '#2563eb'}` : editing ? '1px dashed rgba(37,99,235,.35)' : 'none',
                    outlineOffset: '1px'
                  }}
                  onPointerdown={(e: PointerEvent) => onWidgetPointerDown(e, w)}
                >
                  {/* 字体（hasText 组件的 props.fontFamily）：加在这一层，style.scss 的 [data-scada-font] * 让内部全部文字继承 */}
                  <div
                    class={'w-full h-full'}
                    style={{ pointerEvents: editing ? 'none' : 'auto', fontFamily: fontFamilyCss(w.props[FONT_FAMILY_KEY]) || undefined }}
                    data-scada-font={w.props[FONT_FAMILY_KEY] ? String(w.props[FONT_FAMILY_KEY]) : undefined}
                  >
                    <WidgetHost widget={w} editing={editing} />
                  </div>
                </div>
              )
            })}
            {renderOverlay(s)}
          </div>
          {editing && (canvasView.zoom !== 1 || canvasView.panX !== 0 || canvasView.panY !== 0) && (
            <div
              class={'absolute right-2 bottom-2 px-2 py-1 rounded bg-black/60 text-white text-xs cursor-pointer'}
              style={{ touchAction: 'auto' }}
              onPointerdown={(e: PointerEvent) => e.stopPropagation()}
              onClick={() => resetCanvasView()}
              title={tt('scada.resetView')}
            >
              {Math.round(canvasView.zoom * 100)}% · {tt('scada.resetView')}
            </div>
          )}
          {!editing && l.widgets.length === 0 && (
            <div class={'absolute inset-0 flex flex-col items-center justify-center text-gray-500 pointer-events-none'}>
              <div class={'text-xl'}>{tt('scada.emptyHint')}</div>
              <div class={'text-sm mt-2 opacity-80'}>{tt('scada.emptyHintEdit')}</div>
            </div>
          )}
        </div>
      )
    }
  }
})
