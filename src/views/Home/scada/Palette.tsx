/**
 * 组件库（工具箱）：按分类（基础图素 / 控制与显示 / 数据看板）分组，小图标 + 名称的网格排布，可折叠分类、切换网格 / 列表视图。
 *  - 点按 = 自动放到画布空位；按住拖到画布上松手 = 放在松手位置（Pointer Events，触摸屏可用）
 *  - direction = vertical（横屏：左侧竖排，三列网格）/ horizontal（竖屏：画布上方横向一条，可横向滚动）
 *  - 滚动条用 NScrollbar 的悬浮样式，不占内容宽度
 */
import { NScrollbar } from 'naive-ui'
import { computed, defineComponent, reactive, ref, Teleport, type PropType } from 'vue'
import { clientToCanvas } from './Canvas'
import { widgetDefinitions } from './registry'
import { useScadaStore } from './store'
import type { WidgetCategory, WidgetDefinition } from './types'
import { tt } from './widgets/common'

interface PaletteDrag {
  type: string
  pointerId: number
  startX: number
  startY: number
  moved: boolean
}

export const PALETTE_CATEGORIES: WidgetCategory[] = ['shape', 'control', 'data']
const VIEW_KEY = 'scadaPaletteView'

/** 折叠状态 / 视图模式放在模块级：切换横竖屏或重新进入编辑时保持 */
const collapsed = reactive<Record<string, boolean>>({})
const view = ref<'grid' | 'list'>('grid')
try {
  if (typeof localStorage !== 'undefined' && localStorage.getItem(VIEW_KEY) === 'list') view.value = 'list'
} catch {
  /* ignore */
}
const setView = (v: 'grid' | 'list') => {
  view.value = v
  try {
    localStorage.setItem(VIEW_KEY, v)
  } catch {
    /* ignore */
  }
}

/** 按分类分组（未标分类的归入数据看板），组内保持注册顺序 */
export const groupedDefinitions = () => {
  const groups = PALETTE_CATEGORIES.map(c => ({ category: c, items: [] as WidgetDefinition[] }))
  widgetDefinitions().forEach(def => {
    const g = groups.find(x => x.category === (def.category || 'data')) || groups[groups.length - 1]
    g.items.push(def)
  })
  return groups.filter(g => g.items.length)
}

const GridIcon = () => (
  <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><rect x="1" y="1" width="6" height="6" /><rect x="9" y="1" width="6" height="6" /><rect x="1" y="9" width="6" height="6" /><rect x="9" y="9" width="6" height="6" /></svg>
)
const ListIcon = () => (
  <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><rect x="1" y="2" width="14" height="2.4" /><rect x="1" y="6.8" width="14" height="2.4" /><rect x="1" y="11.6" width="14" height="2.4" /></svg>
)

