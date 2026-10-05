/**
 * 内置组态组件注册入口。新增组件：在 widgets/ 下写组件 + definition → 在这里 registerWidget()。
 * 组件库按 definition.category 分组：shape 基础图素 / control 控制与显示 / data 数据看板，同组内按注册顺序排列。
 */
import { registerWidget } from '../registry'
import { shapeDefinitions } from './shapes'
import { textLabelDefinition } from './TextLabel'
import { imageDefinition } from './Image'
import { controlDefinitions } from './controls'
import { tableDefinition } from './Table'
import { valueCardDefinition } from './ValueCard'
import { gaugeDefinition } from './Gauge'
import { sparklineDefinition } from './Sparkline'
import { trendDefinition } from './Trend'
import { statusLampDefinition } from './StatusLamp'
import { visualDefinitions } from './visuals'
import { customDefinition } from './Custom'
import { codeDefinitions } from './codes'

// 基础图素：直线 折线 弧线 矩形 圆形 椭圆 扇形 弓形 多边形 文本 图片 管道
const [line, polyline, arc, rect, circle, ellipse, sector, segment, polygon, pipe] = shapeDefinitions
;[line, polyline, arc, rect, circle, ellipse, sector, segment, polygon, textLabelDefinition, imageDefinition, pipe].forEach(registerWidget)
// 控制与显示
controlDefinitions.forEach(registerWidget)
registerWidget(tableDefinition)
// 数据看板
registerWidget(valueCardDefinition)
registerWidget(gaugeDefinition)
registerWidget(sparklineDefinition)
registerWidget(trendDefinition)
registerWidget(statusLampDefinition)
// 数据看板（续）：棒图 滑块 进度条 环形进度条 饼图 量表 自定义组件（HTML / CSS / JS）
visualDefinitions.forEach(registerWidget)
registerWidget(customDefinition)
// 其他：二维码 条形码
codeDefinitions.forEach(registerWidget)

export * from '../registry'
