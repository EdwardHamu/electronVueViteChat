/**
 * 数据组态展示页入口：
 *  - 展示模式：没有顶栏，画布占满整个标签页；右键（触摸屏长按）弹出菜单进入编辑 / 刷新数据源；
 *  - 编辑模式：顶部工具栏 + 画布 + 组件库与属性面板：
 *      横屏：组件库 | 画布 | 属性面板（左右三栏）
 *      竖屏：组件库（横向一条）/ 画布 / 属性面板（上下三行，属性面板分两栏）
 *  - 「适配当前屏幕」与首次建布局用的尺寸都按展示模式（无顶栏）的整页面积计算；
 *  - 本页挂载期间屏蔽全局虚拟键盘（输入框聚焦不弹出）。
 *
 * 目录说明：
 *  - types.ts            公共类型（数据源 / 组件 / 布局）
 *  - dataSource/         数据源抽象与内置实现（product = 产品分类数据，sim = 模拟信号）
 *  - registry.ts         组件注册表；widgets/ 内置示例组件
 *  - store.ts            布局 / 草稿 / 选中状态；storage.ts 持久化抽象（当前 localStorage）
 *  - Canvas.tsx          等比缩放画布 + 拖动 / 缩放；Palette.tsx 组件库；PropertyPanel.tsx 属性面板
 */
import { NButton, NButtonGroup, NDropdown, NModal, NPopconfirm, NTag, type DropdownOption } from 'naive-ui'
import { computed, defineComponent, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useMain } from '@/store'
import Canvas, { canvasView, resetCanvasView, zoomCanvas } from './Canvas'
import { refreshAllDataSources, startAllDataSources, stopAllDataSources } from './dataSource'
import Palette from './Palette'
import PropertyPanel from './PropertyPanel'
import { useScadaStore } from './store'
import { tt } from './widgets/common'
import './widgets'

