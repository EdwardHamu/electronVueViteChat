/**
 * 属性面板：选中一个组件时编辑标题 / 锁定 / 数据绑定 / 位置尺寸 / 组件自定义属性（按 propSchema 通用渲染）；
 * 旋转 / 翻转只在顶部排列工具栏里（任务 61 起面板里不再有旋转下拉和翻转开关）；每个区块都可以点标题折叠 / 展开（panelSections.ts，记在 localStorage）；
 * 选中多个时显示多选面板（数量、参考对象、选区外接框的位置尺寸、复制 / 删除；置顶 / 置底在排列工具栏、图层栏和 Ctrl + Shift + ] / [，面板里不放）；未选中时编辑画布本身（尺寸、背景、网格）。
 * 位置尺寸显示的是画面上看到的外框（旋转 90° / 270° 时宽高互换），输入后换算回组件的 x / y / w / h。
 * columns = 2 时（竖屏放在画布下方）各区块分两栏排布。
 * 数据处理函数（JS）通过面板底部的按钮打开 TransformDialog 弹窗编辑。
 * 颜色类字段用 ColorField（预设颜色表 + 调色盘，在色块上方弹出的浮动面板），不用 NColorPicker 的弹层。
 * 字体字段（'font'，hasText 的组件由 registerWidget 自动加）用 FontField；多选面板里也能给选中的带文字组件统一设置字体（一步撤销）。
 */
import { NButton, NInput, NInputNumber, NPopconfirm, NScrollbar, NSelect, NSwitch } from 'naive-ui'
import { computed, defineComponent, ref, watch, type PropType } from 'vue'
import ColorField from './ColorField'
import { visualMin } from './arrange'
import { dataSourceList, getDataSource } from './dataSource'
import { layoutFromVisual, unionRect, visualRect } from './geometry'
import { isSectionCollapsed, toggleSection } from './panelSections'
import { getWidgetDefinition, widgetName } from './registry'
import { hasHostBridge, INLINE_MAX_BYTES, isDataUrl, isResourceUrl, readBlobAsDataUrl, RESOURCE_MAX_BYTES, resourceFileName, uploadResource } from './resource'
import { useScadaStore } from './store'
import { transformErrors } from './transform'
import TransformDialog from './TransformDialog'
import CodeDialog, { codeParts } from './CodeDialog'
import FontField from './FontField'
import { FONT_FAMILY_KEY } from './fonts'
import type { PropField, WidgetInstance } from './types'
import { LOCAL_SOURCE_ID } from './variables'
import { tt } from './widgets/common'

const Row = (props: { label: string }, { slots }: { slots: any }) => (
  <div class={'flex items-center gap-2 py-1'}>
    <div class={'w-[88px] shrink-0 text-xs text-gray-600 truncate'} title={props.label}>{props.label}</div>
    <div class={'flex-1 min-w-0'}>{slots.default && slots.default()}</div>
  </div>
)

const prevent = (e: Event) => e.preventDefault()

/**
 * 面板区块：标题行可点击折叠 / 展开（折叠时内容不渲染——里面的颜色浮层之类随之关闭），sid = 折叠状态的键（panelSections.ts）。
 * 标题按钮 tabindex = -1 + mousedown preventDefault：点它不抢键盘焦点，折叠之后仍可直接按 Delete / 方向键 / Ctrl + Z 操作画布。
 */
