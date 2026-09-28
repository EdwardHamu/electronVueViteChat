/**
 * 组件库：点按 = 自动放到空位；按住拖到画布上松手 = 放在松手位置（Pointer Events，触摸屏可用）
 * direction = vertical（横屏：左侧竖排）/ horizontal（竖屏：画布上方横向一条，可横向滚动）
 */
import { defineComponent, reactive, Teleport, type PropType } from 'vue'
import { clientToCanvas } from './Canvas'
import { widgetDefinitions } from './registry'
import { useScadaStore } from './store'
import type { WidgetDefinition } from './types'
import { tt } from './widgets/common'

interface PaletteDrag {
  type: string
  pointerId: number
  startX: number
  startY: number
  moved: boolean
}

export default defineComponent({
  name: 'ScadaPalette',
  props: {
    direction: { type: String as PropType<'vertical' | 'horizontal'>, default: 'vertical' }
  },
  setup(props) {
    const scada = useScadaStore()
    const ghost = reactive({ show: false, x: 0, y: 0, label: '' })
    let drag: PaletteDrag | null = null

    const onDown = (e: PointerEvent, def: WidgetDefinition) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      e.preventDefault()
      drag = { type: def.type, pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, moved: false }
      ghost.label = def.label()
      ghost.x = e.clientX
      ghost.y = e.clientY
      const target = e.currentTarget as HTMLElement | null
      if (target && target.setPointerCapture) {
        try {
          target.setPointerCapture(e.pointerId)
        } catch {
          /* ignore */
        }
      }
    }
    const onMove = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.pointerId) return
      if (!drag.moved && Math.abs(e.clientX - drag.startX) + Math.abs(e.clientY - drag.startY) > 6) {
        drag.moved = true
        ghost.show = true
      }
      ghost.x = e.clientX
      ghost.y = e.clientY
    }
    const onUp = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.pointerId) return
      const d = drag
      drag = null
      ghost.show = false
      if (d.moved) {
        const pos = clientToCanvas(e.clientX, e.clientY)
        if (pos) scada.addWidget(d.type, pos)
      } else {
        scada.addWidget(d.type)
      }
    }
    const onCancel = (e: PointerEvent) => {
      if (drag && e.pointerId === drag.pointerId) {
        drag = null
        ghost.show = false
      }
    }

    /** 横向条带里鼠标滚轮直接横向滚动 */
    const onStripWheel = (e: WheelEvent) => {
      const el = e.currentTarget as HTMLElement | null
      if (!el || el.scrollWidth <= el.clientWidth) return
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        el.scrollLeft += e.deltaY
        e.preventDefault()
      }
    }

    const renderItem = (def: WidgetDefinition, horizontal: boolean) => (
      <div
        key={def.type}
        class={[
          'rounded-md border border-solid border-gray-300 bg-gray-50 hover:bg-blue-50 hover:border-blue-400 active:bg-blue-100 px-3 py-2 cursor-grab select-none',
          horizontal ? 'w-[150px] shrink-0 overflow-hidden' : ''
        ]}
        // 横向条带允许浏览器接管横向滑动（滚动条带），向下拖到画布仍由我们处理；竖排时全部由我们处理
        style={{ touchAction: horizontal ? 'pan-x' : 'none' }}
        title={def.description ? def.description() : def.label()}
        onPointerdown={(e: PointerEvent) => onDown(e, def)}
        onPointermove={onMove}
        onPointerup={onUp}
        onPointercancel={onCancel}
      >
        <div class={'text-base font-bold truncate'}>{def.label()}</div>
        {def.description && <div class={['text-xs text-gray-500 mt-0.5 leading-4', horizontal ? 'truncate' : '']}>{def.description()}</div>}
      </div>
    )

    const renderGhost = () => (
      <Teleport to="body">
        {ghost.show && (
          <div
            class={'fixed z-[9999] pointer-events-none px-3 py-2 rounded-md bg-blue-600 text-white text-sm shadow-lg opacity-90'}
            style={{ left: ghost.x + 'px', top: ghost.y + 'px', transform: 'translate(-50%, -50%)' }}
          >
            {ghost.label}
          </div>
        )}
      </Teleport>
    )

    return () => {
      if (props.direction === 'horizontal') {
        return (
          <div class={'h-full w-full flex items-stretch bg-white'}>
            <div class={'w-[72px] shrink-0 px-2 flex flex-col justify-center border-0 border-r border-solid border-gray-200'}>
              <div class={'text-sm font-bold'}>{tt('scada.palette')}</div>
              <div class={'text-[10px] text-gray-500 leading-3 mt-1'} title={tt('scada.paletteHintPortrait')}>{tt('scada.paletteHintShort')}</div>
            </div>
            <div class={'flex-1 min-w-0 overflow-x-auto overflow-y-hidden p-2 flex flex-row items-stretch gap-2'} onWheel={onStripWheel}>
              {widgetDefinitions().map(def => renderItem(def, true))}
            </div>
            {renderGhost()}
          </div>
        )
      }
      return (
        <div class={'h-full flex flex-col bg-white'}>
          <div class={'px-3 py-2 text-sm font-bold border-0 border-b border-solid border-gray-200 shrink-0'}>{tt('scada.palette')}</div>
          <div class={'flex-1 overflow-y-auto p-2 flex flex-col gap-2'}>{widgetDefinitions().map(def => renderItem(def, false))}</div>
          <div class={'px-3 py-2 text-xs text-gray-500 border-0 border-t border-solid border-gray-200 shrink-0'}>{tt('scada.paletteHint')}</div>
          {renderGhost()}
        </div>
      )
    }
  }
})

