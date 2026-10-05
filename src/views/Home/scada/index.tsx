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
 *  - 保存有两个按钮：「保存」= 保存并退出编辑；「保存并继续」（Ctrl + S）= 保存但留在编辑模式（撤销历史保留）。
 *  - 「内部变量」按钮 → VariableDialog（增 / 删 / 改名，定义随布局保存）；工具栏第二行最左边是撤销 / 重做（Ctrl + Z / Y，最多 10 步）。
 *  - 页面级快捷键（shortcuts.ts 匹配、这里的 onShortcut 执行）：Ctrl + Z / Y / S / C / X / V / D / L / [ / ]、Tab、Esc、F11、F1；画布自己的按键仍在 Canvas.tsx。
 *
 * 目录说明：
 *  - types.ts            公共类型（数据源 / 组件 / 布局）
 *  - dataSource/         数据源抽象与内置实现（product = 产品分类数据，sim = 模拟信号）
 *  - registry.ts         组件注册表；widgets/ 内置示例组件
 *  - store.ts            布局 / 草稿 / 选中状态；storage.ts 持久化抽象（当前 localStorage）
 *  - Canvas.tsx          等比缩放画布 + 拖动 / 八点缩放 / 多选；Palette.tsx 组件库；PropertyPanel.tsx 属性面板
 *  - ArrangeBar.tsx      排列工具栏（对齐 / 分布 / 等宽高 / 旋转 / 翻转 / 组合 / 锁定 / 层次 / 网格），运算在 arrange.ts（纯函数）
 *  - LayerPanel.tsx      图层栏（上下层关系：拖动排序 / 置顶置底 / 显示隐藏 / 锁定）
 *  - history.ts          撤销 / 重做历史栈（纯逻辑，store.ts 用 $onAction 挂钩）；shortcuts.ts 快捷键匹配（纯函数）
 *  - variables.ts        内部变量定义的纯函数；VariableDialog.tsx 内部变量管理弹窗
 *  - resource.ts         资源文件（图片）经宿主 SaveResourceFile 保存、https://pic.nt.local/ 读取；保存 / 导入后清理未引用的文件
 *  - package.ts / zip.ts 组态包（布局 + 资源打成 zip）导入导出：有宿主时由宿主 Export/Preview/ImportScadaPackage 完成（另存为 / 打开对话框），
 *                        没有宿主（浏览器调试）时前端打包下载 / file input 读取；ImportDialog.tsx 导入弹窗（两种来源共用）
 */
