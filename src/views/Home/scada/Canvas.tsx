/**
 * 组态画布：逻辑尺寸 canvas.width × canvas.height，按容器等比缩放（横竖屏 / 编辑时侧栏占位都能完整显示）。
 * 编辑模式下：
 *  - Pointer Events 拖动 / 右下角缩放组件（鼠标、触摸通用），按网格吸附；
 *  - 滚轮（或双指捏合）以指针位置为中心缩放视图，键盘 + / - / 0 同样可用；
 *  - 长按空白处（LONG_PRESS_MS）后拖动、或按住鼠标中键拖动，平移视图；
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
/** 长按多久进入平移（ms） */
export const LONG_PRESS_MS = 400
/** 长按期间允许的抖动（px），超过则视为普通拖动、不进入平移 */
const LONG_PRESS_SLOP = 8
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
  /** 正在长按拖动平移 */
  panning: false
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

/** 空白处按下后的状态：先计时，长按成立后变成平移 */
interface PressState {
  pointerId: number
  startX: number
  startY: number
  timer: ReturnType<typeof setTimeout> | null
  panning: boolean
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
      if (press && press.timer) clearTimeout(press.timer)
      press = null
      canvasView.panning = false
    }
    const beginPan = () => {
      if (!press) return
      const cur = pointers.get(press.pointerId)
      if (cur) {
        press.startX = cur.x
        press.startY = cur.y
      }
      press.panning = true
      press.panX0 = canvasView.panX
      press.panY0 = canvasView.panY
      canvasView.panning = true
      try {
        if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(15)
      } catch {
        /* ignore */
      }
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
    /** 空白处（画布或画布外的灰色区域）按下：单指开始长按计时 / 中键立即平移 / 第二指进入捏合缩放 */
    const onContainerPointerDown = (e: PointerEvent) => {
      if (!scada.editing || drag) return
      if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 1) return
      // 中键要阻止浏览器的自动滚动；左键 / 触摸不 preventDefault，这样点空白处仍会让属性面板里的输入框失焦
      if (e.button === 1) e.preventDefault()
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      capturePointer(containerRef.value, e.pointerId)
      if (pointers.size >= 2) {
        clearPress()
        const entries = Array.from(pointers.entries())
        const [ida, pa] = entries[entries.length - 2]
        const [idb, pb] = entries[entries.length - 1]
        pinch = { a: ida, b: idb, dist: distance(pa, pb), midX: (pa.x + pb.x) / 2, midY: (pa.y + pb.y) / 2 }
        return
      }
      press = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, timer: null, panning: false, panX0: 0, panY0: 0 }
      if (e.pointerType === 'mouse' && e.button === 1) {
        beginPan()
        return
      }
      const id = e.pointerId
      press.timer = setTimeout(() => {
        if (press && press.pointerId === id && !press.panning) beginPan()
      }, LONG_PRESS_MS)
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
      if (press.panning) {
        canvasView.panX = press.panX0 + (e.clientX - press.startX)
        canvasView.panY = press.panY0 + (e.clientY - press.startY)
        clampPan()
      } else if (Math.abs(e.clientX - press.startX) > LONG_PRESS_SLOP || Math.abs(e.clientY - press.startY) > LONG_PRESS_SLOP) {
        // 长按成立前就移动了：当作普通拖动，不平移
        clearPress()
      }
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
      // 滚轮需要 preventDefault，必须以非 passive 方式注册
      containerRef.value?.addEventListener('wheel', onWheel, { passive: false })
      zoomHandler = zoomAt
    })
    onBeforeUnmount(() => {
      if (ro) ro.disconnect()
      window.removeEventListener('resize', measure)
      window.removeEventListener('keydown', onKeyDown)
      containerRef.value?.removeEventListener('wheel', onWheel)
      if (zoomHandler === zoomAt) zoomHandler = null
      resetGestures()
      resetCanvasView()
      if (canvasView.el === canvasRef.value) canvasView.el = null
    })
    watch(canvasRef, el => {
      canvasView.el = el || null
    })

    const onKeyDown = (e: KeyboardEvent) => {
      if (!scada.editing) return
      const target = e.target as HTMLElement | null
      const tag = target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return
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
      }
    }

    // ---------------------------------------------------------------- 组件拖动 / 缩放
    const onWidgetPointerDown = (e: PointerEvent, w: WidgetInstance, mode: DragState['mode']) => {
      if (!scada.editing) return
      if (e.pointerType === 'mouse' && e.button !== 0) return
      if (press || pinch) return
      e.stopPropagation()
      e.preventDefault()
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
      if (scada.editing) scada.select(null)
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
          class={'relative w-full h-full overflow-hidden select-none'}
          style={{
            background: editing ? '#d9dde3' : 'transparent',
            touchAction: editing ? 'none' : 'auto',
            cursor: canvasView.panning ? 'grabbing' : 'default'
          }}
          onPointerdown={onContainerPointerDown}
          onPointermove={onContainerPointerMove}
          onPointerup={onContainerPointerUp}
          onPointercancel={onContainerPointerUp}
          onLostpointercapture={onContainerPointerUp}
          onContextmenu={(e: MouseEvent) => {
            if (editing) e.preventDefault()
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
                  style={{
                    left: w.x + 'px', top: w.y + 'px', width: w.w + 'px', height: w.h + 'px',
                    touchAction: editing ? 'none' : 'auto',
                    cursor: editing ? 'move' : 'default',
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
                        cursor: 'nwse-resize', touchAction: 'none'
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
