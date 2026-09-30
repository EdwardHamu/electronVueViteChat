/**
 * 组态组件注册表。新增组件：写一个渲染组件 + WidgetDefinition，然后 registerWidget()。
 */
import { shallowReactive } from 'vue'
import type { PropField, WidgetDefinition } from './types'
import { FONT_FAMILY_KEY } from './fonts'
import { tt } from './widgets/common'

const definitions = shallowReactive<WidgetDefinition[]>([])

/** 字体属性放在这些字号类属性后面 */
const SIZE_KEYS = ['fontSize', 'textSize', 'captionSize']

export const fontFamilyField = (): PropField => ({
  key: FONT_FAMILY_KEY,
  label: () => tt('scada.prop.fontFamily'),
  type: 'font',
  placeholder: () => tt('scada.prop.fontDefault')
})

/** hasText 的组件补上「字体」属性（已经有就不重复加） */
const withFontField = (def: WidgetDefinition): WidgetDefinition => {
  if (!def.hasText || (def.propSchema || []).some(f => f.key === FONT_FAMILY_KEY)) return def
  const schema = [...(def.propSchema || [])]
  let at = -1
  schema.forEach((f, i) => SIZE_KEYS.includes(f.key) && (at = i))
  schema.splice(at > -1 ? at + 1 : schema.length, 0, fontFamilyField())
  const defaults = def.defaultProps
  return { ...def, propSchema: schema, defaultProps: () => ({ [FONT_FAMILY_KEY]: '', ...defaults() }) }
}

export const registerWidget = (input: WidgetDefinition) => {
  const def = withFontField(input)
  const idx = definitions.findIndex(d => d.type === def.type)
  if (idx > -1) {
    definitions.splice(idx, 1, def)
  } else {
    definitions.push(def)
  }
  return def
}

export const getWidgetDefinition = (type: string) => definitions.find(d => d.type === type)

export const widgetDefinitions = () => definitions as readonly WidgetDefinition[]

/** 组件的显示名：用户填的标题优先，其次组件类型名（图层栏 / 排列工具栏 / 多选面板用） */
export const widgetName = (w: { type: string; title?: string }) => w.title || getWidgetDefinition(w.type)?.label() || w.type
