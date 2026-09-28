/**
 * 属性面板：选中组件时编辑标题 / 数据绑定 / 位置尺寸 / 组件自定义属性（按 propSchema 通用渲染）；
 * 未选中时编辑画布本身（尺寸、背景、网格）。
 */
import { NButton, NColorPicker, NInput, NInputNumber, NPopconfirm, NSelect, NSwitch } from 'naive-ui'
import { computed, defineComponent, ref, watch, type PropType } from 'vue'
import { dataSourceList, getDataSource } from './dataSource'
import { getWidgetDefinition } from './registry'
import { useScadaStore } from './store'
import type { PropField, WidgetInstance } from './types'
import { tt } from './widgets/common'

const Row = (props: { label: string }, { slots }: { slots: any }) => (
  <div class={'flex items-center gap-2 py-1'}>
    <div class={'w-[88px] shrink-0 text-xs text-gray-600 truncate'} title={props.label}>{props.label}</div>
    <div class={'flex-1 min-w-0'}>{slots.default && slots.default()}</div>
  </div>
)

const Section = (props: { title: string }, { slots }: { slots: any }) => (
  <div class={'px-3 py-2 border-0 border-b border-solid border-gray-200'}>
    <div class={'text-xs font-bold text-gray-500 mb-1'}>{props.title}</div>
    {slots.default && slots.default()}
  </div>
)

export default defineComponent({
  name: 'ScadaPropertyPanel',
  props: {
    /** 组态页可视区域尺寸，用于"适配当前屏幕" */
    screenSize: { type: Object as PropType<{ w: number; h: number }>, default: () => ({ w: 0, h: 0 }) }
  },
  setup(props) {
    const scada = useScadaStore()
    const selected = computed(() => scada.selected)
    const definition = computed(() => (selected.value ? getWidgetDefinition(selected.value.type) : undefined))

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

    const renderField = (w: WidgetInstance, f: PropField) => {
      const value = w.props[f.key]
      const set = (v: any) => scada.setWidgetProp(w.id, f.key, v)
      switch (f.type) {
        case 'boolean':
          return <NSwitch value={!!value} onUpdateValue={set} size="small" />
        case 'number':
          return (
            <NInputNumber
              class={'w-full'}
              size="small"
              value={value === null || value === undefined || value === '' ? null : Number(value)}
              min={f.min}
              max={f.max}
              step={f.step}
              placeholder={f.placeholder || ''}
              onUpdateValue={(v: number | null) => set(v)}
            />
          )
        case 'color':
          return <NColorPicker size="small" value={value || null} modes={['hex']} showAlpha={false} actions={['clear']} onUpdateValue={(v: string | null) => set(v || '')} />
        case 'select':
          return <NSelect size="small" value={value ?? null} options={f.options ? f.options() : []} onUpdateValue={set} />
        default:
          return <NInput size="small" value={value ?? ''} placeholder={f.placeholder || ''} onUpdateValue={set} />
      }
    }

    const renderWidgetPanel = (w: WidgetInstance) => {
      const def = definition.value
      return (
        <>
          <Section title={`${tt('scada.panel.widget')} · ${def ? def.label() : w.type}`}>
            <Row label={tt('scada.panel.title')}>
              <NInput size="small" value={w.title || ''} placeholder={tt('scada.panel.titlePlaceholder')} onUpdateValue={(v: string) => scada.updateWidget(w.id, { title: v })} />
            </Row>
          </Section>
          {def?.needsBinding !== false && (
            <Section title={tt('scada.panel.binding')}>
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
          )}
          <Section title={tt('scada.panel.geometry')}>
            <div class={'grid grid-cols-2 gap-x-2'}>
              <Row label="X"><NInputNumber size="small" value={w.x} step={1} onUpdateValue={(v: number | null) => setRect('x', v)} /></Row>
              <Row label="Y"><NInputNumber size="small" value={w.y} step={1} onUpdateValue={(v: number | null) => setRect('y', v)} /></Row>
              <Row label="W"><NInputNumber size="small" value={w.w} step={1} min={def?.minSize?.w || 20} onUpdateValue={(v: number | null) => setRect('w', v)} /></Row>
              <Row label="H"><NInputNumber size="small" value={w.h} step={1} min={def?.minSize?.h || 20} onUpdateValue={(v: number | null) => setRect('h', v)} /></Row>
            </div>
          </Section>
          {def?.propSchema && def.propSchema.length > 0 && (
            <Section title={tt('scada.panel.props')}>
              {def.propSchema.map(f => (
                <Row key={f.key} label={f.label()}>{renderField(w, f)}</Row>
              ))}
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
            <Row label={tt('scada.panel.background')}>
              <NColorPicker size="small" value={l.canvas.background} modes={['hex']} showAlpha={false} onUpdateValue={(v: string) => scada.setCanvas({ background: v })} />
            </Row>
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

    return () => (
      <div class={'h-full flex flex-col bg-white'}>
        <div class={'px-3 py-2 text-sm font-bold border-0 border-b border-solid border-gray-200 shrink-0'}>{tt('scada.properties')}</div>
        <div class={'flex-1 overflow-y-auto'}>{selected.value ? renderWidgetPanel(selected.value) : renderCanvasPanel()}</div>
      </div>
    )
  }
})
