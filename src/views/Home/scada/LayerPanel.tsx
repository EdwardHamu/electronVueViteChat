/**
 * 图层栏（编辑模式左侧）：控制每个组件的上下层关系。
 *  - 列表从上到下 = 画布上层到下层（数组顺序的倒序）；每行：拖动手柄 ⋮⋮ / 组件图标 / 名称 / （多选时）参考对象旗标 / 显示隐藏（眼睛）/ 锁定（挂锁）；
 *  - 点击行选中（和画布选中双向同步），Ctrl / ⌘ 点击加减多选，Shift 点击选中一段（点击的行是起点，也是参考对象）；
 *    只选这一个组件——组合里的单个成员要单独选中、改属性就从这里点；
 *  - 调整上下层：拖行首的 ⋮⋮ 手柄（Pointer Events，触摸屏可用；选中多个时整批一起拖，松手时放到指示线处），
 *    或用标题栏的 置顶 / 上移 / 下移 / 置底 按钮（作用于所有选中的组件）；
 *  - 同一个组合的行左边有同色竖条；锁定的组件右侧挂锁高亮；隐藏的组件在展示模式不显示（编辑模式半透明）。
 * 滚动条用 NScrollbar 的悬浮样式（不占内容宽度）。
 */
import { NScrollbar } from 'naive-ui'
import { computed, defineComponent, nextTick, reactive, ref, watch } from 'vue'
import { getWidgetDefinition, widgetName } from './registry'
import { useScadaStore } from './store'
import { toolIcons } from './toolIcons'
import type { WidgetInstance } from './types'
import { tt } from './widgets/common'

/** 同一组合的行用同一种颜色标记（按 groupId 哈希取色） */
const GROUP_COLORS = ['#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#ef4444']
const groupColor = (gid: string) => {
  let h = 0
  for (let i = 0; i < gid.length; i++) h = (h * 31 + gid.charCodeAt(i)) >>> 0
  return GROUP_COLORS[h % GROUP_COLORS.length]
}

interface LayerDrag {
  pointerId: number
  ids: string[]
  startY: number
  moved: boolean
}

const prevent = (e: MouseEvent) => e.preventDefault()

