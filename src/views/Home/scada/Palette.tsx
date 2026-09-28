/**
 * 组件库：点按 = 自动放到空位；按住拖到画布上松手 = 放在松手位置（Pointer Events，触摸屏可用）
 */
import { defineComponent, reactive, Teleport } from 'vue'
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
  setup() {
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

    return () => (
      <div class={'h-full flex flex-col bg-white'}>
        <div class={'px-3 py-2 text-sm font-bold border-0 border-b border-solid border-gray-200 shrink-0'}>{tt('scada.palette')}</div>
        <div class={'flex-1 overflow-y-auto p-2 flex flex-col gap-2'}>
          {widgetDefinitions().map(def => (
            <div
              key={def.type}
              class={'rounded-md border border-solid border-gray-300 bg-gray-50 hover:bg-blue-50 hover:border-blue-400 active:bg-blue-100 px-3 py-2 cursor-grab select-none'}
              style={{ touchAction: 'none' }}
              onPointerdown={(e: PointerEvent) => onDown(e, def)}
              onPointermove={onMove}
              onPointerup={onUp}
              onPointercancel={onCancel}
            >
              <div class={'text-base font-bold'}>{def.label()}</div>
              {def.description && <div class={'text-xs text-gray-500 mt-0.5 leading-4'}>{def.description()}</div>}
            </div>
          ))}
        </div>
        <div class={'px-3 py-2 text-xs text-gray-500 border-0 border-t border-solid border-gray-200 shrink-0'}>{tt('scada.paletteHint')}</div>
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
      </div>
    )
  }
})
