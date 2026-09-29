/**
 * 示例组件：文本标签——默认不绑定数据的纯装饰组件（标题、区域说明等）；
 * 绑定数据后显示数据值 / 处理函数输出的文本（可用处理函数拼出 "外径 1.523 mm" 这类动态文字）。
 */
import { computed, defineComponent } from 'vue'
import type { WidgetDefinition } from '../types'
import { autoFontSize, pointText, tt, widgetProps } from './common'
import { icons } from './icons'

const TextLabel = defineComponent({
  name: 'ScadaTextLabel',
  props: widgetProps,
  setup(props) {
    const p = computed(() => props.widget.props)
    const text = computed(() => {
      if (props.widget.binding) {
        const point = props.point
        if (point && (point.value !== null || point.text)) return pointText(point, p.value.decimals) + (p.value.showUnit && point.unit ? ' ' + point.unit : '')
        return (p.value.text as string) || props.widget.title || '--'
      }
      return (p.value.text as string) || props.widget.title || ''
    })
    const fontSize = computed(() => {
      if (p.value.fontSize > 0) return p.value.fontSize
      return autoFontSize(props.widget.w - 12, props.widget.h * 0.7, Math.max(1, text.value.length), 1)
    })
    return () => {
      const align = p.value.align || 'center'
      return (
        <div class={'w-full h-full flex items-center px-1.5 overflow-hidden'}
          style={{
            background: p.value.bg || 'transparent',
            color: p.value.fg || '#1f2937',
            justifyContent: align === 'left' ? 'flex-start' : align === 'right' ? 'flex-end' : 'center',
            fontSize: fontSize.value + 'px',
            fontWeight: p.value.bold === false ? 'normal' : 'bold',
            borderRadius: (p.value.radius || 0) + 'px',
            border: p.value.border ? `1px solid ${p.value.fg || '#1f2937'}` : 'none',
            lineHeight: 1.1
          }}>
          <span class={'truncate'} style={{ opacity: text.value ? 1 : 0.4 }}>{text.value || (props.editing ? tt('scada.widget.textPlaceholder') : '')}</span>
        </div>
      )
    }
  }
})

export const textLabelDefinition: WidgetDefinition = {
  type: 'textLabel',
  label: () => tt('scada.widget.textLabel'),
  description: () => tt('scada.widget.textLabelDesc'),
  icon: icons.textLabel,
  category: 'shape',
  defaultSize: { w: 240, h: 50 },
  minSize: { w: 30, h: 20 },
  needsBinding: false,
  defaultProps: () => ({ text: '', fontSize: 0, align: 'center', bold: true, border: false, radius: 0, bg: '', fg: '#1f2937', decimals: null, showUnit: true }),
  propSchema: [
    { key: 'text', label: () => tt('scada.prop.text'), type: 'text' },
    { key: 'decimals', label: () => tt('scada.prop.decimals'), type: 'number', min: 0, max: 8, step: 1, placeholder: 'auto' },
    { key: 'showUnit', label: () => tt('scada.prop.showUnit'), type: 'boolean' },
    { key: 'fontSize', label: () => tt('scada.prop.fontSize'), type: 'number', min: 0, max: 300, step: 1, placeholder: '0 = auto' },
    {
      key: 'align', label: () => tt('scada.prop.align'), type: 'select',
      options: () => [
        { label: tt('scada.prop.alignLeft'), value: 'left' },
        { label: tt('scada.prop.alignCenter'), value: 'center' },
        { label: tt('scada.prop.alignRight'), value: 'right' }
      ]
    },
    { key: 'bold', label: () => tt('scada.prop.bold'), type: 'boolean' },
    { key: 'border', label: () => tt('scada.prop.border'), type: 'boolean' },
    { key: 'radius', label: () => tt('scada.prop.radius'), type: 'number', min: 0, max: 100, step: 1 },
    { key: 'bg', label: () => tt('scada.prop.bg'), type: 'color' },
    { key: 'fg', label: () => tt('scada.prop.fg'), type: 'color' }
  ],
  component: TextLabel
}

export default TextLabel
