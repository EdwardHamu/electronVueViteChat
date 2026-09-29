/**
 * 组态画布：逻辑尺寸 canvas.width × canvas.height，按容器等比缩放（横竖屏 / 编辑时侧栏占位都能完整显示）。
 * 编辑模式下：
 *  - Pointer Events 拖动 / 右下角缩放组件（鼠标、触摸通用），按网格吸附；
 *  - 滚轮（或双指捏合）以指针位置为中心缩放视图，键盘 + / - / 0 同样可用；
 *  - 按住空格键拖动鼠标（画布任意位置，包括组件上方）、或按住鼠标中键拖动，平移视图；触摸屏双指同时可缩放 / 平移；
 *  - 选中组件后方向键微调位置（1px；Shift + 方向键按网格步进），Delete 删除；
 *  - 退出编辑（保存 / 取消）视图自动复位为"适配容器"。
 * 每个组件由 WidgetHost 承载：解析数据绑定 → 经过组件的数据处理函数（transform.ts）→ 维护历史值 → 渲染注册表里的组件。
 */
import { computed, defineComponent, onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch, watchEffect, type PropType } from 'vue'
import { useDataPoint } from './dataSource'
import { fitScale, snap } from './geometry'
import { getWidgetDefinition } from './registry'
import { useScadaStore } from './store'
import { clearTransformReport, compileTransform, reportTransform, runTransform, type TransformContext } from './transform'
import type { DataPoint, WidgetInstance, WidgetRect } from './types'
import { tt } from './widgets/common'

