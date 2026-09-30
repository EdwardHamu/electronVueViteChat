/**
 * 示例组件：数值卡片——名称 + 当前值 + 单位，边框颜色随公差状态变化
 */
import { computed, defineComponent } from 'vue'
import { formatValue } from '../geometry'
import type { WidgetDefinition } from '../types'
import { autoFontSize, displayName, pointText, statusColor, tt, widgetProps } from './common'
import { icons } from './icons'

const ValueCard = defineComponent({
  name: 'ScadaValueCard',
  props: widgetProps,
  setup(props) {
    const p = computed(() => props.widget.props)
    const color = computed(() => statusColor(props.point))
    const text = computed(() => pointText(props.point, p.value.decimals))
    const fontSize = computed(() => {
      if (p.value.fontSize > 0) return p.value.fontSize
      const unitChars = p.value.showUnit && props.point?.unit ? props.point.unit.length * 0.7 + 0.5 : 0
      const headerH = p.value.showTitle ? 28 : 0
      const footerH = p.value.showLimits ? 22 : 0
      return autoFontSize(props.widget.w - 16, (props.widget.h - headerH - footerH) * 0.72, text.value.length + unitChars, 0.62)
    })
    return () => {
      const point = props.point
      const name = displayName(props.widget, point)
      return (
        <div class={'w-full h-full flex flex-col rounded-md overflow-hidden border-2 border-solid'}
          style={{ borderColor: color.value, background: p.value.bg || '#ffffff', color: p.value.fg || '#1f2937' }}>
          {p.value.showTitle && (
            <div class={'px-2 leading-7 text-sm truncate shrink-0'} style={{ background: color.value + '26' }}>
              {name || tt('scada.widget.unbound')}
            </div>
          )}
          <div class={'flex-1 min-h-0 flex items-baseline justify-center px-2 overflow-hidden value-number font-bold'}
            style={{ fontSize: fontSize.value + 'px', lineHeight: 1 }}>
            <span class={'self-center'}>{text.value}</span>
            {p.value.showUnit && point?.unit && <span class={'ml-1 self-center'} style={{ fontSize: Math.max(10, fontSize.value * 0.4) + 'px' }}>{point.unit}</span>}
          </div>
          {p.value.showLimits && (
            <div class={'px-2 pb-1 text-xs flex justify-between shrink-0 opacity-80'}>
              <span>SV {formatValue(point?.standard, point?.precision)}</span>
              <span>{formatValue(point?.lower, point?.precision)} ~ {formatValue(point?.upper, point?.precision)}</span>
            </div>
          )}
        </div>
      )
    }
  }
})

export const valueCardDefinition: WidgetDefinition = {
  type: 'valueCard',
  hasText: true,
  label: () => tt('scada.widget.valueCard'),
  description: () => tt('scada.widget.valueCardDesc'),
  icon: icons.valueCard,
  category: 'data',
  defaultSize: { w: 220, h: 120 },
  minSize: { w: 80, h: 50 },
  needsBinding: true,
  defaultProps: () => ({ showTitle: true, showUnit: true, showLimits: true, decimals: null, fontSize: 0, bg: '#ffffff', fg: '#1f2937' }),
  propSchema: [
    { key: 'showTitle', label: () => tt('scada.prop.showTitle'), type: 'boolean' },
    { key: 'showUnit', label: () => tt('scada.prop.showUnit'), type: 'boolean' },
    { key: 'showLimits', label: () => tt('scada.prop.showLimits'), type: 'boolean' },
    { key: 'decimals', label: () => tt('scada.prop.decimals'), type: 'number', min: 0, max: 8, step: 1, placeholder: 'auto' },
    { key: 'fontSize', label: () => tt('scada.prop.fontSize'), type: 'number', min: 0, max: 300, step: 1, placeholder: '0 = auto' },
    { key: 'bg', label: () => tt('scada.prop.bg'), type: 'color' },
    { key: 'fg', label: () => tt('scada.prop.fg'), type: 'color' }
  ],
  component: ValueCard
}

export default ValueCard
