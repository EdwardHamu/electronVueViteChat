/**
 * 数据组态展示页入口：
 *  - 展示模式：没有顶栏，画布占满整个标签页；右键（触摸屏长按）弹出菜单进入编辑 / 刷新数据源 / 导出 / 导入组态；
 *  - 编辑模式：两行顶部工具栏（第一行：组件库 / 图层 / 属性开关、缩放、说明、全屏、保存；第二行：排列工具栏 ArrangeBar）+ 画布 + 组件库 / 图层栏 / 属性面板：
 *      横屏：左栏（组件库在上、图层栏在下）| 画布 | 属性面板（左右三栏）
 *      竖屏：组件库（横向一条）/ 画布 / 下方一行（左：图层栏，右：属性面板，分两栏）
 *  - 全屏按钮：编辑器用 fixed 铺满整个应用窗口（盖住页签、右侧数值栏、底部按钮），并尽力调用浏览器的 Fullscreen API（不支持 / 被拒绝就只保留前者）；
 *    Esc / 再点一次 / 保存或取消编辑都会退出；全屏期间不重新量「整页尺寸」，「适配当前屏幕」仍按展示模式的页面面积算。
 *  - 「适配当前屏幕」与首次建布局用的尺寸都按展示模式（无顶栏）的整页面积计算；
 *  - 本页挂载期间屏蔽全局虚拟键盘（输入框聚焦不弹出）。
 *
 * 目录说明：
 *  - types.ts            公共类型（数据源 / 组件 / 布局）
 *  - dataSource/         数据源抽象与内置实现（product = 产品分类数据，sim = 模拟信号）
 *  - registry.ts         组件注册表；widgets/ 内置示例组件
 *  - store.ts            布局 / 草稿 / 选中状态；storage.ts 持久化抽象（当前 localStorage）
 *  - Canvas.tsx          等比缩放画布 + 拖动 / 八点缩放 / 多选；Palette.tsx 组件库；PropertyPanel.tsx 属性面板
 *  - ArrangeBar.tsx      排列工具栏（对齐 / 分布 / 等宽高 / 旋转 / 翻转 / 组合 / 锁定 / 层次 / 网格），运算在 arrange.ts（纯函数）
 *  - LayerPanel.tsx      图层栏（上下层关系：拖动排序 / 置顶置底 / 显示隐藏 / 锁定）
 *  - resource.ts         资源文件（图片）经宿主 SaveResourceFile 保存、https://pic.nt.local/ 读取；保存 / 导入后清理未引用的文件
 *  - package.ts / zip.ts 组态包（布局 + 资源打成 zip）导入导出：有宿主时由宿主 Export/Preview/ImportScadaPackage 完成（另存为 / 打开对话框），
 *                        没有宿主（浏览器调试）时前端打包下载 / file input 读取；ImportDialog.tsx 导入弹窗（两种来源共用）
 */