export default defineComponent({
  name: 'ScadaPage',
  setup() {
    const scada = useScadaStore()
    const store = useMain()
    /** 竖屏：组件库 / 属性面板改为画布上下排布 */
    const portrait = computed(() => !store.isLandscape)
    const rootRef = ref<HTMLElement>()
    /**
     * 展示模式下画布可用的整页尺寸（展示模式没有顶栏，就是根元素大小；编辑模式量根元素同样得到去掉工具栏后的展示面积），
     * 供新建布局 / "适配当前屏幕" 使用
     */
    const screenSize = reactive({ w: 0, h: 0 })
    let ro: ResizeObserver | null = null
    const refreshing = ref(false)
    /** 展示模式右键菜单 */
    const menu = reactive({ show: false, x: 0, y: 0 })
    /** 操作说明弹窗（原先顶栏里的提示文字） */
    const helpShow = ref(false)

    const measure = () => {
      const el = rootRef.value
      if (!el) return
      screenSize.w = el.clientWidth
      screenSize.h = el.clientHeight
    }

    onMounted(async () => {
      measure()
      if (typeof ResizeObserver !== 'undefined' && rootRef.value) {
        ro = new ResizeObserver(() => measure())
        ro.observe(rootRef.value)
      }
      // 组态页内点输入框不弹虚拟键盘（属性面板 / 处理函数弹窗里的输入框都算）
      store.setGlobalKeyBoardShow(false)
      store.setGlobalKeyBoardBlocked(true)
      startAllDataSources()
      await scada.load(screenSize.w && screenSize.h ? { width: screenSize.w, height: screenSize.h } : undefined)
    })
    onBeforeUnmount(() => {
      if (ro) ro.disconnect()
      store.setGlobalKeyBoardBlocked(false)
      stopAllDataSources()
    })

    const canSave = computed(() => scada.editing && !scada.saving)

    const onSave = async () => {
      try {
        await scada.save()
        window.$message && window.$message.success(tt('scada.saved'))
      } catch (err) {
        console.error('[scada] save failed', err)
        window.$message && window.$message.error(tt('scada.saveFailed'))
      }
    }
    const onRefresh = async () => {
      refreshing.value = true
      try {
        await refreshAllDataSources()
      } finally {
        refreshing.value = false
      }
    }

    // ---------------------------------------------------------------- 展示模式右键菜单（触摸屏长按同样触发 contextmenu）
    const onContextMenu = (e: MouseEvent) => {
      if (scada.editing) return
      e.preventDefault()
      menu.x = e.clientX
      menu.y = e.clientY
      menu.show = true
    }
    const menuOptions = computed<DropdownOption[]>(() => [
      {
        key: 'info',
        type: 'render',
        render: () => (
          <div class={'px-3 py-1 text-xs text-gray-500 whitespace-nowrap'}>
            {tt('scada.title')} · {tt('scada.panel.widgetCount')}: {scada.current.widgets.length}
          </div>
        )
      },
      { key: 'divider', type: 'divider' },
      { key: 'edit', label: tt('scada.edit') },
      { key: 'refresh', label: tt('scada.refreshData'), disabled: refreshing.value }
    ])
    const onMenuSelect = (key: string | number) => {
      menu.show = false
      if (key === 'edit') scada.startEdit()
      else if (key === 'refresh') onRefresh()
    }

    const HELP_SECTIONS = ['palette', 'canvas', 'widget', 'display', 'control']
    /** 操作说明弹窗：分组列出组件库 / 画布 / 组件 / 展示模式 / 控制组件的操作方式 */
    const renderHelp = () => (
      <NModal show={helpShow.value} preset="card" title={tt('scada.help.title')} style={{ width: 'min(560px, 94vw)' }} closable maskClosable onUpdateShow={(v: boolean) => (helpShow.value = v)}>
        <div class={'flex flex-col gap-3'} data-scada-help-content>
          {HELP_SECTIONS.map(k => (
            <div key={k}>
              <div class={'text-sm font-bold text-gray-700 mb-1'}>{tt(`scada.help.${k}`)}</div>
              <ul class={'m-0 pl-5 text-xs text-gray-600 leading-5'}>
                {tt(`scada.help.${k}Text`).split('\n').map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </NModal>
    )

    /** 编辑模式的顶部工具栏；展示模式不渲染顶栏，画布占满整页 */
    const renderToolbar = () => {
      const l = scada.current
      return (
        <div class={'h-11 shrink-0 flex items-center gap-2 px-2 border-0 border-b border-solid border-gray-300 bg-gray-50'}>
          <NTag type="warning" size="small" bordered={false}>{tt('scada.editingTag')}</NTag>
          <span class={'text-xs text-gray-500'}>{l.canvas.width}×{l.canvas.height}</span>
          <NButton size="small" secondary type={scada.paletteShow ? 'primary' : 'default'} onClick={() => (scada.paletteShow = !scada.paletteShow)}>{tt('scada.palette')}</NButton>
          <NButton size="small" secondary type={scada.propsShow ? 'primary' : 'default'} onClick={() => (scada.propsShow = !scada.propsShow)}>{tt('scada.properties')}</NButton>
          <NButtonGroup size="small">
            <NButton onClick={() => zoomCanvas(1 / 1.2)}>－</NButton>
            <NButton class={'min-w-[56px]'} onClick={() => resetCanvasView()}>{Math.round(canvasView.zoom * 100)}%</NButton>
            <NButton onClick={() => zoomCanvas(1.2)}>＋</NButton>
          </NButtonGroup>
          <NButton size="small" quaternary circle data-scada-help onClick={() => (helpShow.value = true)}>
            <span class={'font-bold'}>?</span>
          </NButton>
          <div class={'flex-1'} />
          {scada.dirty ? (
            <NPopconfirm onPositiveClick={() => scada.cancelEdit()} positiveText={tt('scada.confirm')} negativeText={tt('scada.cancel')}>
              {{
                trigger: () => <NButton size="small">{tt('scada.cancel')}</NButton>,
                default: () => tt('scada.discardConfirm')
              }}
            </NPopconfirm>
          ) : (
            <NButton size="small" onClick={() => scada.cancelEdit()}>{tt('scada.cancel')}</NButton>
          )}
          <NButton size="small" type="primary" loading={scada.saving} disabled={!canSave.value} onClick={onSave}>{tt('scada.save')}</NButton>
        </div>
      )
    }

    return () => {
      const editing = scada.editing
      const isPortrait = portrait.value
      return (
        <div ref={rootRef} class={'w-full h-full flex flex-col overflow-hidden bg-white'} onContextmenu={onContextMenu}>
          {editing && renderToolbar()}
          {editing ? renderHelp() : null}
          {!editing && (
            <NDropdown
              placement="bottom-start"
              trigger="manual"
              show={menu.show}
              x={menu.x}
              y={menu.y}
              options={menuOptions.value}
              onClickoutside={() => (menu.show = false)}
              onSelect={onMenuSelect}
            />
          )}
          <div class={['flex-1 min-h-0 flex overflow-hidden', isPortrait ? 'flex-col' : 'flex-row']}>
            {editing && scada.paletteShow && (
              isPortrait ? (
                <div class={'h-[92px] shrink-0 border-0 border-b border-solid border-gray-300 overflow-hidden'}>
                  <Palette direction="horizontal" />
                </div>
              ) : (
                <div class={'w-[200px] shrink-0 border-0 border-r border-solid border-gray-300 overflow-hidden'}>
                  <Palette direction="vertical" />
                </div>
              )
            )}
            <div class={'flex-1 min-w-0 min-h-0 relative'}>
              <Canvas />
            </div>
            {editing && scada.propsShow && (
              isPortrait ? (
                <div class={'h-[36%] min-h-[200px] shrink-0 border-0 border-t border-solid border-gray-300 overflow-hidden'}>
                  <PropertyPanel screenSize={screenSize} columns={2} />
                </div>
              ) : (
                <div class={'w-[300px] shrink-0 border-0 border-l border-solid border-gray-300 overflow-hidden'}>
                  <PropertyPanel screenSize={screenSize} columns={1} />
                </div>
              )
            )}
          </div>
        </div>
      )
    }
  }
})
