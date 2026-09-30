/**
 * 排列工具栏（编辑模式顶部的第二行）：对齐 / 分布 / 等宽高 / 旋转 / 翻转 / 组合 / 锁定 / 层次 / 网格，布局与图标顺序参照 HMI 组态软件的对齐工具栏。
 *
 * 「参考对象」= 多选时最先选中的组件（画布上橙色外框，图层栏里有旗标）：对齐 / 等宽高以它为准，它本身不动。
 *  - 对齐组：左 / 右 / 上 / 下边缘，垂直中心轴（中心 x 相同）、水平中心轴（中心 y 相同），「中心点 ▾」= 中心点对齐 + 三个相对整个画面居中的功能；
 *  - 分布 ▾（至少 3 个）：水平 / 垂直，等间距 或 中心等距；等宽 / 等高 / 等宽高（至少 2 个）；
 *  - 旋转 90° / 翻转（按整个选区做，单个组件绕自己的中心）；组合 / 取消组合；锁定 / 解锁；置顶 / 置底 / 上移一层 / 下移一层；网格开关。
 * 不可用的按钮变灰（例如没选够数量、全是锁定组件）。按钮不抢焦点（mousedown 不默认聚焦），点完之后方向键 / Delete 仍然作用于画布。
 */
import { NDropdown, type DropdownOption } from 'naive-ui'
import { computed, defineComponent, ref } from 'vue'
import type { CanvasCenterKind, DistributeMode } from './arrange'
import { widgetName } from './registry'
import { useScadaStore } from './store'
import { toolIcons } from './toolIcons'
import { tt } from './widgets/common'

/** 「中心点 ▾」下拉里的四项（值同时是 i18n 键 / 图标名）：与参考对象中心点对齐 + 三个相对整个画面居中 */
type CenterMode = 'alignCenter' | 'pageCenterX' | 'pageCenterY' | 'pageCenter'

/** 下拉里最近一次选的项（点图标本体 = 再执行一次）：模块级，重新进入编辑后仍记得 */
const centerMode = ref<CenterMode>('alignCenter')
const distHMode = ref<DistributeMode>('gap')
const distVMode = ref<DistributeMode>('gap')

const PAGE_KIND: Record<Exclude<CenterMode, 'alignCenter'>, CanvasCenterKind> = { pageCenterX: 'x', pageCenterY: 'y', pageCenter: 'both' }

const prevent = (e: MouseEvent) => e.preventDefault()