import { NButton, NButtonGroup, NDropdown, NModal, NPopconfirm, NTag, type DropdownOption } from 'naive-ui'
import { computed, defineComponent, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useMain } from '@/store'
import ArrangeBar from './ArrangeBar'
import Canvas, { canvasFocused, canvasHasFocus, canvasView, resetCanvasView, zoomCanvas } from './Canvas'
import { refreshAllDataSources, startAllDataSources, stopAllDataSources } from './dataSource'
import { startScripts, stopScripts } from './scripts'
import ImportDialog from './ImportDialog'
import LayerPanel from './LayerPanel'
import { buildPackage, exportPackageViaHost, previewPackageViaHost, type HostPackagePreview } from './package'
import Palette from './Palette'
import PropertyPanel from './PropertyPanel'
import { downloadBlob, hasHostBridge } from './resource'
import { isTextEntry, matchShortcut, overlayOpen } from './shortcuts'
import { useScadaStore } from './store'
import { toolIcons } from './toolIcons'
import VariableDialog from './VariableDialog'
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
    /**
     * 页面上选着一段文字、且用户没有刚点过画布：Ctrl + C / X 归浏览器（复制文字）。
     * 点画布（user-select: none）不会清掉别处选着的文字，所以一旦焦点在画布里就仍然复制 / 剪切组件，免得一段忘了取消的选区让快捷键失灵
     */
    const textSelected = () => {
      const sel = typeof window !== 'undefined' && window.getSelection ? window.getSelection() : null
      return !!sel && !sel.isCollapsed && sel.toString().length > 0 && !canvasHasFocus()
    }
    const notify = (kind: 'success' | 'warning' | 'error', text: string) => {
      const m = window.$message as unknown as Record<string, ((t: string) => void) | undefined> | undefined
      if (m && typeof m[kind] === 'function') m[kind]!(text)
    }
    /** Ctrl + S / 「保存并继续」：保存但留在编辑模式（撤销历史保留） */
    const onSaveStay = async () => {
      if (!scada.editing || scada.saving) return
      // 正在输入的框（数字框要失焦才提交）先失焦，免得漏掉刚输入的值
      const active = typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null
      if (active && active !== document.body && isTextEntry(active) && typeof active.blur === 'function') {
        active.blur()
        await nextTick()
      }
      try {
        await scada.save({ stay: true })
        notify('success', tt('scada.savedContinue'))
      } catch (err) {
        console.error('[scada] save failed', err)
        notify('error', tt('scada.saveFailed'))
      }
    }
    /**
     * 编辑模式的页面级快捷键（匹配规则与完整列表见 shortcuts.ts）。
     * 弹窗 / 下拉菜单 / 颜色浮层打开时不响应（Esc 先留给它们关闭自己；.n-modal-container 关闭后仍会留一个空壳，所以看里面有没有内容）；
     * 焦点在文本输入框里时撤销 / 复制 / 粘贴 / Tab 归浏览器（输入框自己的文字撤销、复制粘贴），只有 Ctrl + S / F1 / F11 / Esc（退全屏）照常生效。
     */
    const onShortcut = (e: KeyboardEvent) => {
      if (!scada.editing) return
      const id = matchShortcut(e)
      if (!id) return
      if (overlayOpen(true)) return
      const typing = isTextEntry(e.target)
      if (id === 'save') {
        e.preventDefault()
        void onSaveStay()
        return
      }
      if (id === 'fullscreen') {
        e.preventDefault()
        void toggleFullscreen()
        return
      }
      if (id === 'help') {
        e.preventDefault()
        helpShow.value = true
        return
      }
      if (id === 'deselect') {
        // Esc：先退出全屏（输入框里也算），否则取消选中
        if (scada.fullscreen) {
          void exitFullscreen()
          return
        }
        // 焦点在画布 / 页面空白时才取消选中：焦点在下拉 / 按钮上的 Esc 是用来收起它们的，不该顺手把组件取消选中
        if (!typing && scada.selectedIds.length && canvasFocused()) {
          scada.select(null)
          e.preventDefault()
        }
        return
      }
      if (typing) return
      const ids = scada.selectedIds.slice()
      switch (id) {
        case 'undo':
          e.preventDefault()
          scada.undo()
          break
        case 'redo':
          e.preventDefault()
          scada.redo()
          break
        case 'copy': {
          if (textSelected()) break // 页面上选着一段文字（比如属性面板的说明）：Ctrl + C 复制文字
          e.preventDefault()
          const n = scada.copySelection()
          if (n) notify('success', tt('scada.shortcut.copied', { n }))
          break
        }
        case 'cut': {
          if (textSelected()) break
          e.preventDefault()
          const r = scada.cutSelection()
          if (r.cut) notify('success', tt('scada.shortcut.cut', { n: r.cut }))
          if (r.locked) notify('warning', tt('scada.tool.lockedHint'))
          break
        }
        case 'paste':
          e.preventDefault()
          scada.pasteClipboard()
          break
        case 'duplicate':
          e.preventDefault()
          if (ids.length) scada.duplicateWidgets(ids)
          break
        case 'lock': {
          e.preventDefault()
          const sel = scada.selectedWidgets
          if (sel.length) scada.setLocked(ids, sel.some(w => !w.locked))
          break
        }
        case 'forward':
        case 'backward':
        case 'toFront':
        case 'toBack':
          e.preventDefault()
          if (ids.length) {
            if (id === 'forward') scada.moveForward(ids)
            else if (id === 'backward') scada.moveBackward(ids)
            else if (id === 'toFront') scada.bringToFront(ids)
            else scada.sendToBack(ids)
          }
          break
        case 'selectNext':
        case 'selectPrev':
          // Tab 只在焦点落在画布 / 页面空白时用来切换组件；焦点在按钮 / 下拉上时照常切换焦点
          if (canvasFocused()) {
            e.preventDefault()
            scada.selectNext(id === 'selectNext' ? 1 : -1)
          }
          break
      }
    }
    // 保存 / 取消编辑后回到展示模式：退出全屏；退出全屏后重新量整页尺寸
    watch(
      () => scada.editing,
      v => {
        // store 里的 fullscreen 此时已被 save / cancelEdit 清掉，这里是为了把真全屏（若有）一并退出
        if (!v) exitFullscreen()
        // 全局脚本：进入展示（运行）模式 → 启动脚本 + 循环脚本；回编辑模式 → 停循环（结束脚本只在应用退出前执行）
        if (v) stopScripts()
        else startScripts(() => scada.current)
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
      window.addEventListener('keydown', onShortcut)
      // 组态 tab 激活：点输入框不弹虚拟键盘（属性面板 / 处理函数弹窗里的输入框都算）；
      // 但系统配置 / 产品配方 / 产品历史页面盖在上面打开时照常弹（utils.isKeyboardSuppressed）
      store.setGlobalKeyBoardShow(false)
      store.setGlobalKeyBoardBlocked(true)
      startAllDataSources()
      await scada.load(screenSize.w && screenSize.h ? { width: screenSize.w, height: screenSize.h } : undefined)
      // 布局加载完、数据源已启动：非编辑态（默认展示模式）执行启动脚本并开始循环
      if (!scada.editing) startScripts(() => scada.current)
    })
    onBeforeUnmount(() => {
      if (ro) ro.disconnect()
      document.removeEventListener('fullscreenchange', onFullscreenChange)
      window.removeEventListener('keydown', onShortcut)
      exitFullscreen()
      store.setGlobalKeyBoardBlocked(false)
      stopScripts()
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

    const HELP_SECTIONS = ['palette', 'canvas', 'widget', 'arrange', 'shortcuts', 'variables', 'display', 'control']
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
          <div class={'h-11 shrink-0 flex items-center gap-2 px-2 border-0 border-b border-solid border-gray-300 bg-gray-50'} data-scada-toolbar>
            {/* 左半边按钮多，窄屏时横向滚动；右半边（全屏 / 取消 / 保存）固定在右侧，不会被挤到屏幕外 */}
            <div class={'flex-1 min-w-0 h-full flex items-center gap-2 overflow-x-auto scada-noscrollbar'} data-scada-toolbar-left>
              <NTag type="warning" size="small" bordered={false}>{tt('scada.editingTag')}</NTag>
              <span class={'text-xs text-gray-500 whitespace-nowrap'}>{l.canvas.width}×{l.canvas.height}</span>
              <NButton size="small" secondary type={scada.paletteShow ? 'primary' : 'default'} onClick={() => (scada.paletteShow = !scada.paletteShow)}>{tt('scada.palette')}</NButton>
              <NButton size="small" secondary type={scada.layersShow ? 'primary' : 'default'} data-scada-layers-toggle onClick={() => (scada.layersShow = !scada.layersShow)}>{tt('scada.layers')}</NButton>
              <NButton size="small" secondary type={scada.propsShow ? 'primary' : 'default'} onClick={() => (scada.propsShow = !scada.propsShow)}>{tt('scada.properties')}</NButton>
              <NButton size="small" secondary type={scada.varsShow ? 'primary' : 'default'} data-scada-vars onClick={() => (scada.varsShow = true)}>{tt('scada.vars.button')}</NButton>
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
            </div>
            <div class={'shrink-0 flex items-center gap-2'} data-scada-toolbar-right>
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
              <NButton size="small" secondary type="primary" disabled={!canSave.value} data-scada-save-stay onClick={onSaveStay}>{tt('scada.saveContinue')}</NButton>
              <NButton size="small" type="primary" loading={scada.saving} disabled={!canSave.value} data-scada-save onClick={onSave}>{tt('scada.save')}</NButton>
            </div>
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
          {editing ? <VariableDialog /> : null}
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
