/**
 * 属性面板：选中组件时编辑标题 / 数据绑定 / 位置尺寸 / 组件自定义属性（按 propSchema 通用渲染）；
 * 未选中时编辑画布本身（尺寸、背景、网格）。columns = 2 时（竖屏放在画布下方）各区块分两栏排布。
 * 数据处理函数（JS）通过面板底部的按钮打开 TransformDialog 弹窗编辑。
 * 颜色类字段用 ColorField（预设颜色表 + 调色盘，行内展开），不用 NColorPicker 的弹层。
 */
import { NButton, NInput, NInputNumber, NPopconfirm, NScrollbar, NSelect, NSwitch } from 'naive-ui'
import { computed, defineComponent, ref, watch, type PropType } from 'vue'
import ColorField from './ColorField'
import { dataSourceList, getDataSource } from './dataSource'
import { getWidgetDefinition } from './registry'
import { useScadaStore } from './store'
import { transformErrors } from './transform'
import TransformDialog from './TransformDialog'
import type { PropField, WidgetInstance } from './types'
import { tt } from './widgets/common'

/** 本地图片存进布局的上限（data URL 会随布局一起进 localStorage） */
export const IMAGE_MAX_BYTES = 300 * 1024

const Row = (props: { label: string }, { slots }: { slots: any }) => (
  <div class={'flex items-center gap-2 py-1'}>
    <div class={'w-[88px] shrink-0 text-xs text-gray-600 truncate'} title={props.label}>{props.label}</div>
    <div class={'flex-1 min-w-0'}>{slots.default && slots.default()}</div>
  </div>
)

const Section = (props: { title: string }, { slots }: { slots: any }) => (
  <div class={'px-3 py-2 border-0 border-b border-solid border-gray-200 break-inside-avoid'}>
    <div class={'text-xs font-bold text-gray-500 mb-1'}>{props.title}</div>
    {slots.default && slots.default()}
  </div>
)

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

    const setRect = (key: 'x' | 'y' | 'w' | 'h', v: number | null) => {
      const w = selected.value
      if (!w || v === null || !Number.isFinite(v)) return
      scada.updateWidgetRect(w.id, { x: w.x, y: w.y, w: w.w, h: w.h, [key]: v })
    }

    /** 图片字段：选择本地文件读成 data URL 存进布局（localStorage 容量有限，单张限制 IMAGE_MAX_BYTES） */
    const pickImage = (w: WidgetInstance, key: string) => {
      if (typeof document === 'undefined') return
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = 'image/*'
      input.onchange = () => {
        const file = input.files && input.files[0]
        if (!file) return
        if (file.size > IMAGE_MAX_BYTES) {
          window.$message?.warning(tt('scada.panel.imageTooLarge').replace('{kb}', String(Math.round(IMAGE_MAX_BYTES / 1024))))
          return
        }
        const reader = new FileReader()
        reader.onload = () => {
          if (typeof reader.result === 'string') scada.setWidgetProp(w.id, key, reader.result)
        }
        reader.readAsDataURL(file)
      }
      input.click()
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
              <div class={'flex items-center gap-1'}>
                <NButton size="tiny" onClick={() => pickImage(w, f.key)}>{tt('scada.panel.chooseImage')}</NButton>
                {value && String(value).startsWith('data:') && <span class={'text-[10px] text-gray-400'}>{Math.round((String(value).length * 3) / 4 / 1024)} KB</span>}
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
          return <NSelect size="small" value={value ?? null} options={f.options ? f.options() : []} onUpdateValue={set} />
        default:
          return <NInput size="small" value={value ?? ''} placeholder={ph} onUpdateValue={set} />
      }
    }

    const renderWidgetPanel = (w: WidgetInstance) => {
      const def = definition.value
      const optionalBinding = def?.needsBinding === false
      return (
        <>
          <Section title={`${tt('scada.panel.widget')} · ${def ? def.label() : w.type}`}>
            <Row label={tt('scada.panel.title')}>
              <NInput size="small" value={w.title || ''} placeholder={tt('scada.panel.titlePlaceholder')} onUpdateValue={(v: string) => scada.updateWidget(w.id, { title: v })} />
            </Row>
          </Section>
          <Section title={tt('scada.panel.binding') + (optionalBinding ? tt('scada.panel.optional') : '')}>
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
          </Section>
          <Section title={tt('scada.panel.geometry')}>
            {/* 两列紧凑排布：标签只占 1 个字符宽、不显示 +/- 按钮，否则 300px 侧栏里每格只剩 40px，数字显示不出来 */}
            <div class={'grid grid-cols-2 gap-x-3 gap-y-1.5 py-1'}>
              {(['x', 'y', 'w', 'h'] as const).map(k => (
                <div key={k} class={'flex items-center gap-1.5'}>
                  <span class={'w-3.5 shrink-0 text-xs text-gray-600 uppercase'}>{k}</span>
                  <NInputNumber
                    class={'flex-1 min-w-0'}
                    size="small"
                    value={w[k]}
                    step={1}
                    min={k === 'w' ? def?.minSize?.w || 20 : k === 'h' ? def?.minSize?.h || 20 : undefined}
                    showButton={false}
                    onUpdateValue={(v: number | null) => setRect(k, v)}
                  />
                </div>
              ))}
            </div>
          </Section>
          {def?.propSchema && def.propSchema.length > 0 && (
            <Section title={tt('scada.panel.props')}>
              {def.propSchema.map(f =>
                f.type === 'color' ? (
                  <ColorField key={f.key} label={f.label()} value={w.props[f.key] || ''} clearable onUpdateValue={(v: string) => scada.setWidgetProp(w.id, f.key, v)} />
                ) : (
                  <Row key={f.key} label={f.label()}>{renderField(w, f)}</Row>
                )
              )}
            </Section>
          )}
          <Section title={tt('scada.panel.actions')}>
            <div class={'flex flex-wrap gap-2'}>
              <NButton size="small" onClick={() => scada.bringToFront(w.id)}>{tt('scada.panel.front')}</NButton>
              <NButton size="small" onClick={() => scada.sendToBack(w.id)}>{tt('scada.panel.back')}</NButton>
              <NButton size="small" onClick={() => scada.duplicateWidget(w.id)}>{tt('scada.panel.duplicate')}</NButton>
              <NPopconfirm onPositiveClick={() => scada.removeWidget(w.id)} positiveText={tt('scada.confirm')} negativeText={tt('scada.cancel')}>
                {{
                  trigger: () => <NButton size="small" type="error" ghost>{tt('scada.panel.delete')}</NButton>,
                  default: () => tt('scada.panel.deleteConfirm')
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
          <Section title={tt('scada.panel.canvas')}>
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
          <div class={props.columns >= 2 ? 'columns-2 gap-0' : ''}>{selected.value ? renderWidgetPanel(selected.value) : renderCanvasPanel()}</div>
        </NScrollbar>
        {selected.value && renderFooter(selected.value)}
        <TransformDialog show={transformShow.value} widget={selected.value} onClose={() => (transformShow.value = false)} />
      </div>
    )
  }
})
