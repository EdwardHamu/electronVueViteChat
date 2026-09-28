/**
 * 组态画布：逻辑尺寸 canvas.width × canvas.height，按容器等比缩放（横竖屏 / 编辑时侧栏占位都能完整显示）。
 * 编辑模式下用 Pointer Events 实现拖动 / 右下角缩放（鼠标、触摸通用），按网格吸附。
 */
import { computed, defineComponent, onBeforeUnmount, onMounted, reactive, ref, watch, watchEffect, type PropType } from 'vue'
import { useDataPoint } from './dataSource'
import { fitScale, snap } from './geometry'
import { getWidgetDefinition } from './registry'
import { useScadaStore } from './store'
import type { WidgetInstance, WidgetRect } from './types'
import { tt } from './widgets/common'

/** 供组件库拖放时把屏幕坐标换算成画布坐标 */
export const canvasView = reactive({
  el: null as HTMLElement | null,
  scale: 1
})

export const clientToCanvas = (clientX: number, clientY: number) => {
  const el = canvasView.el
  if (!el) return null
  const r = el.getBoundingClientRect()
  if (clientX < r.left || clientX > r.right || clientY < r.top || clientY > r.bottom) return null
  const s = canvasView.scale || 1
  return { x: (clientX - r.left) / s, y: (clientY - r.top) / s }
}

/** 单个组件宿主：解析绑定、维护历史值、渲染注册表里的组件 */
const WidgetHost = defineComponent({
  name: 'ScadaWidgetHost',
  props: {
    widget: { type: Object as PropType<WidgetInstance>, required: true },
    editing: { type: Boolean, default: false }
  },
  setup(props) {
    const def = computed(() => getWidgetDefinition(props.widget.type))
    const point = useDataPoint(() => (def.value?.needsBinding === false ? null : props.widget.binding))
    const history = ref<number[]>([])

    watch(
      () => (point.value ? `${point.value.time || 0}|${point.value.value}` : ''),
      () => {
        const keep = def.value?.keepHistory || 0
        if (!keep) return
        const v = point.value?.value
        if (v === null || v === undefined || !Number.isFinite(v)) return
        history.value.push(v)
        const max = Math.max(2, Math.min(keep, Number(props.widget.props.points) || keep))
        if (history.value.length > max) history.value.splice(0, history.value.length - max)
      }
    )
    watch(() => `${props.widget.binding?.source || ''}|${props.widget.binding?.key || ''}`, () => {
      history.value = []
    })

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
      return <Comp widget={props.widget} point={point.value} editing={props.editing} history={history.value} />
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

export default defineComponent({
  name: 'ScadaCanvas',
  setup() {
    const scada = useScadaStore()
    const containerRef = ref<HTMLElement>()
    const canvasRef = ref<HTMLElement>()
    const size = reactive({ w: 0, h: 0 })
    let ro: ResizeObserver | null = null
    let drag: DragState | null = null

    const layout = computed(() => scada.current)
    const scale = computed(() => fitScale(size.w, size.h, layout.value.canvas.width, layout.value.canvas.height))
    const offset = computed(() => ({
      x: Math.max(0, (size.w - layout.value.canvas.width * scale.value) / 2),
      y: Math.max(0, (size.h - layout.value.canvas.height * scale.value) / 2)
    }))

    const measure = () => {
      const el = containerRef.value
      if (!el) return
      size.w = el.clientWidth
      size.h = el.clientHeight
    }

    watchEffect(() => {
      canvasView.scale = scale.value
    })

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
    })
    onBeforeUnmount(() => {
      if (ro) ro.disconnect()
      window.removeEventListener('resize', measure)
      window.removeEventListener('keydown', onKeyDown)
      if (canvasView.el === canvasRef.value) canvasView.el = null
    })
    watch(canvasRef, el => {
      canvasView.el = el || null
    })

    const onKeyDown = (e: KeyboardEvent) => {
      if (!scada.editing || !scada.selectedId) return
      const target = e.target as HTMLElement | null
      const tag = target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return
      if (e.key === 'Delete' || e.key === 'Backspace') {
        scada.removeWidget(scada.selectedId)
        e.preventDefault()
      }
    }

    const onWidgetPointerDown = (e: PointerEvent, w: WidgetInstance, mode: DragState['mode']) => {
      if (!scada.editing) return
      if (e.pointerType === 'mouse' && e.button !== 0) return
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
        <div ref={containerRef} class={'relative w-full h-full overflow-hidden select-none'} style={{ background: editing ? '#d9dde3' : 'transparent' }}>
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
