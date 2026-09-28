/**
 * 组态组件注册表。新增组件：写一个渲染组件 + WidgetDefinition，然后 registerWidget()。
 */
import { shallowReactive } from 'vue'
import type { WidgetDefinition } from './types'

const definitions = shallowReactive<WidgetDefinition[]>([])

export const registerWidget = (def: WidgetDefinition) => {
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