const Section = (props: { sid: string; title: string }, { slots }: { slots: any }) => {
  const closed = isSectionCollapsed(props.sid)
  return (
    <div class={'px-3 py-2 border-0 border-b border-solid border-gray-200 break-inside-avoid'} data-scada-section={props.sid} data-collapsed={closed ? '1' : undefined}>
      <button
        type="button"
        tabindex={-1}
        aria-expanded={!closed}
        title={tt(closed ? 'scada.panel.expand' : 'scada.panel.collapse', { title: props.title })}
        data-scada-section-toggle={props.sid}
        class={'w-full min-h-[20px] p-0 border-0 bg-transparent flex items-center gap-1 text-left text-xs font-bold text-gray-500 hover:text-gray-800 cursor-pointer select-none outline-none'}
        onMousedown={prevent}
        onClick={() => toggleSection(props.sid)}
      >
        {/* 箭头旋转写成内联样式：本应用的 style.scss 只有 `@tailwind utilities`（没有 base 里的 --tw-* 变量初值），rotate-90 这类 transform 工具类不生效 */}
        <svg viewBox="0 0 12 12" class={'w-3 h-3 shrink-0'} style={{ transform: closed ? 'none' : 'rotate(90deg)', transition: 'transform 0.15s' }} aria-hidden="true">
          <path d="M4 2l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        <span class={'truncate'}>{props.title}</span>
      </button>
      {closed ? null : <div class={'mt-1'}>{slots.default && slots.default()}</div>}
    </div>
  )
}

