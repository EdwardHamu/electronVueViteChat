/**
 * 表格：列出某个数据源的全部数据项（名称 / 当前值 / 单位 / 状态 / 更新时间），不需要逐个绑定。
 * 按需订阅列出来的每个数据项（轮询型数据源只会请求表里出现的项）。
 */
import { computed, defineComponent, onBeforeUnmount, watch } from 'vue'
import { dataSourceList, getDataSource } from '../dataSource'
import type { BindingOption, DataPoint, WidgetDefinition } from '../types'
import { icons } from './icons'
import { pointText, statusColor, tt, widgetProps } from './common'
import { formatDate } from './controlCommon'

const TableWidget = defineComponent({
  name: 'ScadaTable',
  props: widgetProps,
  setup(props) {
    const p = computed(() => props.widget.props)
    const provider = computed(() => getDataSource(p.value.source) || dataSourceList()[0])
    const rows = computed(() => {
      const prov = provider.value
      if (!prov) return [] as { o: BindingOption; point?: DataPoint }[]
      const max = Number(p.value.maxRows) > 0 ? Number(p.value.maxRows) : Infinity
      return prov.options().slice(0, max).map(o => ({ o, point: prov.read(o.key) }))
    })
    // 订阅表里出现的数据项；数据源 / 项目列表变化时重新订阅
    let unsubs: (() => void)[] = []
    const clear = () => {
      unsubs.forEach(u => u())
      unsubs = []
    }
    watch(
      () => `${provider.value?.id || ''}|${rows.value.map(r => r.o.key).join(',')}`,
      () => {
        clear()
        const prov = provider.value
        if (!prov || !prov.subscribe) return
        unsubs = rows.value.map(r => prov.subscribe!(r.o.key))
      },
      { immediate: true }
    )
    onBeforeUnmount(clear)

    return () => {
      const fs = Number(p.value.fontSize) > 0 ? Number(p.value.fontSize) : 14
      const cell = 'px-2 whitespace-nowrap overflow-hidden text-ellipsis'
      const cellStyle = { height: fs * 2 + 'px', borderBottom: '1px solid rgba(0,0,0,.08)' }
      const cols = { unit: p.value.showUnit !== false, status: p.value.showStatus !== false, time: !!p.value.showTime }
      return (
        <div class={'w-full h-full overflow-auto'} style={{ background: p.value.bg || '#ffffff', color: p.value.fg || '#1f2937', fontSize: fs + 'px', borderRadius: (Number(p.value.radius) || 0) + 'px', border: p.value.border === false ? 'none' : '1px solid #cbd5e1' }} data-scada-table>
          <table class={'w-full border-collapse'} style={{ tableLayout: 'auto' }}>
            {p.value.header !== false && (
              <thead class={'sticky top-0'} style={{ background: p.value.headerBg || '#e2e8f0' }}>
                <tr>
                  <th class={cell + ' text-left font-bold'} style={cellStyle}>{tt('scada.table.name')}</th>
                  <th class={cell + ' text-right font-bold'} style={cellStyle}>{tt('scada.table.value')}</th>
                  {cols.unit && <th class={cell + ' text-left font-bold'} style={cellStyle}>{tt('scada.table.unit')}</th>}
                  {cols.status && <th class={cell + ' text-center font-bold'} style={cellStyle}>{tt('scada.table.status')}</th>}
                  {cols.time && <th class={cell + ' text-left font-bold'} style={cellStyle}>{tt('scada.table.time')}</th>}
                </tr>
              </thead>
            )}
            <tbody>
              {rows.value.map((r, i) => {
                const pt = r.point
                const st = pt ? pt.status : 'offline'
                return (
                  <tr key={r.o.key} style={{ background: p.value.stripe !== false && i % 2 ? 'rgba(0,0,0,.03)' : 'transparent' }}>
                    <td class={cell} style={cellStyle}>{r.o.group && p.value.showGroup ? `${r.o.group} / ${r.o.label}` : r.o.label}</td>
                    <td class={cell + ' text-right font-bold'} style={{ ...cellStyle, fontVariantNumeric: 'tabular-nums', color: st === 'high' || st === 'low' ? statusColor(pt) : 'inherit' }}>{pointText(pt, p.value.decimals)}</td>
                    {cols.unit && <td class={cell + ' opacity-70'} style={cellStyle}>{pt?.unit || r.o.unit || ''}</td>}
                    {cols.status && (
                      <td class={cell + ' text-center'} style={cellStyle}>
                        <span class={'inline-block rounded-full align-middle'} style={{ width: fs * 0.7 + 'px', height: fs * 0.7 + 'px', background: statusColor(pt) }} title={tt('scada.status.' + st)} />
                      </td>
                    )}
                    {cols.time && <td class={cell + ' opacity-70'} style={cellStyle}>{pt?.time ? formatDate(pt.time, 'HH:mm:ss') : '--'}</td>}
                  </tr>
                )
              })}
              {rows.value.length === 0 && (
                <tr>
                  <td class={cell + ' text-gray-400'} style={cellStyle} colspan={5}>{tt('scada.panel.noOptions')}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )
    }
  }
})

export const tableDefinition: WidgetDefinition = {
  type: 'table',
  hasText: true,
  label: () => tt('scada.widget.table'),
  description: () => tt('scada.widget.tableDesc'),
  icon: icons.table,
  category: 'control',
  defaultSize: { w: 360, h: 220 },
  minSize: { w: 80, h: 40 },
  needsBinding: false,
  defaultProps: () => ({ source: 'product', maxRows: 0, decimals: null, showUnit: true, showStatus: true, showTime: false, showGroup: false, header: true, stripe: true, fontSize: 14, bg: '#ffffff', fg: '#1f2937', headerBg: '#e2e8f0', border: true, radius: 4 }),
  propSchema: [
    { key: 'source', label: () => tt('scada.panel.source'), type: 'select', options: () => dataSourceList().map(s => ({ label: s.label(), value: s.id })) },
    { key: 'maxRows', label: () => tt('scada.prop.maxRows'), type: 'number', min: 0, max: 200, step: 1, placeholder: '0 = all' },
    { key: 'decimals', label: () => tt('scada.prop.decimals'), type: 'number', min: 0, max: 8, step: 1, placeholder: 'auto' },
    { key: 'showGroup', label: () => tt('scada.prop.showGroup'), type: 'boolean' },
    { key: 'showUnit', label: () => tt('scada.prop.showUnit'), type: 'boolean' },
    { key: 'showStatus', label: () => tt('scada.prop.showStatus'), type: 'boolean' },
    { key: 'showTime', label: () => tt('scada.prop.showTime'), type: 'boolean' },
    { key: 'header', label: () => tt('scada.prop.header'), type: 'boolean' },
    { key: 'stripe', label: () => tt('scada.prop.stripe'), type: 'boolean' },
    { key: 'fontSize', label: () => tt('scada.prop.fontSize'), type: 'number', min: 8, max: 60, step: 1 },
    { key: 'border', label: () => tt('scada.prop.border'), type: 'boolean' },
    { key: 'radius', label: () => tt('scada.prop.radius'), type: 'number', min: 0, max: 40, step: 1 },
    { key: 'headerBg', label: () => tt('scada.prop.headerBg'), type: 'color' },
    { key: 'bg', label: () => tt('scada.prop.bg'), type: 'color' },
    { key: 'fg', label: () => tt('scada.prop.fg'), type: 'color' }
  ],
  component: TableWidget
}

export default TableWidget