import { NButton, NButtonGroup, NDropdown, NModal, NPopconfirm, NTag, type DropdownOption } from 'naive-ui'
import { computed, defineComponent, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useMain } from '@/store'
import ArrangeBar from './ArrangeBar'
import Canvas, { canvasView, resetCanvasView, zoomCanvas } from './Canvas'
import { refreshAllDataSources, startAllDataSources, stopAllDataSources } from './dataSource'
import ImportDialog from './ImportDialog'
import LayerPanel from './LayerPanel'
import { buildPackage, exportPackageViaHost, previewPackageViaHost, type HostPackagePreview } from './package'
import Palette from './Palette'
import PropertyPanel from './PropertyPanel'
import { downloadBlob, hasHostBridge } from './resource'
import { useScadaStore } from './store'
import { toolIcons } from './toolIcons'
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
    /** 导入 / 导出组态包 */
    const fileInputRef = ref<HTMLInputElement>()
    const importFile = ref<File | null>(null)
    /** 宿主模式：PreviewScadaPackage 的清点结果 */
    const importPreview = ref<HostPackagePreview | null>(null)
    const importShow = ref(false)
    const exporting = ref(false)
    /** 宿主打开文件对话框期间置位，防止重复触发 */
    const picking = ref(false)

    const measure = () => {
      const el = rootRef.value
      // 全屏时根元素是整个窗口的大小，不能当成展示模式的整页面积（「适配当前屏幕」要的是没全屏时的尺寸），保持全屏前量到的值
      if (!el || scada.fullscreen) return
      screenSize.w = el.clientWidth
      screenSize.h = el.clientHeight
    }

    // ---------------------------------------------------------------- 全屏：编辑器盖住整个窗口 + 尽力真全屏
    /** 是我们调用 requestFullscreen 进入的真全屏（用户按 Esc 退出真全屏时据此同步编辑器的全屏状态） */
    let apiFullscreen = false
    const canApiFullscreen = () => typeof document !== 'undefined' && !!document.documentElement && typeof document.documentElement.requestFullscreen === 'function'
    const enterFullscreen = async () => {
      scada.setFullscreen(true)
      if (!canApiFullscreen() || document.fullscreenElement) return
      try {
        // 整页全屏（不是只给编辑器根元素）：Teleport 到 body 的弹窗 / 下拉 / 颜色浮层才看得见
        await document.documentElement.requestFullscreen()
        apiFullscreen = true
      } catch {
        /* 浏览器 / 宿主不允许真全屏：保持「编辑器盖住整个窗口」的效果 */
      }
    }
    const exitFullscreen = async () => {
      scada.setFullscreen(false)
      const real = apiFullscreen
      apiFullscreen = false
      if (real && typeof document !== 'undefined' && document.fullscreenElement && typeof document.exitFullscreen === 'function') {
        try {
          await document.exitFullscreen()
        } catch {
          /* ignore */
        }
      }
    }
    const toggleFullscreen = () => (scada.fullscreen ? exitFullscreen() : enterFullscreen())
    const onFullscreenChange = () => {
      if (apiFullscreen && !document.fullscreenElement) {
        apiFullscreen = false
        scada.setFullscreen(false)
      }
    }
    const onEscape = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !scada.fullscreen) return
      // 弹窗 / 下拉菜单 / 颜色浮层打开时，Esc 先留给它们关闭自己（.n-modal-container 关闭后仍会留一个空壳，要看里面有没有内容；
      // 正在播放关闭动画的下拉菜单带 leave-active 类，已经不算打开）
      if (document.querySelector('.n-modal-container > *, .n-dropdown-menu:not(.popover-transition-leave-active), [data-color-popup]')) return
      exitFullscreen()
    }
    // 保存 / 取消编辑后回到展示模式：退出全屏；退出全屏后重新量整页尺寸
    watch(
      () => scada.editing,
      v => {
        // store 里的 fullscreen 此时已被 save / cancelEdit 清掉，这里是为了把真全屏（若有）一并退出
        if (!v) exitFullscreen()
      }
    )
    watch(
      () => scada.fullscreen,
      v => {
        if (!v) measure()
      },
      // post：等根元素的 fixed 样式撤掉、恢复成页面里的大小之后再量，否则量到的还是整个窗口
      { flush: 'post' }
    )

    onMounted(async () => {
      measure()
      if (typeof ResizeObserver !== 'undefined' && rootRef.value) {
        ro = new ResizeObserver(() => measure())
        ro.observe(rootRef.value)
      }
      document.addEventListener('fullscreenchange', onFullscreenChange)
      window.addEventListener('keydown', onEscape)
      // 组态页内点输入框不弹虚拟键盘（属性面板 / 处理函数弹窗里的输入框都算）
      store.setGlobalKeyBoardShow(false)
      store.setGlobalKeyBoardBlocked(true)
      startAllDataSources()
      await scada.load(screenSize.w && screenSize.h ? { width: screenSize.w, height: screenSize.h } : undefined)
    })
    onBeforeUnmount(() => {
      if (ro) ro.disconnect()
      document.removeEventListener('fullscreenchange', onFullscreenChange)
      window.removeEventListener('keydown', onEscape)
      exitFullscreen()
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

    // ---------------------------------------------------------------- 导入 / 导出组态包（zip：layout.json + 图片等资源）
    /**
     * 导出：有宿主 → 宿主弹「另存为」并自己打包（ExportScadaPackage，读 Resources/pic 不经过 fetch）；
     * 没有宿主、或老宿主没有这个接口（返回 undefined）→ 前端打包 + 浏览器下载。
     */
    const onExport = async () => {
      if (exporting.value) return
      exporting.value = true
      try {
        if (hasHostBridge()) {
          const res = await exportPackageViaHost(scada.current)
          if (res !== undefined) {
            if (!res || typeof res !== 'object' || res.Cancelled) return // 失败（宿主已提示）或用户取消
            window.$message && window.$message.success(tt('scada.pkg.exportedTo', { path: res.Path || res.FileName || '', n: res.Resources || 0 }))
            if (res.Missing && res.Missing.length) window.$message && window.$message.warning(tt('scada.pkg.exportMissing', { n: res.Missing.length }))
            return
          }
        }
        const result = await buildPackage(scada.current)
        downloadBlob(result.blob, result.fileName)
        window.$message && window.$message.success(tt('scada.pkg.exported', { name: result.fileName, n: result.manifest.resources.length }))
        if (result.missing.length) window.$message && window.$message.warning(tt('scada.pkg.exportMissing', { n: result.missing.length }))
      } catch (err) {
        console.error('[scada] export failed', err)
        window.$message && window.$message.error(tt('scada.pkg.exportFailed'))
      } finally {
        exporting.value = false
      }
    }
    /**
     * 导入：有宿主 → 宿主弹打开文件对话框并清点（PreviewScadaPackage），结果交给导入弹窗确认后再 ImportScadaPackage；
     * 没有宿主 / 老宿主 → 隐藏 file input 选文件，前端解析。
     */
    const onImportClick = async () => {
      if (picking.value) return
      if (hasHostBridge()) {
        picking.value = true
        try {
          const res = await previewPackageViaHost('')
          if (res !== undefined) {
            if (!res || typeof res !== 'object' || res.Cancelled) return
            importFile.value = null
            importPreview.value = res
            importShow.value = true
            return
          }
        } catch (err) {
          console.error('[scada] host preview failed', err)
        } finally {
          picking.value = false
        }
      }
      const input = fileInputRef.value
      if (!input) return
      input.value = ''
      input.click()
    }
    const onImportFileChange = (e: Event) => {
      const input = e.target as HTMLInputElement
      const file = input.files && input.files[0]
      if (!file) return
      importPreview.value = null
      importFile.value = file
      importShow.value = true
    }
    const closeImport = () => {
      importShow.value = false
      importFile.value = null
      importPreview.value = null
      if (fileInputRef.value) fileInputRef.value.value = ''
    }
    /** 编辑模式工具栏「⋯」菜单 */
    const moreOptions = computed<DropdownOption[]>(() => [
      { key: 'export', label: tt('scada.export'), disabled: exporting.value },
      { key: 'import', label: tt('scada.import'), disabled: picking.value }
    ])
    const onMoreSelect = (key: string | number) => {
      if (key === 'export') onExport()
      else if (key === 'import') onImportClick()
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
      { key: 'refresh', label: tt('scada.refreshData'), disabled: refreshing.value },
      { key: 'divider2', type: 'divider' },
      { key: 'export', label: tt('scada.export'), disabled: exporting.value },
      { key: 'import', label: tt('scada.import'), disabled: picking.value }
    ])
    const onMenuSelect = (key: string | number) => {
      menu.show = false
      if (key === 'edit') scada.startEdit()
      else if (key === 'refresh') onRefresh()
      else if (key === 'export') onExport()
      else if (key === 'import') onImportClick()
    }

    const HELP_SECTIONS = ['palette', 'canvas', 'widget', 'arrange', 'display', 'control']
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

    /** 编辑模式的顶部工具栏（两行：常用开关 / 缩放 / 保存；排列工具栏）；展示模式不渲染顶栏，画布占满整页 */
    const renderToolbar = () => {
      const l = scada.current
      return (
        <>
          <div class={'h-11 shrink-0 flex items-center gap-2 px-2 overflow-x-auto scada-noscrollbar border-0 border-b border-solid border-gray-300 bg-gray-50'}>
            <NTag type="warning" size="small" bordered={false}>{tt('scada.editingTag')}</NTag>
            <span class={'text-xs text-gray-500 whitespace-nowrap'}>{l.canvas.width}×{l.canvas.height}</span>
            <NButton size="small" secondary type={scada.paletteShow ? 'primary' : 'default'} onClick={() => (scada.paletteShow = !scada.paletteShow)}>{tt('scada.palette')}</NButton>
            <NButton size="small" secondary type={scada.layersShow ? 'primary' : 'default'} data-scada-layers-toggle onClick={() => (scada.layersShow = !scada.layersShow)}>{tt('scada.layers')}</NButton>
            <NButton size="small" secondary type={scada.propsShow ? 'primary' : 'default'} onClick={() => (scada.propsShow = !scada.propsShow)}>{tt('scada.properties')}</NButton>
            <NButtonGroup size="small">
              <NButton onClick={() => zoomCanvas(1 / 1.2)}>－</NButton>
              <NButton class={'min-w-[56px]'} onClick={() => resetCanvasView()}>{Math.round(canvasView.zoom * 100)}%</NButton>
              <NButton onClick={() => zoomCanvas(1.2)}>＋</NButton>
            </NButtonGroup>
            <NButton size="small" quaternary circle data-scada-help onClick={() => (helpShow.value = true)}>
              <span class={'font-bold'}>?</span>
            </NButton>
            <NDropdown trigger="click" placement="bottom-start" options={moreOptions.value} onSelect={onMoreSelect}>
              <NButton size="small" quaternary circle data-scada-more>
                <span class={'font-bold tracking-widest'}>⋯</span>
              </NButton>
            </NDropdown>
            <div class={'flex-1 min-w-2'} />
            <button
              type="button"
              data-scada-fullscreen
              title={scada.fullscreen ? tt('scada.tool.exitFullscreen') : tt('scada.tool.fullscreen')}
              class={['shrink-0 h-7 px-1.5 rounded border border-solid cursor-pointer outline-none flex items-center gap-1 text-xs', scada.fullscreen ? 'bg-blue-100 text-blue-700 border-blue-300' : 'bg-white text-slate-700 border-gray-300 hover:bg-blue-50']}
              onClick={toggleFullscreen}
            >
              <span class={'w-4 h-4 block'}>{scada.fullscreen ? toolIcons.exitFullscreen() : toolIcons.fullscreen()}</span>
              <span class={'whitespace-nowrap'}>{scada.fullscreen ? tt('scada.tool.exitFullscreen') : tt('scada.tool.fullscreen')}</span>
            </button>
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
          <ArrangeBar />
        </>
      )
    }

    return () => {
      const editing = scada.editing
      const isPortrait = portrait.value
      const fs = editing && scada.fullscreen
      return (
        <div
          ref={rootRef}
          class={['flex flex-col overflow-hidden bg-white', fs ? 'fixed inset-0 z-[1990]' : 'w-full h-full']}
          data-fullscreen={fs ? '1' : undefined}
          onContextmenu={onContextMenu}
        >
          {editing ? renderToolbar() : null}
          {editing ? renderHelp() : null}
          <input ref={fileInputRef} type="file" accept=".zip,.json,application/zip,application/json" class={'hidden'} data-scada-import onChange={onImportFileChange} />
          <ImportDialog show={importShow.value} file={importFile.value} preview={importPreview.value} onClose={closeImport} />
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
            {editing && isPortrait && scada.paletteShow ? (
              <div class={'h-[92px] shrink-0 border-0 border-b border-solid border-gray-300 overflow-hidden'}>
                <Palette direction="horizontal" />
              </div>
            ) : null}
            {editing && !isPortrait && (scada.paletteShow || scada.layersShow) ? (
              <div class={'w-[200px] shrink-0 flex flex-col border-0 border-r border-solid border-gray-300 overflow-hidden'}>
                {scada.paletteShow ? (
                  <div class={'flex-1 min-h-0 overflow-hidden'}>
                    <Palette direction="vertical" />
                  </div>
                ) : null}
                {scada.layersShow ? (
                  <div class={['overflow-hidden', scada.paletteShow ? 'h-[38%] min-h-[170px] shrink-0 border-0 border-t border-solid border-gray-300' : 'flex-1 min-h-0']}>
                    <LayerPanel />
                  </div>
                ) : null}
              </div>
            ) : null}
            <div class={'flex-1 min-w-0 min-h-0 relative'}>
              <Canvas />
            </div>
            {editing && isPortrait && (scada.propsShow || scada.layersShow) ? (
              <div class={'h-[36%] min-h-[200px] shrink-0 flex flex-row border-0 border-t border-solid border-gray-300 overflow-hidden'}>
                {scada.layersShow ? (
                  <div class={['overflow-hidden', scada.propsShow ? 'w-[30%] min-w-[170px] shrink-0 border-0 border-r border-solid border-gray-300' : 'flex-1 min-w-0']}>
                    <LayerPanel />
                  </div>
                ) : null}
                {scada.propsShow ? (
                  <div class={'flex-1 min-w-0 overflow-hidden'}>
                    <PropertyPanel screenSize={screenSize} columns={2} />
                  </div>
                ) : null}
              </div>
            ) : null}
            {editing && !isPortrait && scada.propsShow ? (
              <div class={'w-[300px] shrink-0 border-0 border-l border-solid border-gray-300 overflow-hidden'}>
                <PropertyPanel screenSize={screenSize} columns={1} />
              </div>
            ) : null}
          </div>
        </div>
      )
    }
  }
})
