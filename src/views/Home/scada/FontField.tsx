/**
 * 属性面板的「字体」字段（PropFieldType 'font'）：可搜索的下拉，每个选项用它自己的字体显示；空 = 默认字体。
 * 第一次点开时用 canvas 探测常见字体（fonts.ts ensureFonts），同时在这次点击（用户手势）里请求 Local Font Access 权限，
 * 允许后列出本机全部字体。当前值不在列表里（布局来自别的电脑、本机没装）时也保留为一个选项，标「未安装」。
 */
import { NSelect, type SelectOption } from 'naive-ui'
import { computed, defineComponent, h, type PropType } from 'vue'
import { ensureFonts, fontFamilyCss, fontLabel, fontState, requestLocalFonts } from './fonts'
import { tt } from './widgets/common'

export default defineComponent({
  name: 'ScadaFontField',
  props: {
    value: { type: String as PropType<string | null>, default: null },
    placeholder: { type: String, default: '' },
    /** 多选面板：各组件字体不同时显示「多个值」提示 */
    mixed: { type: Boolean, default: false }
  },
  emits: ['update:value'],
  setup(props, { emit }) {
    const options = computed<SelectOption[]>(() => {
      const list = fontState.list.map(name => ({ label: fontLabel(name), value: name }))
      const cur = props.value
      if (cur && !fontState.list.some(n => n.toLowerCase() === cur.toLowerCase())) {
        // 列表还没加载，或者本机没装：保留当前值
        list.unshift({ label: fontState.detected ? `${fontLabel(cur)} · ${tt('scada.prop.fontNotInstalled')}` : fontLabel(cur), value: cur })
      }
      return list
    })
    const onShow = (show: boolean) => {
      if (!show) return
      ensureFonts()
      void requestLocalFonts()
    }
    const renderLabel = (option: SelectOption) =>
      h('span', { style: { fontFamily: fontFamilyCss(option.value) }, title: String(option.value) }, String(option.label))
    return () => (
      <NSelect
        size="small"
        filterable
        clearable
        value={props.value || null}
        options={options.value}
        placeholder={props.mixed ? tt('scada.prop.fontMixed') : props.placeholder}
        loading={fontState.local === 'loading'}
        renderLabel={renderLabel}
        consistentMenuWidth={false}
        data-scada-font-field
        onUpdateShow={onShow}
        onUpdateValue={(v: string | null) => emit('update:value', v || '')}
      />
    )
  }
})
