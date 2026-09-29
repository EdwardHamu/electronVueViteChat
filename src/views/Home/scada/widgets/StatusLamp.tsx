/**
 * 示例组件：状态灯——颜色随公差状态（正常 / 超上限 / 超下限 / 无数据）变化，可选显示当前值
 */
import { computed, defineComponent } from 'vue'
import type { PointStatus, WidgetDefinition } from '../types'
import { displayName, pointText, statusColor, tt, widgetProps } from './common'
import { icons } from './icons'

const StatusLamp = defineComponent({
  name: 'ScadaStatusLamp',
  props: widgetProps,
  setup(props) {
    const p = computed(() => props.widget.props)
    const color = computed(() => {
      const overrides: Partial<Record<PointStatus, string>> = {}
      if (p.value.okColor) overrides.ok = p.value.okColor
      if (p.value.highColor) overrides.high = p.value.highColor
      if (p.value.lowColor) overrides.low = p.value.lowColor
      if (p.value.offlineColor) overrides.offline = p.value.offlineColor
      return statusColor(props.point, overrides)
    })
    const statusText = computed(() => {
      const s: PointStatus = props.point ? props.point.status : 'offline'
      return tt('scada.status.' + s)
    })
    return () => {
      const point = props.point
      const name = displayName(props.widget, point)
      const vertical = p.value.layout === 'vertical'
      const size = vertical
        ? Math.max(16, Math.min(props.widget.w, props.widget.h - (p.value.showValue ? 44 : 24)) * 0.7)
        : Math.max(16, Math.min(props.widget.h * 0.7, props.widget.w * 0.35))
      return (
        <div class={['w-full h-full rounded-md overflow-hidden border border-solid border-gray-300 flex items-center gap-2 px-2', vertical ? 'flex-col justify-center' : 'flex-row']}
          style={{ background: p.value.bg || '#ffffff', color: p.value.fg || '#1f2937' }}>
          <div class={'rounded-full shrink-0 transition-colors duration-300'}
            style={{
              width: size + 'px', height: size + 'px', background: color.value,
              boxShadow: `inset 0 ${size * 0.08}px ${size * 0.2}px rgba(255,255,255,.55), inset 0 -${size * 0.08}px ${size * 0.2}px rgba(0,0,0,.35), 0 0 ${size * 0.3}px ${color.value}`
            }} />
          <div class={['min-w-0 flex flex-col', vertical ? 'items-center text-center' : 'items-start']}>
            <div class={'truncate w-full font-bold'} style={{ fontSize: Math.max(12, Math.min(28, props.widget.h * 0.22)) + 'px' }}>{name || tt('scada.widget.unbound')}</div>
            <div class={'text-xs opacity-80 truncate w-full'}>
              {statusText.value}
              {p.value.showValue && point && <span class={'ml-1 value-number'}>{pointText(point, p.value.decimals)}{point.unit ? ' ' + point.unit : ''}</span>}
            </div>
          </div>
        </div>
      )
    }
  }
})

export const statusLampDefinition: WidgetDefinition = {
  type: 'statusLamp',
  label: () => tt('scada.widget.statusLamp'),
  description: () => tt('scada.widget.statusLampDesc'),
  icon: icons.statusLamp,
  category: 'data',
  defaultSize: { w: 200, h: 80 },
  minSize: { w: 60, h: 40 },
  needsBinding: true,
  defaultProps: () => ({ layout: 'horizontal', showValue: true, decimals: null, okColor: '', highColor: '', lowColor: '', offlineColor: '', bg: '#ffffff', fg: '#1f2937' }),
  propSchema: [
    {
      key: 'layout', label: () => tt('scada.prop.layout'), type: 'select',
      options: () => [
        { label: tt('scada.prop.horizontal'), value: 'horizontal' },
        { label: tt('scada.prop.vertical'), value: 'vertical' }
      ]
    },
    { key: 'showValue', label: () => tt('scada.prop.showValue'), type: 'boolean' },
    { key: 'decimals', label: () => tt('scada.prop.decimals'), type: 'number', min: 0, max: 8, step: 1, placeholder: 'auto' },
    { key: 'okColor', label: () => tt('scada.status.ok'), type: 'color' },
    { key: 'highColor', label: () => tt('scada.status.high'), type: 'color' },
    { key: 'lowColor', label: () => tt('scada.status.low'), type: 'color' },
    { key: 'offlineColor', label: () => tt('scada.status.offline'), type: 'color' },
    { key: 'bg', label: () => tt('scada.prop.bg'), type: 'color' },
    { key: 'fg', label: () => tt('scada.prop.fg'), type: 'color' }
  ],
  component: StatusLamp
}

export default StatusLamp