export default defineComponent({
  name: 'ScadaArrangeBar',
  setup() {
    const scada = useScadaStore()

    const sel = computed(() => scada.selectedWidgets)
    const count = computed(() => sel.value.length)
    /** 有参考对象且至少还有一个可动的组件 */
    const canAlign = computed(() => sel.value.length >= 2 && sel.value.slice(1).some(w => !w.locked))
    const canPage = computed(() => sel.value.some(w => !w.locked))
    const canDistribute = computed(() => sel.value.length >= 3 && sel.value.some(w => !w.locked))
    const canTransform = computed(() => sel.value.some(w => !w.locked))
    const canGroup = computed(() => sel.value.length >= 2)
    const canUngroup = computed(() => sel.value.some(w => !!w.groupId))
    const canLock = computed(() => sel.value.some(w => !w.locked))
    const canUnlock = computed(() => sel.value.some(w => !!w.locked))
    const hasSel = computed(() => sel.value.length > 0)

    const centerEnabled = (m: CenterMode) => (m === 'alignCenter' ? canAlign.value : canPage.value)
    const runCenter = (m: CenterMode) => {
      centerMode.value = m
      if (!centerEnabled(m)) return
      if (m === 'alignCenter') scada.alignSelection('center')
      else scada.alignSelectionToCanvas(PAGE_KIND[m])
    }
    const runDistribute = (axis: 'h' | 'v', mode: DistributeMode) => {
      if (axis === 'h') distHMode.value = mode
      else distVMode.value = mode
      if (canDistribute.value) scada.distributeSelection(axis, mode)
    }

    const ids = () => scada.selectedIds.slice()

    // ---------------------------------------------------------------- 渲染
    const BTN = 'w-7 h-7 shrink-0 p-1 rounded border-0 bg-transparent flex items-center justify-center cursor-pointer outline-none transition-colors'
    const btn = (key: string, enabled: boolean, run: () => void, opts?: { icon?: string; active?: boolean; title?: string }) => (
      <button
        type="button"
        key={key}
        data-tool={key}
        title={opts?.title || `${tt('scada.tool.' + key)}：${tt('scada.tool.' + key + 'Desc')}`}
        tabindex={-1}
        disabled={!enabled}
        class={[BTN, opts?.active ? 'bg-blue-100 text-blue-700' : 'text-slate-700 hover:bg-blue-50 active:bg-blue-100', !enabled ? 'opacity-40 cursor-not-allowed hover:bg-transparent' : '']}
        onMousedown={prevent}
        onClick={run}
      >
        {toolIcons[opts?.icon || key]()}
      </button>
    )
    const sep = (k: string) => <span key={k} class={'shrink-0 w-px h-5 mx-1 bg-gray-300'} />
    /** 图标 + 小三角：图标本体执行当前项，三角展开选项（选中即执行并记为当前项） */
    const split = (key: string, icon: string, title: string, enabled: boolean, run: () => void, options: DropdownOption[], anyEnabled: boolean, onSelect: (k: string) => void) => (
      <div key={key} class={'shrink-0 inline-flex items-center'} data-tool-split={key}>
        {btn(key, enabled, run, { icon, title })}
        <NDropdown trigger="click" placement="bottom-start" options={options} disabled={!anyEnabled} onSelect={(k: string | number) => onSelect(String(k))}>
          <button
            type="button"
            data-tool-caret={key}
            tabindex={-1}
            disabled={!anyEnabled}
            title={title}
            class={['w-3.5 h-7 -ml-1 shrink-0 p-0 rounded border-0 bg-transparent text-[9px] leading-none text-slate-500 cursor-pointer outline-none', anyEnabled ? 'hover:bg-blue-50' : 'opacity-40 cursor-not-allowed']}
            onMousedown={prevent}
          >
            ▾
          </button>
        </NDropdown>
      </div>
    )
    const opt = (key: string, icon: string, enabled: boolean): DropdownOption => ({
      key,
      label: tt('scada.tool.' + key),
      disabled: !enabled,
      icon: () => <span class={'inline-block w-[18px] h-[18px] text-slate-600'}>{toolIcons[icon]()}</span>
    })

    return () => {
      const cm = centerMode.value
      const centerOptions: DropdownOption[] = [
        opt('alignCenter', 'alignCenter', canAlign.value),
        { key: 'divider', type: 'divider' },
        opt('pageCenterX', 'pageCenterX', canPage.value),
        opt('pageCenterY', 'pageCenterY', canPage.value),
        opt('pageCenter', 'pageCenter', canPage.value)
      ]
      const distOptions = (axis: 'h' | 'v'): DropdownOption[] => [
        opt(axis === 'h' ? 'distributeHGap' : 'distributeVGap', axis === 'h' ? 'distributeH' : 'distributeV', canDistribute.value),
        opt(axis === 'h' ? 'distributeHCenter' : 'distributeVCenter', axis === 'h' ? 'distributeH' : 'distributeV', canDistribute.value)
      ]
      const n = count.value
      const ref = n > 1 ? sel.value[0] : undefined
      return (
        <div
          class={'h-9 shrink-0 flex items-center gap-0.5 px-2 overflow-x-auto scada-noscrollbar border-0 border-b border-solid border-gray-300 bg-white'}
          style={{ touchAction: 'pan-x' }}
          data-scada-arrange
        >
          {btn('alignLeft', canAlign.value, () => scada.alignSelection('left'))}
          {btn('alignRight', canAlign.value, () => scada.alignSelection('right'))}
          {btn('alignTop', canAlign.value, () => scada.alignSelection('top'))}
          {btn('alignBottom', canAlign.value, () => scada.alignSelection('bottom'))}
          {btn('alignCenterX', canAlign.value, () => scada.alignSelection('centerX'))}
          {btn('alignCenterY', canAlign.value, () => scada.alignSelection('centerY'))}
          {split(
            'centerPoint',
            cm,
            `${tt('scada.tool.' + cm)}：${tt('scada.tool.' + cm + 'Desc')}`,
            centerEnabled(cm),
            () => runCenter(cm),
            centerOptions,
            canAlign.value || canPage.value,
            k => runCenter(k as CenterMode)
          )}
          {sep('s1')}
          {split(
            'distributeH',
            'distributeH',
            `${tt('scada.tool.distributeH' + (distHMode.value === 'gap' ? 'Gap' : 'Center'))}：${tt('scada.tool.distributeDesc')}`,
            canDistribute.value,
            () => runDistribute('h', distHMode.value),
            distOptions('h'),
            canDistribute.value,
            k => runDistribute('h', k === 'distributeHGap' ? 'gap' : 'center')
          )}
          {split(
            'distributeV',
            'distributeV',
            `${tt('scada.tool.distributeV' + (distVMode.value === 'gap' ? 'Gap' : 'Center'))}：${tt('scada.tool.distributeDesc')}`,
            canDistribute.value,
            () => runDistribute('v', distVMode.value),
            distOptions('v'),
            canDistribute.value,
            k => runDistribute('v', k === 'distributeVGap' ? 'gap' : 'center')
          )}
          {btn('sameWidth', canAlign.value, () => scada.sizeSelection('w'))}
          {btn('sameHeight', canAlign.value, () => scada.sizeSelection('h'))}
          {btn('sameSize', canAlign.value, () => scada.sizeSelection('both'))}
          {sep('s2')}
          {btn('rotateCw', canTransform.value, () => scada.rotateSelection(1))}
          {btn('rotateCcw', canTransform.value, () => scada.rotateSelection(-1))}
          {btn('flipH', canTransform.value, () => scada.flipSelection('x'))}
          {btn('flipV', canTransform.value, () => scada.flipSelection('y'))}
          {sep('s3')}
          {btn('group', canGroup.value, () => scada.groupSelection())}
          {btn('ungroup', canUngroup.value, () => scada.ungroupSelection())}
          {sep('s4')}
          {btn('lock', canLock.value, () => scada.setLocked(ids(), true))}
          {btn('unlock', canUnlock.value, () => scada.setLocked(ids(), false))}
          {sep('s5')}
          {btn('toFront', hasSel.value, () => scada.bringToFront(ids()))}
          {btn('toBack', hasSel.value, () => scada.sendToBack(ids()))}
          {btn('forward', hasSel.value, () => scada.moveForward(ids()))}
          {btn('backward', hasSel.value, () => scada.moveBackward(ids()))}
          {sep('s6')}
          {btn('grid', true, () => (scada.gridOn = !scada.gridOn), { active: scada.gridOn })}
          <div class={'flex-1 min-w-2'} />
          <span class={'shrink-0 pl-2 text-xs text-gray-500 whitespace-nowrap'} data-tool-status title={n > 1 ? tt('scada.tool.referenceHint') : ''}>
            {n === 0 ? tt('scada.tool.noSelection') : n === 1 ? tt('scada.tool.oneSelected') : tt('scada.tool.selected', { n })}
            {ref ? ` · ${tt('scada.tool.reference')}: ${widgetName(ref)}` : ''}
          </span>
        </div>
      )
    }
  }
})
