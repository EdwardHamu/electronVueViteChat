/**
 * 数据组态展示页入口：工具栏 + （编辑模式：组件库 | 画布 | 属性面板）/（展示模式：画布）
 *
 * 目录说明：
 *  - types.ts            公共类型（数据源 / 组件 / 布局）
 *  - dataSource/         数据源抽象与内置实现（product = 产品分类数据，sim = 模拟信号）
 *  - registry.ts         组件注册表；widgets/ 内置示例组件
 *  - store.ts            布局 / 草稿 / 选中状态；storage.ts 持久化抽象（当前 localStorage）
 *  - Canvas.tsx          等比缩放画布 + 拖动 / 缩放；Palette.tsx 组件库；PropertyPanel.tsx 属性面板
 */
import { NButton, NPopconfirm, NTag } from 'naive-ui'
import { computed, defineComponent, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import Canvas from './Canvas'
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
    const rootRef = ref<HTMLElement>()
    const bodyRef = ref<HTMLElement>()
    /** 画布可视区域（不含工具栏）的实际尺寸，供新建布局 / "适配当前屏幕" 使用 */
    const screenSize = reactive({ w: 0, h: 0 })
    let ro: ResizeObserver | null = null
    const refreshing = ref(false)

    const measure = () => {
      const el = bodyRef.value
      if (!el) return
      screenSize.w = el.clientWidth
      screenSize.h = el.clientHeight
    }

    onMounted(async () => {
      measure()
      if (typeof ResizeObserver !== 'undefined' && bodyRef.value) {
        ro = new ResizeObserver(() => measure())
        ro.observe(bodyRef.value)
      }
      startAllDataSources()
      await scada.load(screenSize.w && screenSize.h ? { width: screenSize.w, height: screenSize.h } : undefined)
    })
    onBeforeUnmount(() => {
      if (ro) ro.disconnect()
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

    const renderToolbar = () => {
      const editing = scada.editing
      const l = scada.current
      return (
        <div class={'h-11 shrink-0 flex items-center gap-2 px-2 border-0 border-b border-solid border-gray-300 bg-gray-50'}>
          {editing ? (
            <>
              <NTag type="warning" size="small" bordered={false}>{tt('scada.editingTag')}</NTag>
              <span class={'text-xs text-gray-500'}>{l.canvas.width}×{l.canvas.height}</span>
              <NButton size="small" secondary type={scada.paletteShow ? 'primary' : 'default'} onClick={() => (scada.paletteShow = !scada.paletteShow)}>{tt('scada.palette')}</NButton>
              <NButton size="small" secondary type={scada.propsShow ? 'primary' : 'default'} onClick={() => (scada.propsShow = !scada.propsShow)}>{tt('scada.properties')}</NButton>
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
            </>
          ) : (
            <>
              <span class={'text-sm font-bold text-gray-700'}>{tt('scada.title')}</span>
              <span class={'text-xs text-gray-500'}>{tt('scada.panel.widgetCount')}: {l.widgets.length}</span>
              <div class={'flex-1'} />
              <NButton size="small" loading={refreshing.value} onClick={onRefresh}>{tt('scada.refreshData')}</NButton>
              <NButton size="small" type="primary" onClick={() => scada.startEdit()}>{tt('scada.edit')}</NButton>
            </>
          )}
        </div>
      )
    }

    return () => (
      <div ref={rootRef} class={'w-full h-full flex flex-col overflow-hidden bg-white'}>
        {renderToolbar()}
        <div ref={bodyRef} class={'flex-1 min-h-0 flex overflow-hidden'}>
          {scada.editing && scada.paletteShow && (
            <div class={'w-[190px] shrink-0 border-0 border-r border-solid border-gray-300 overflow-hidden'}>
              <Palette />
            </div>
          )}
          <div class={'flex-1 min-w-0 relative'}>
            <Canvas />
          </div>
          {scada.editing && scada.propsShow && (
            <div class={'w-[300px] shrink-0 border-0 border-l border-solid border-gray-300 overflow-hidden'}>
              <PropertyPanel screenSize={screenSize} />
            </div>
          )}
        </div>
      </div>
    )
  }
})
