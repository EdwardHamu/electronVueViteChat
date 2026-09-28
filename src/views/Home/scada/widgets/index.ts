/**
 * 内置组态组件注册入口。新增组件：在 widgets/ 下写组件 + definition → 在这里 registerWidget()。
 */
import { registerWidget } from '../registry'
import { valueCardDefinition } from './ValueCard'
import { gaugeDefinition } from './Gauge'
import { sparklineDefinition } from './Sparkline'
import { statusLampDefinition } from './StatusLamp'
import { textLabelDefinition } from './TextLabel'

registerWidget(valueCardDefinition)
registerWidget(gaugeDefinition)
registerWidget(sparklineDefinition)
registerWidget(statusLampDefinition)
registerWidget(textLabelDefinition)

export * from '../registry'