export default defineComponent({
  name: 'ScadaPalette',
  props: {
    direction: { type: String as PropType<'vertical' | 'horizontal'>, default: 'vertical' }
  },
  setup(props) {
    const scada = useScadaStore()
    const ghost = reactive({ show: false, x: 0, y: 0, label: '' })
    let drag: PaletteDrag | null = null
    const groups = computed(() => groupedDefinitions())
    /** 画布上当前选中组件的类型：组件库里对应项高亮（对照参考 UI 的"当前工具"高亮） */
    const activeType = computed(() => scada.selected?.type || '')

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

    /** 横向条带里鼠标滚轮直接横向滚动（滚动的是 NScrollbar 的内部容器） */
    const onStripWheel = (e: WheelEvent) => {
      const wrap = e.currentTarget as HTMLElement | null
      const el = wrap ? (wrap.querySelector('.n-scrollbar-container') as HTMLElement | null) : null
      if (!el || el.scrollWidth <= el.clientWidth) return
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        el.scrollLeft += e.deltaY
        e.preventDefault()
      }
    }

    const renderIcon = (def: WidgetDefinition, size: number) => (
      <div class={'shrink-0 flex items-center justify-center'} style={{ width: size + 'px', height: size + 'px' }}>
        {def.icon ? def.icon() : <span class={'font-bold'} style={{ fontSize: size * 0.6 + 'px' }}>{def.label().slice(0, 1)}</span>}
      </div>
    )

    const itemHandlers = (def: WidgetDefinition, touchAction: string) => ({
      title: def.description ? `${def.label()}：${def.description()}` : def.label(),
      style: { touchAction },
      onPointerdown: (e: PointerEvent) => onDown(e, def),
      onPointermove: onMove,
      onPointerup: onUp,
      onPointercancel: onCancel
    })
    const itemClass = (def: WidgetDefinition) => [
      'rounded cursor-grab select-none border border-solid transition-colors',
      activeType.value === def.type ? 'bg-blue-100 border-blue-300 text-blue-700' : 'border-transparent text-slate-600 hover:bg-blue-50 hover:border-blue-200 active:bg-blue-100'
    ]

    /** 横屏网格项：图标在上、名称在下 */
    const renderGridItem = (def: WidgetDefinition) => (
      <div key={def.type} class={[...itemClass(def), 'flex flex-col items-center justify-center gap-0.5 py-1.5 px-0.5 min-w-0']} data-palette-item={def.type} {...itemHandlers(def, 'pan-y')}>
        {renderIcon(def, 26)}
        <div class={'text-[11px] leading-[14px] w-full text-center truncate'}>{def.label()}</div>
      </div>
    )
    /** 横屏列表项：图标在左、名称 + 说明在右 */
    const renderListItem = (def: WidgetDefinition) => (
      <div key={def.type} class={[...itemClass(def), 'flex items-center gap-2 px-2 py-1 min-w-0']} data-palette-item={def.type} {...itemHandlers(def, 'pan-y')}>
        {renderIcon(def, 20)}
        <div class={'min-w-0 flex-1'}>
          <div class={'text-xs font-bold truncate'}>{def.label()}</div>
          {def.description && <div class={'text-[10px] text-gray-400 truncate leading-3'}>{def.description()}</div>}
        </div>
      </div>
    )
    /** 竖屏条带项：小图标 + 名称，固定宽度 */
    const renderStripItem = (def: WidgetDefinition) => (
      <div key={def.type} class={[...itemClass(def), 'w-[58px] shrink-0 flex flex-col items-center justify-center gap-0.5 py-1']} data-palette-item={def.type} {...itemHandlers(def, 'pan-x')}>
        {renderIcon(def, 24)}
        <div class={'text-[10px] leading-3 w-full text-center truncate'}>{def.label()}</div>
      </div>
    )

    // 注意：Teleport 的唯一子节点不能是布尔值（`{show && <div/>}` 为 false 时 h() 会把它渲染成文字 "false"），要用三元返回 null
    const renderGhost = () => (
      <Teleport to="body">
        {ghost.show ? (
          <div
            class={'fixed z-[9999] pointer-events-none px-3 py-2 rounded-md bg-blue-600 text-white text-sm shadow-lg opacity-90'}
            style={{ left: ghost.x + 'px', top: ghost.y + 'px', transform: 'translate(-50%, -50%)' }}
          >
            {ghost.label}
          </div>
        ) : null}
      </Teleport>
    )

    return () => {
      if (props.direction === 'horizontal') {
        return (
          <div class={'h-full w-full flex items-stretch bg-white'}>
            <div class={'w-[56px] shrink-0 px-1.5 flex flex-col justify-center border-0 border-r border-solid border-gray-200'}>
              <div class={'text-sm font-bold'}>{tt('scada.palette')}</div>
              <div class={'text-[10px] text-gray-500 leading-3 mt-1'} title={tt('scada.paletteHintPortrait')}>{tt('scada.paletteHintShort')}</div>
            </div>
            <div class={'flex-1 min-w-0'} onWheel={onStripWheel}>
              <NScrollbar xScrollable trigger="none">
                <div class={'h-full flex flex-row items-stretch gap-1 px-1.5 py-1'} style={{ width: 'max-content' }}>
                  {groups.value.map(g => (
                    <div key={g.category} class={'flex flex-row items-stretch gap-1'} data-palette-group={g.category}>
                      <div class={'shrink-0 w-4 rounded bg-gray-100 text-gray-500 text-[10px] flex items-center justify-center'} style={{ writingMode: 'vertical-rl', letterSpacing: '1px' }}>
                        {tt('scada.category.' + g.category)}
                      </div>
                      {g.items.map(renderStripItem)}
                    </div>
                  ))}
                </div>
              </NScrollbar>
            </div>
            {renderGhost()}
          </div>
        )
      }
      return (
        <div class={'h-full flex flex-col bg-white'}>
          <div class={'px-2 h-9 flex items-center gap-1 border-0 border-b border-solid border-gray-200 shrink-0'}>
            <span class={'text-sm font-bold flex-1 truncate'}>{tt('scada.palette')}</span>
            <button type="button" class={['w-6 h-6 rounded flex items-center justify-center border-0 cursor-pointer', view.value === 'list' ? 'bg-blue-100 text-blue-700' : 'bg-transparent text-gray-500 hover:bg-gray-100']} title={tt('scada.paletteList')} data-palette-view="list" onClick={() => setView('list')}>
              <ListIcon />
            </button>
            <button type="button" class={['w-6 h-6 rounded flex items-center justify-center border-0 cursor-pointer', view.value === 'grid' ? 'bg-blue-100 text-blue-700' : 'bg-transparent text-gray-500 hover:bg-gray-100']} title={tt('scada.paletteGrid')} data-palette-view="grid" onClick={() => setView('grid')}>
              <GridIcon />
            </button>
          </div>
          <NScrollbar class={'flex-1 min-h-0'} trigger="none">
            {groups.value.map(g => {
              const isCollapsed = !!collapsed[g.category]
              return (
                <div key={g.category} data-palette-group={g.category}>
                  <div
                    class={'h-7 px-2 flex items-center gap-1 text-xs font-bold text-gray-700 bg-gray-100 cursor-pointer select-none border-0 border-y border-solid border-gray-200'}
                    data-palette-category={g.category}
                    onClick={() => (collapsed[g.category] = !isCollapsed)}
                  >
                    <span class={'inline-block text-[9px] transition-transform'} style={{ transform: isCollapsed ? 'rotate(-90deg)' : 'none' }}>▼</span>
                    <span class={'flex-1 truncate'}>{tt('scada.category.' + g.category)}</span>
                    <span class={'text-[10px] font-normal text-gray-400'}>{g.items.length}</span>
                  </div>
                  {!isCollapsed && (view.value === 'grid' ? <div class={'grid grid-cols-3 gap-0.5 p-1.5'}>{g.items.map(renderGridItem)}</div> : <div class={'flex flex-col gap-0.5 p-1.5'}>{g.items.map(renderListItem)}</div>)}
                </div>
              )
            })}
          </NScrollbar>
          {renderGhost()}
        </div>
      )
    }
  }
})