export const ZOOM_MIN = 0.25
export const ZOOM_MAX = 6
/** 平移时画布至少保留在视口内的像素 */
const PAN_MARGIN = 60

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
    watch(
      () => compiled.value.source,
      () => {
        Object.keys(state).forEach(k => delete state[k])
        prev = undefined
      }
    )
    /** 交给组件渲染的数据点：原始数据点经过处理函数（若有） */
    const processed = computed(() => {
      const c = compiled.value
      const input = raw.value
      if (!c.fn && !c.error) return { point: input, error: null as string | null }
      const ctx: TransformContext = { widget: props.widget, history: historyArr, state, prev, now: Date.now() }
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
  id: string
  mode: 'move' | 'resize'
  pointerId: number
  startX: number
  startY: number
  rect: WidgetRect
}

/** 平移拖动状态（空格 + 左键 / 中键） */
interface PressState {
  pointerId: number
  startX: number
  startY: number
  panX0: number
  panY0: number
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

    const layout = computed(() => scada.current)
    /** 让整个画布刚好放进容器的比例 */
    const fit = computed(() => fitScale(size.w, size.h, layout.value.canvas.width, layout.value.canvas.height))
    /** 实际缩放 = 适配比例 × 用户缩放 */
    const scale = computed(() => fit.value * canvasView.zoom)
    /** 某个缩放下把画布居中所需的偏移（画布比容器大时贴左上角） */
    const centerOffset = (s: number) => ({
      x: Math.max(0, (size.w - layout.value.canvas.width * s) / 2),
      y: Math.max(0, (size.h - layout.value.canvas.height * s) / 2)
    })
    const offset = computed(() => {
      const o = centerOffset(scale.value)
      return { x: o.x + canvasView.panX, y: o.y + canvasView.panY }
    })

    const measure = () => {
      const el = containerRef.value
      if (!el) return
      size.w = el.clientWidth
      size.h = el.clientHeight
    }

    watchEffect(() => {
      canvasView.scale = scale.value
    })

    // ---------------------------------------------------------------- 视图缩放 / 平移
    /** 平移不能把画布整个拖出视口 */
    const clampPan = () => {
      if (!size.w || !size.h) return
      const s = scale.value
      const W = layout.value.canvas.width * s
      const H = layout.value.canvas.height * s
      const o = centerOffset(s)
      const mx = Math.min(PAN_MARGIN, W / 2)
      const my = Math.min(PAN_MARGIN, H / 2)
      const left = Math.min(Math.max(o.x + canvasView.panX, mx - W), size.w - mx)
      const top = Math.min(Math.max(o.y + canvasView.panY, my - H), size.h - my)
      canvasView.panX = left - o.x
      canvasView.panY = top - o.y
    }
    /** 以容器内 (cx, cy) 为不动点缩放；缺省取容器中心 */
    const zoomAt = (factor: number, cx?: number, cy?: number) => {
      if (!scada.editing || !Number.isFinite(factor) || factor <= 0) return
      const z0 = canvasView.zoom
      const z1 = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z0 * factor))
      if (Math.abs(z1 - z0) < 1e-6) return
      const px = cx === undefined ? size.w / 2 : cx
      const py = cy === undefined ? size.h / 2 : cy
      const s0 = fit.value * z0
      const s1 = fit.value * z1
      const left0 = centerOffset(s0).x + canvasView.panX
      const top0 = centerOffset(s0).y + canvasView.panY
      const lx = (px - left0) / s0
      const ly = (py - top0) / s0
      const o1 = centerOffset(s1)
      canvasView.zoom = z1
      canvasView.panX = px - lx * s1 - o1.x
      canvasView.panY = py - ly * s1 - o1.y
      clampPan()
    }
    const onWheel = (e: WheelEvent) => {
      if (!scada.editing) return
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
    }
    const resetGestures = () => {
      pointers.clear()
      pinch = null
      clearPress()
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
    })
    onBeforeUnmount(() => {
      if (ro) ro.disconnect()
      window.removeEventListener('resize', measure)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onWindowBlur)
      containerRef.value?.removeEventListener('wheel', onWheel)
      if (zoomHandler === zoomAt) zoomHandler = null
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
    /** 方向键微调选中组件：1px；Shift 按网格步进（画布越界由 updateWidgetRect 收口） */
    const nudgeSelected = (dx: number, dy: number, byGrid: boolean) => {
      const w = scada.selected
      if (!w) return
      const step = byGrid ? Math.max(1, layout.value.canvas.grid || 10) : 1
      scada.updateWidgetRect(w.id, { x: w.x + dx * step, y: w.y + dy * step, w: w.w, h: w.h })
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (!scada.editing) return
      const target = e.target as HTMLElement | null
      const tag = target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) return
      if (isSpace(e)) {
        if (!focusOnCanvas()) return
        canvasView.spaceDown = true
        e.preventDefault() // 防止页面滚动
        return
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
      if (!scada.selectedId) return
      if (e.key === 'Delete' || e.key === 'Backspace') {
        scada.removeWidget(scada.selectedId)
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
    }

    // ---------------------------------------------------------------- 组件拖动 / 缩放
    const onWidgetPointerDown = (e: PointerEvent, w: WidgetInstance, mode: DragState['mode']) => {
      if (!scada.editing) return
      if (e.pointerType === 'mouse' && e.button !== 0) return
      if (press || pinch) return
      // 按住空格时不拖组件，事件冒泡到容器去平移
      if (canvasView.spaceDown) return
      e.stopPropagation()
      e.preventDefault()
      // preventDefault 后浏览器不会再移动焦点，这里主动让容器拿到焦点：属性面板输入框失焦，方向键 / 空格才会交给画布
      const container = containerRef.value
      if (container && container.focus) container.focus({ preventScroll: true })
      scada.select(w.id)
      drag = { id: w.id, mode, pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, rect: { x: w.x, y: w.y, w: w.w, h: w.h } }
      const target = e.currentTarget as HTMLElement | null
      if (target && target.setPointerCapture) {
        try {
          target.setPointerCapture(e.pointerId)
        } catch {
          /* 某些环境不支持，忽略 */
        }
      }
    }
    const onPointerMove = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.pointerId) return
      const s = scale.value || 1
      const dx = (e.clientX - drag.startX) / s
      const dy = (e.clientY - drag.startY) / s
      const grid = layout.value.canvas.grid
      const rect: WidgetRect =
        drag.mode === 'move'
          ? { ...drag.rect, x: snap(drag.rect.x + dx, grid), y: snap(drag.rect.y + dy, grid) }
          : { ...drag.rect, w: snap(drag.rect.w + dx, grid), h: snap(drag.rect.h + dy, grid) }
      scada.updateWidgetRect(drag.id, rect)
    }
    const onPointerUp = (e: PointerEvent) => {
      if (drag && e.pointerId === drag.pointerId) drag = null
    }
    const onCanvasPointerDown = () => {
      if (scada.editing && !canvasView.spaceDown) scada.select(null)
    }

    return () => {
      const l = layout.value
      const editing = scada.editing
      const s = scale.value
      const gridStyle = editing
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
            onPointerdown={onCanvasPointerDown}
          >
            {l.widgets.map(w => {
              const selected = editing && scada.selectedId === w.id
              return (
                <div
                  key={w.id}
                  class={'absolute'}
                  data-widget-id={w.id}
                  data-widget-type={w.type}
                  style={{
                    left: w.x + 'px', top: w.y + 'px', width: w.w + 'px', height: w.h + 'px',
                    touchAction: editing ? 'none' : 'auto',
                    cursor: editing ? (canvasView.spaceDown ? 'grab' : 'move') : 'default',
                    outline: selected ? '2px solid #2563eb' : editing ? '1px dashed rgba(37,99,235,.35)' : 'none',
                    outlineOffset: '1px'
                  }}
                  onPointerdown={(e: PointerEvent) => onWidgetPointerDown(e, w, 'move')}
                  onPointermove={onPointerMove}
                  onPointerup={onPointerUp}
                  onPointercancel={onPointerUp}
                >
                  <div class={'w-full h-full'} style={{ pointerEvents: editing ? 'none' : 'auto' }}>
                    <WidgetHost widget={w} editing={editing} />
                  </div>
                  {selected && (
                    <div
                      class={'absolute rounded-sm bg-blue-600 border-2 border-solid border-white shadow'}
                      style={{
                        right: '-9px', bottom: '-9px',
                        width: Math.max(16, 18 / s) + 'px', height: Math.max(16, 18 / s) + 'px',
                        cursor: canvasView.spaceDown ? 'grab' : 'nwse-resize', touchAction: 'none'
                      }}
                      onPointerdown={(e: PointerEvent) => onWidgetPointerDown(e, w, 'resize')}
                    />
                  )}
                </div>
              )
            })}
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