export default defineComponent({
  name: 'ScadaPropertyPanel',
  props: {
    /** 组态页可视区域尺寸，用于"适配当前屏幕" */
    screenSize: { type: Object as PropType<{ w: number; h: number }>, default: () => ({ w: 0, h: 0 }) },
    /** 区块排布栏数：横屏侧栏 1 栏；竖屏放在画布下方时 2 栏 */
    columns: { type: Number, default: 1 }
  },
  setup(props) {
    const scada = useScadaStore()
    const selected = computed(() => scada.selected)
    const definition = computed(() => (selected.value ? getWidgetDefinition(selected.value.type) : undefined))
    const transformShow = ref(false)
    /** 正在用弹窗编辑的代码字段（自定义组件的 HTML / CSS / JS） */
    const codeField = ref<{ widgetId: string; field: PropField } | null>(null)
    // 选中项变化 / 退出编辑时关掉弹窗，避免弹窗里的草稿写到别的组件上
    watch(
      () => `${selected.value?.id || ''}|${scada.editing}`,
      () => {
        transformShow.value = false
      }
    )

    const sourceOptions = computed(() => dataSourceList().map(p => ({ label: p.label(), value: p.id })))
    const sourceId = ref<string>(dataSourceList()[0]?.id || '')
    watch(
      () => selected.value?.id,
      () => {
        const s = selected.value?.binding?.source
        if (s) sourceId.value = s
        else if (!sourceId.value) sourceId.value = dataSourceList()[0]?.id || ''
      },
      { immediate: true }
    )
    const itemOptions = computed(() => {
      const provider = getDataSource(sourceId.value)
      if (!provider) return []
      const groups = new Map<string, { label: string; value: string }[]>()
      provider.options().forEach(o => {
        const g = o.group || ''
        if (!groups.has(g)) groups.set(g, [])
        groups.get(g)!.push({ label: o.unit ? `${o.label} (${o.unit})` : o.label, value: o.key })
      })
      // 当前绑定的 key 已不在列表里（数据项被删 / 分组切换）时保留一个占位项，避免下拉框显示空白
      const b = selected.value?.binding
      if (b && b.source === sourceId.value && !provider.options().some(o => o.key === b.key)) {
        if (!groups.has('')) groups.set('', [])
        groups.get('')!.push({ label: `${b.label || b.key} (${tt('scada.panel.missing')})`, value: b.key })
      }
      if (groups.size <= 1) return Array.from(groups.values())[0] || []
      return Array.from(groups.entries()).map(([g, children]) => ({ type: 'group' as const, label: g || '-', key: g || '-', children }))
    })

    /** 位置 / 尺寸输入：显示的是画面上的外框（旋转 90° / 270° 时宽高互换），写回时换算成组件的 x / y / w / h */
    const setRect = (key: 'x' | 'y' | 'w' | 'h', v: number | null) => {
      const w = selected.value
      if (!w || w.locked || v === null || !Number.isFinite(v)) return
      scada.updateWidgetRect(w.id, layoutFromVisual({ ...visualRect(w), [key]: v }, w.rotate))
    }
    /** 多选：选区外接框的位置 / 尺寸输入 → 未锁定的选中组件整体平移 / 缩放 */
    const setBounds = (key: 'x' | 'y' | 'w' | 'h', v: number | null) => {
      if (v === null || !Number.isFinite(v)) return
      const u = unionRect(scada.selectedWidgets.filter(w => !w.locked).map(visualRect))
      if (!u) return
      scada.resizeSelectionTo({ ...u, [key]: Math.max(key === 'w' || key === 'h' ? 1 : 0, Math.round(v)) })
    }

    /**
     * 图片字段：选择本地文件。有宿主桥时经 JsBridge.SaveResourceFile 存到运行目录 Resources/pic，
     * 布局里只记 https://pic.nt.local/… 地址；没有宿主桥（纯浏览器调试）退回 data URL 内嵌（进 localStorage，单张限 INLINE_MAX_BYTES）。
     */
    const uploading = ref(false)
    const pickImage = (w: WidgetInstance, key: string) => {
      if (typeof document === 'undefined') return
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = 'image/*'
      input.onchange = async () => {
        const file = input.files && input.files[0]
        if (!file) return
        const bridge = hasHostBridge()
        const limit = bridge ? RESOURCE_MAX_BYTES : INLINE_MAX_BYTES
        if (file.size > limit) {
          window.$message?.warning(
            bridge
              ? tt('scada.panel.imageTooLargeMb', { mb: Math.round(limit / 1024 / 1024) })
              : tt('scada.panel.imageTooLarge', { kb: Math.round(limit / 1024) })
          )
          return
        }
        uploading.value = true
        try {
          const dataUrl = await readBlobAsDataUrl(file)
          if (bridge) {
            const saved = await uploadResource(file.name, dataUrl)
            scada.setWidgetProp(w.id, key, saved.Url)
          } else {
            scada.setWidgetProp(w.id, key, dataUrl)
          }
        } catch (err) {
          console.error('[scada] upload image failed', err)
          window.$message?.error(tt('scada.panel.uploadFailed'))
        } finally {
          uploading.value = false
        }
      }
      input.click()
    }
    /** 图片字段下方的小字：宿主资源显示文件名，内嵌 data URL 显示大小 */
    const imageInfo = (value: any) => {
      if (isResourceUrl(value)) return resourceFileName(value)
      if (isDataUrl(value)) return `${Math.round((String(value).length * 3) / 4 / 1024)} KB · ${tt('scada.panel.imageInline')}`
      return ''
    }

    const renderField = (w: WidgetInstance, f: PropField) => {
      const value = w.props[f.key]
      const set = (v: any) => scada.setWidgetProp(w.id, f.key, v)
      const ph = typeof f.placeholder === 'function' ? f.placeholder() : (f.placeholder || '')
      switch (f.type) {
        case 'boolean':
          return <NSwitch value={!!value} onUpdateValue={set} size="small" />
        case 'textarea':
          return <NInput size="small" type="textarea" autosize={{ minRows: 2, maxRows: 8 }} value={value ?? ''} placeholder={ph} onUpdateValue={set} />
        case 'image':
          return (
            <div class={'flex flex-col gap-1'}>
              <NInput size="small" value={value ?? ''} placeholder={ph} clearable onUpdateValue={set} />
              <div class={'flex items-center gap-1 min-w-0'}>
                <NButton size="tiny" loading={uploading.value} disabled={uploading.value} onClick={() => pickImage(w, f.key)}>{tt('scada.panel.chooseImage')}</NButton>
                {imageInfo(value) ? <span class={'text-[10px] text-gray-400 truncate'} title={String(value)}>{imageInfo(value)}</span> : null}
              </div>
            </div>
          )
        case 'number':
          return (
            <NInputNumber
              class={'w-full'}
              size="small"
              value={value === null || value === undefined || value === '' ? null : Number(value)}
              min={f.min}
              max={f.max}
              step={f.step}
              placeholder={ph}
              onUpdateValue={(v: number | null) => set(v)}
            />
          )
        case 'select':
          return <NSelect size="small" value={value ?? null} options={f.options ? f.options(w) : []} onUpdateValue={set} />
        case 'font':
          return <FontField value={typeof value === 'string' ? value : ''} placeholder={ph} onUpdateValue={set} />
        case 'multiselect':
          return <NSelect size="small" multiple clearable maxTagCount="responsive" value={Array.isArray(value) ? value : []} options={f.options ? f.options(w) : []} placeholder={ph} onUpdateValue={(v: any[]) => set(v)} />
        case 'code': {
          // 一个 code 字段可能含多段代码（HTML + CSS），按钮上显示合计字符数
          const len = codeParts(f).reduce((sum, p) => sum + String(w.props[p.key] || '').length, 0)
          return (
            <NButton class={'w-full'} size="small" secondary type={len ? 'primary' : 'default'} data-scada-code-field={f.key} onClick={() => (codeField.value = { widgetId: w.id, field: f })}>
              {tt('scada.panel.codeEdit')}{len ? ` · ${tt('scada.panel.codeChars', { n: len })}` : ''}
            </NButton>
          )
        }
        default:
          return <NInput size="small" value={value ?? ''} placeholder={ph} onUpdateValue={set} />
      }
    }

    const renderWidgetPanel = (w: WidgetInstance) => {
      const def = definition.value
      const optionalBinding = def?.needsBinding === false
      const vr = visualRect(w)
      const vmin = visualMin({ rotate: w.rotate, min: def?.minSize || { w: 20, h: 20 } })
      return (
        <>
          <Section sid="widget" title={`${tt('scada.panel.widget')} · ${def ? def.label() : w.type}`}>
            <Row label={tt('scada.panel.title')}>
              <NInput size="small" value={w.title || ''} placeholder={tt('scada.panel.titlePlaceholder')} onUpdateValue={(v: string) => scada.updateWidget(w.id, { title: v })} />
            </Row>
            <Row label={tt('scada.panel.lock')}>
              <NSwitch size="small" value={!!w.locked} data-scada-lock-switch onUpdateValue={(v: boolean) => scada.setLocked([w.id], v)} />
            </Row>
          </Section>
          <Section sid="binding" title={tt('scada.panel.binding') + (optionalBinding ? tt('scada.panel.optional') : '')}>
            <Row label={tt('scada.panel.source')}>
              <NSelect
                size="small"
                value={sourceId.value || null}
                options={sourceOptions.value}
                onUpdateValue={(v: string) => {
                  sourceId.value = v
                  if (w.binding && w.binding.source !== v) scada.setBinding(w.id, null)
                }}
              />
            </Row>
            <Row label={tt('scada.panel.item')}>
              <NSelect
                size="small"
                clearable
                filterable={false}
                value={w.binding && w.binding.source === sourceId.value ? w.binding.key : null}
                options={itemOptions.value as any}
                placeholder={tt('scada.panel.selectPlaceholder')}
                onUpdateValue={(v: string | null) => {
                  if (!v) {
                    scada.setBinding(w.id, null)
                    return
                  }
                  const provider = getDataSource(sourceId.value)
                  const opt = provider?.options().find(o => o.key === v)
                  scada.setBinding(w.id, { source: sourceId.value, key: v, label: opt?.label })
                }}
              />
            </Row>
            {itemOptions.value.length === 0 && <div class={'text-xs text-orange-500 mt-1'}>{tt('scada.panel.noOptions')}</div>}
            {/* 内部变量可以增删改名：从这里直接打开管理弹窗 */}
            {sourceId.value === LOCAL_SOURCE_ID ? (
              <div class={'mt-1'}>
                <NButton size="tiny" quaternary type="primary" data-scada-vars-manage onClick={() => (scada.varsShow = true)}>
                  {tt('scada.vars.manage')}
                </NButton>
              </div>
            ) : null}
          </Section>
          <Section sid="geometry" title={tt('scada.panel.geometry')}>
            {/* 两列紧凑排布：标签只占 1 个字符宽、不显示 +/- 按钮，否则 300px 侧栏里每格只剩 40px，数字显示不出来 */}
            <div class={'grid grid-cols-2 gap-x-3 gap-y-1.5 py-1'}>
              {(['x', 'y', 'w', 'h'] as const).map(k => (
                <div key={k} class={'flex items-center gap-1.5'}>
                  <span class={'w-3.5 shrink-0 text-xs text-gray-600 uppercase'}>{k}</span>
                  <NInputNumber
                    class={'flex-1 min-w-0'}
                    size="small"
                    value={vr[k]}
                    step={1}
                    min={k === 'w' ? vmin.w : k === 'h' ? vmin.h : undefined}
                    disabled={!!w.locked}
                    showButton={false}
                    onUpdateValue={(v: number | null) => setRect(k, v)}
                  />
                </div>
              ))}
            </div>
            {w.locked ? <div class={'text-[11px] text-orange-500 leading-4'}>{tt('scada.panel.lockedHint')}</div> : null}
          </Section>
          {def?.propSchema && def.propSchema.length > 0 && (
            <Section sid="props" title={tt('scada.panel.props')}>
              {def.propSchema.map(f =>
                f.type === 'color' ? (
                  <ColorField key={f.key} label={f.label()} value={w.props[f.key] || ''} clearable onUpdateValue={(v: string) => scada.setWidgetProp(w.id, f.key, v)} />
                ) : (
                  <Row key={f.key} label={f.label()}>{renderField(w, f)}</Row>
                )
              )}
            </Section>
          )}
          <Section sid="actions" title={tt('scada.panel.actions')}>
            <div class={'flex flex-wrap gap-2'}>
              <NButton size="small" onClick={() => scada.duplicateWidget(w.id)}>{tt('scada.panel.duplicate')}</NButton>
              <NPopconfirm onPositiveClick={() => scada.removeWidget(w.id)} positiveText={tt('scada.confirm')} negativeText={tt('scada.cancel')}>
                {{
                  trigger: () => <NButton size="small" type="error" ghost disabled={!!w.locked}>{tt('scada.panel.delete')}</NButton>,
                  default: () => tt('scada.panel.deleteConfirm')
                }}
              </NPopconfirm>
            </div>
          </Section>
        </>
      )
    }

    /** 多选面板的「字体」：给选中的、带文字的组件统一设置（锁定的组件也改——字体不涉及位置；与单选面板一致） */
    const renderMultiFont = (list: WidgetInstance[]) => {
      const texts = list.filter(w => getWidgetDefinition(w.type)?.hasText)
      if (!texts.length) return null
      const values = Array.from(new Set(texts.map(w => String(w.props[FONT_FAMILY_KEY] || ''))))
      const setAll = (v: string) => scada.batch(() => texts.forEach(w => scada.setWidgetProp(w.id, FONT_FAMILY_KEY, v)))
      return (
        <Section sid="multiFont" title={tt('scada.prop.fontFamily')}>
          <Row label={`${tt('scada.prop.fontFamily')} (${texts.length})`}>
            <FontField value={values.length === 1 ? values[0] : ''} mixed={values.length > 1} placeholder={tt('scada.prop.fontDefault')} onUpdateValue={setAll} />
          </Row>
        </Section>
      )
    }

    /** 多选面板：数量 / 参考对象 / 选区外接框 / 批量操作（对齐、分布、旋转、组合、锁定在顶部排列工具栏里） */
    const renderMultiPanel = () => {
      const list = scada.selectedWidgets
      const free = list.filter(w => !w.locked)
      const u = unionRect(free.map(visualRect))
      const ids = scada.selectedIds.slice()
      return (
        <>
          <Section sid="multi" title={tt('scada.multi.title')}>
            <div class={'text-xs text-gray-600 leading-5'} data-multi-info>
              <div>{tt('scada.multi.count', { n: list.length })}</div>
              <div>{tt('scada.multi.reference')}：{list[0] ? widgetName(list[0]) : ''}</div>
              {list.length > free.length ? <div class={'text-orange-500'}>{tt('scada.multi.lockedCount', { n: list.length - free.length })}</div> : null}
            </div>
            <div class={'text-[11px] text-gray-400 mt-1 leading-4'}>{tt('scada.multi.hint')}</div>
          </Section>
          {renderMultiFont(list)}
          {u ? (
            <Section sid="multiBounds" title={tt('scada.multi.bounds')}>
              <div class={'grid grid-cols-2 gap-x-3 gap-y-1.5 py-1'}>
                {(['x', 'y', 'w', 'h'] as const).map(k => (
                  <div key={k} class={'flex items-center gap-1.5'}>
                    <span class={'w-3.5 shrink-0 text-xs text-gray-600 uppercase'}>{k}</span>
                    <NInputNumber class={'flex-1 min-w-0'} size="small" value={Math.round(u[k])} step={1} showButton={false} data-multi-bounds={k} onUpdateValue={(v: number | null) => setBounds(k, v)} />
                  </div>
                ))}
              </div>
            </Section>
          ) : null}
          <Section sid="actions" title={tt('scada.panel.actions')}>
            <div class={'flex flex-wrap gap-2'}>
              <NButton size="small" data-multi-duplicate onClick={() => scada.duplicateWidgets(ids)}>{tt('scada.panel.duplicate')}</NButton>
              <NPopconfirm
                onPositiveClick={() => {
                  if (scada.removeSelected().locked && window.$message && window.$message.warning) window.$message.warning(tt('scada.tool.lockedHint'))
                }}
                positiveText={tt('scada.confirm')}
                negativeText={tt('scada.cancel')}
              >
                {{
                  trigger: () => <NButton size="small" type="error" ghost data-multi-delete>{tt('scada.panel.delete')}</NButton>,
                  default: () => tt('scada.multi.deleteConfirm', { n: list.length })
                }}
              </NPopconfirm>
            </div>
          </Section>
        </>
      )
    }

    const renderCanvasPanel = () => {
      const l = scada.current
      return (
        <>
          <Section sid="canvas" title={tt('scada.panel.canvas')}>
            <Row label={tt('scada.panel.width')}>
              <NInputNumber size="small" value={l.canvas.width} min={100} max={10000} step={10} onUpdateValue={(v: number | null) => v && scada.setCanvas({ width: Math.round(v) })} />
            </Row>
            <Row label={tt('scada.panel.height')}>
              <NInputNumber size="small" value={l.canvas.height} min={100} max={10000} step={10} onUpdateValue={(v: number | null) => v && scada.setCanvas({ height: Math.round(v) })} />
            </Row>
            <ColorField label={tt('scada.panel.background')} value={l.canvas.background} onUpdateValue={(v: string) => v && scada.setCanvas({ background: v })} />
            <Row label={tt('scada.panel.grid')}>
              <NInputNumber size="small" value={l.canvas.grid} min={1} max={100} step={1} onUpdateValue={(v: number | null) => v && scada.setCanvas({ grid: Math.round(v) })} />
            </Row>
            <div class={'flex flex-wrap gap-2 mt-2'}>
              <NButton
                size="small"
                disabled={!props.screenSize.w || !props.screenSize.h}
                onClick={() => scada.setCanvas({ width: Math.round(props.screenSize.w), height: Math.round(props.screenSize.h) })}
              >
                {tt('scada.fitScreen')} ({Math.round(props.screenSize.w)}×{Math.round(props.screenSize.h)})
              </NButton>
              <NPopconfirm onPositiveClick={() => scada.clearWidgets()} positiveText={tt('scada.confirm')} negativeText={tt('scada.cancel')}>
                {{
                  trigger: () => <NButton size="small" type="error" ghost disabled={!l.widgets.length}>{tt('scada.clear')}</NButton>,
                  default: () => tt('scada.clearConfirm')
                }}
              </NPopconfirm>
            </div>
          </Section>
          <div class={'px-3 py-3 text-xs text-gray-500 leading-5'}>
            <div>{tt('scada.panel.widgetCount')}: {l.widgets.length}</div>
            <div>{tt('scada.panel.noneSelected')}</div>
          </div>
        </>
      )
    }

    /** 底部：打开数据处理函数弹窗的按钮，按钮上标出已启用 / 出错 */
    const renderFooter = (w: WidgetInstance) => {
      const code = (w.transform || '').trim()
      const error = transformErrors[w.id]
      const suffix = code ? ` · ${error ? tt('scada.panel.transformError') : tt('scada.panel.transformEnabled')}` : ''
      return (
        <div class={'shrink-0 px-3 py-2 border-0 border-t border-solid border-gray-200 bg-white'}>
          <NButton class={'w-full'} size="small" secondary type={error ? 'error' : code ? 'primary' : 'default'} onClick={() => (transformShow.value = true)}>
            {tt('scada.panel.transform')}{suffix}
          </NButton>
        </div>
      )
    }

    return () => (
      <div class={'h-full flex flex-col bg-white'}>
        <div class={'px-3 py-2 text-sm font-bold border-0 border-b border-solid border-gray-200 shrink-0'}>{tt('scada.properties')}</div>
        {/* 悬浮滚动条：NScrollbar 隐藏原生滚动条、把滑轨浮在内容之上，不挤压内部宽度；trigger=none 让滑轨常显（触摸屏没有 hover） */}
        <NScrollbar class={'flex-1 min-h-0'} trigger="none">
          {/* 多栏时把 columns 放在内层：外层高度固定 + 多栏会横向溢出，内层高度自适应才能按内容均分两栏 */}
          <div class={props.columns >= 2 ? 'columns-2 gap-0' : ''}>
            {selected.value ? renderWidgetPanel(selected.value) : scada.selectedIds.length > 1 ? renderMultiPanel() : renderCanvasPanel()}
          </div>
        </NScrollbar>
        {selected.value && renderFooter(selected.value)}
        <TransformDialog show={transformShow.value} widget={selected.value} onClose={() => (transformShow.value = false)} />
        <CodeDialog
          show={!!codeField.value && !!selected.value && codeField.value.widgetId === selected.value.id}
          title={`${definition.value ? definition.value.label() : ''} · ${codeField.value ? codeField.value.field.label() : ''}`}
          field={codeField.value?.field}
          values={codeField.value && selected.value ? Object.fromEntries(codeParts(codeField.value.field).map(p => [p.key, String(selected.value!.props[p.key] ?? '')])) : {}}
          onApply={(values: Record<string, string>) => {
            const cf = codeField.value
            if (!cf) return
            const w = scada.draft?.widgets.find(e => e.id === cf.widgetId)
            // HTML / CSS 同时改了也只算撤销历史里的一步
            scada.batch(() =>
              codeParts(cf.field).forEach(p => {
                // 只写回真正改动的段，避免无谓地触发 iframe 重载
                if (!w || String(w.props[p.key] ?? '') !== String(values[p.key] ?? '')) scada.setWidgetProp(cf.widgetId, p.key, values[p.key] ?? '')
              })
            )
          }}
          onClose={() => (codeField.value = null)}
        />
      </div>
    )
  }
})