export default defineComponent({
  name: 'ScadaLayerPanel',
  setup() {
    const scada = useScadaStore()
    const rootRef = ref<HTMLElement>()
    /** 从上到下 = 画布上层到下层 */
    const rows = computed(() => scada.current.widgets.slice().reverse())
    const selected = computed(() => new Set(scada.selectedIds))
    const multi = computed(() => scada.selectedIds.length > 1)
    const hasSel = computed(() => scada.selectedIds.length > 0)
    /** Shift 点击选一段的起点 */
    let anchor: string | null = null
    /** 拖动排序：插入指示线的位置（目标行 + 上 / 下） */
    const dropAt = reactive({ id: '', placement: 'above' as 'above' | 'below' })
    let drag: LayerDrag | null = null
    const dragging = ref(false)

    const rowEl = (id: string) => rootRef.value?.querySelector(`[data-layer-id="${id}"]`) as HTMLElement | null
    // 画布上选中 / 取消选中时，把参考对象（第一个选中）滚动到可见
    watch(
      () => scada.selectedIds.join(','),
      () => {
        nextTick(() => {
          const id = scada.selectedIds[0]
          const el = id ? rowEl(id) : null
          if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'nearest' })
        })
      }
    )

    const onRowClick = (e: MouseEvent, w: WidgetInstance) => {
      if (e.ctrlKey || e.metaKey) {
        scada.toggleSelect(w.id)
        anchor = w.id
        return
      }
      if (e.shiftKey && anchor) {
        const order = rows.value.map(r => r.id)
        const a = order.indexOf(anchor)
        const b = order.indexOf(w.id)
        if (a >= 0 && b >= 0) {
          const span = order.slice(Math.min(a, b), Math.max(a, b) + 1)
          scada.setSelection([anchor, ...span.filter(id => id !== anchor)])
          return
        }
      }
      scada.select(w.id)
      anchor = w.id
    }

    // ---------------------------------------------------------------- 拖动排序
    const listContainer = () => rootRef.value?.querySelector('.n-scrollbar-container') as HTMLElement | null
    /** 指针所在的行 + 在行的上半还是下半；指针在第一行之上 / 最后一行之下时取首 / 末行 */
    const hitRow = (clientY: number) => {
      const els = Array.from(rootRef.value?.querySelectorAll('[data-layer-id]') || []) as HTMLElement[]
      if (!els.length) return null
      for (const el of els) {
        const r = el.getBoundingClientRect()
        if (clientY >= r.top && clientY <= r.bottom) return { id: el.dataset.layerId || '', placement: (clientY < (r.top + r.bottom) / 2 ? 'above' : 'below') as 'above' | 'below' }
      }
      const first = els[0].getBoundingClientRect()
      if (clientY < first.top) return { id: els[0].dataset.layerId || '', placement: 'above' as const }
      return { id: els[els.length - 1].dataset.layerId || '', placement: 'below' as const }
    }
    const onGripDown = (e: PointerEvent, w: WidgetInstance) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      e.preventDefault()
      e.stopPropagation()
      // 拖的行不在选中里 → 先单选它；在选中里 → 整批一起拖
      if (!scada.selectedIds.includes(w.id)) scada.select(w.id)
      drag = { pointerId: e.pointerId, ids: scada.selectedIds.slice(), startY: e.clientY, moved: false }
      const el = e.currentTarget as HTMLElement | null
      if (el && el.setPointerCapture) {
        try {
          el.setPointerCapture(e.pointerId)
        } catch {
          /* 某些环境不支持，忽略 */
        }
      }
    }
    const onGripMove = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.pointerId) return
      if (!drag.moved) {
        if (Math.abs(e.clientY - drag.startY) < 4) return
        drag.moved = true
        dragging.value = true
      }
      const hit = hitRow(e.clientY)
      if (hit) {
        dropAt.id = hit.id
        dropAt.placement = hit.placement
      }
      // 靠近列表上 / 下边缘时自动滚动
      const c = listContainer()
      if (c) {
        const r = c.getBoundingClientRect()
        if (e.clientY < r.top + 24) c.scrollTop -= 12
        else if (e.clientY > r.bottom - 24) c.scrollTop += 12
      }
    }
    const endDrag = (commit: boolean) => {
      const d = drag
      const at = { id: dropAt.id, placement: dropAt.placement }
      drag = null
      dragging.value = false
      dropAt.id = ''
      if (commit && d && d.moved && at.id) scada.moveRelative(d.ids, at.id, at.placement)
    }
    const onGripUp = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.pointerId) return
      endDrag(true)
    }
    const onGripCancel = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.pointerId) return
      endDrag(false)
    }

    // ---------------------------------------------------------------- 渲染
    const headBtn = (key: string, title: string, icon: string, run: () => void) => (
      <button
        type="button"
        key={key}
        data-layer-action={key}
        title={title}
        tabindex={-1}
        disabled={!hasSel.value}
        class={['w-6 h-6 shrink-0 p-1 rounded border-0 bg-transparent flex items-center justify-center cursor-pointer outline-none', hasSel.value ? 'text-slate-600 hover:bg-blue-50 active:bg-blue-100' : 'text-slate-600 opacity-40 cursor-not-allowed']}
        onMousedown={prevent}
        onClick={run}
      >
        {toolIcons[icon]()}
      </button>
    )
    const miniBtn = (attr: Record<string, any>, title: string, icon: string, cls: string, run: (e: MouseEvent) => void) => (
      <button
        type="button"
        title={title}
        tabindex={-1}
        class={['w-[18px] h-[18px] shrink-0 p-[1px] rounded border-0 bg-transparent flex items-center justify-center cursor-pointer outline-none', cls]}
        {...attr}
        onMousedown={prevent}
        onPointerdown={(e: PointerEvent) => e.stopPropagation()}
        onClick={(e: MouseEvent) => {
          e.stopPropagation()
          run(e)
        }}
      >
        {toolIcons[icon]()}
      </button>
    )
    const renderRow = (w: WidgetInstance) => {
      const def = getWidgetDefinition(w.type)
      const isSel = selected.value.has(w.id)
      const isRef = isSel && multi.value && scada.referenceId === w.id
      const name = widgetName(w)
      const showDrop = dragging.value && dropAt.id === w.id
      return (
        <div
          key={w.id}
          data-layer-id={w.id}
          data-layer-selected={isSel ? '1' : undefined}
          title={`${def ? def.label() : w.type}${w.title ? ` · ${w.title}` : ''}${w.groupId ? ` · ${tt('scada.layer.grouped')}` : ''}`}
          class={['relative h-[30px] shrink-0 flex items-center gap-1 pr-1 select-none cursor-pointer border-0 border-b border-solid border-gray-100', isSel ? 'bg-blue-100' : 'hover:bg-gray-50', w.hidden ? 'opacity-60' : '']}
          style={{ touchAction: 'pan-y', borderLeft: `3px solid ${w.groupId ? groupColor(w.groupId) : 'transparent'}` }}
          onClick={(e: MouseEvent) => onRowClick(e, w)}
        >
          {showDrop ? <div data-layer-drop={dropAt.placement} class={'absolute left-0 right-0 h-[2px] bg-blue-600 pointer-events-none z-10'} style={dropAt.placement === 'above' ? { top: '-1px' } : { bottom: '-1px' }} /> : null}
          <span
            data-layer-grip
            title={tt('scada.layer.drag')}
            class={'w-4 h-full shrink-0 flex items-center justify-center text-gray-400 cursor-grab'}
            style={{ touchAction: 'none' }}
            onPointerdown={(e: PointerEvent) => onGripDown(e, w)}
            onPointermove={onGripMove}
            onPointerup={onGripUp}
            onPointercancel={onGripCancel}
          >
            <span class={'block w-3 h-3'}>{toolIcons.grip()}</span>
          </span>
          <span class={'w-[18px] h-[18px] shrink-0 flex items-center justify-center text-slate-500'}>{def && def.icon ? def.icon() : <span class={'text-[11px] font-bold'}>{name.slice(0, 1)}</span>}</span>
          <span class={['flex-1 min-w-0 truncate text-xs', isSel ? 'text-blue-800 font-bold' : 'text-gray-700']}>{name}</span>
          {multi.value && isSel
            ? miniBtn({ 'data-layer-ref': w.id }, isRef ? tt('scada.layer.isReference') : tt('scada.layer.setReference'), 'flag', isRef ? 'text-amber-500' : 'text-gray-300 hover:text-amber-500', () => scada.setReference(w.id))
            : null}
          {miniBtn({ 'data-layer-hide': w.id }, w.hidden ? tt('scada.layer.show') : tt('scada.layer.hide'), w.hidden ? 'eyeOff' : 'eye', w.hidden ? 'text-red-400' : 'text-gray-400 hover:text-gray-700', () => scada.setHidden([w.id], !w.hidden))}
          {miniBtn({ 'data-layer-lock': w.id }, w.locked ? tt('scada.tool.unlock') : tt('scada.tool.lock'), w.locked ? 'lockSmall' : 'unlockSmall', w.locked ? 'text-gray-800' : 'text-gray-300 hover:text-gray-600', () => scada.setLocked([w.id], !w.locked))}
        </div>
      )
    }

    return () => (
      <div ref={rootRef} class={'h-full flex flex-col bg-white'} data-scada-layers>
        <div class={'px-2 h-9 flex items-center gap-0.5 border-0 border-b border-solid border-gray-200 shrink-0'}>
          <span class={'text-sm font-bold flex-1 min-w-0 truncate'}>
            {tt('scada.layer.title')}
            <span class={'ml-1 text-[10px] font-normal text-gray-400'}>{rows.value.length}</span>
          </span>
          {headBtn('front', tt('scada.tool.toFront'), 'toTop', () => scada.bringToFront(scada.selectedIds.slice()))}
          {headBtn('forward', tt('scada.tool.forward'), 'up', () => scada.moveForward(scada.selectedIds.slice()))}
          {headBtn('backward', tt('scada.tool.backward'), 'down', () => scada.moveBackward(scada.selectedIds.slice()))}
          {headBtn('back', tt('scada.tool.toBack'), 'toBottom', () => scada.sendToBack(scada.selectedIds.slice()))}
        </div>
        <NScrollbar class={'flex-1 min-h-0'} trigger="none">
          {rows.value.length ? <div class={'flex flex-col'}>{rows.value.map(renderRow)}</div> : <div class={'px-3 py-4 text-xs text-gray-400 text-center'}>{tt('scada.layer.empty')}</div>}
        </NScrollbar>
        <div class={'shrink-0 px-2 py-1 text-[10px] leading-3 text-gray-400 border-0 border-t border-solid border-gray-100'}>{tt('scada.layer.hint')}</div>
      </div>
    )
  }
})
