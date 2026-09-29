/**
 * 数据组态（SCADA 展示页）公共类型
 *
 * 分三层：
 *  1. 数据源层（DataSourceProvider / DataBinding / DataPoint）——组件只认 DataPoint，不关心数据从哪来
 *  2. 组件层（WidgetDefinition / WidgetInstance）——通过 registry 注册，新增组件不需要改画布代码
 *  3. 布局层（ScadaLayout）——可序列化，落地到 storage.ts 抽象出的存储
 */
import type { Component, VNodeChild } from 'vue'

// ---------------------------------------------------------------- 数据源

/** 组件与数据的绑定关系：source 为数据源 id（见 dataSource/registry.ts），key 为该数据源内部的唯一键 */
export interface DataBinding {
  source: string
  key: string
  /** 绑定时的显示名，仅用于数据源暂时不可用时兜底显示 */
  label?: string
}

/** 数据点状态：ok 在公差内 / high 超上限 / low 超下限 / offline 尚无数据 / none 无公差信息 */
export type PointStatus = 'ok' | 'high' | 'low' | 'offline' | 'none'

/** 统一的数据点结构，所有数据源 read() 都返回它 */
export interface DataPoint {
  value: number | null
  /** 字符串型数据（如 DataValue.StringValue） */
  text?: string
  name?: string
  unit?: string
  precision?: number
  /** 标准值 / 上限 / 下限（有配方参数时由数据源填充，组件用来画公差带、判断报警） */
  standard?: number
  upper?: number
  lower?: number
  status: PointStatus
  /** 最近一次更新时间戳（ms） */
  time?: number
}

/** 属性面板里可供选择的数据项 */
export interface BindingOption {
  key: string
  label: string
  /** 分组名（如设备名），属性面板按组显示 */
  group?: string
  unit?: string
  precision?: number
}

/**
 * 数据源接口。新增数据源（如 OPC UA、MQTT、历史库）只需实现它并 registerDataSource()。
 * read() 必须基于响应式状态（reactive/ref）读取，这样组件的 computed 才能自动刷新。
 */
export interface DataSourceProvider {
  id: string
  /** 显示名，返回函数以便跟随语言切换 */
  label: () => string
  /** 可绑定的数据项列表（响应式） */
  options: () => BindingOption[]
  /** 读取某个数据项的当前值；未知 key 返回 undefined */
  read: (key: string) => DataPoint | undefined
  /** 组态页挂载 / 卸载时调用，用于启动 / 停止轮询等 */
  start?: () => void
  stop?: () => void
  /** 重新加载数据项列表（例如产品分类切换后） */
  refresh?: () => Promise<void> | void
  /**
   * 按需订阅：有组件绑定了某个 key 时调用，返回取消订阅函数。
   * 轮询型数据源可据此只请求被用到的数据项。
   */
  subscribe?: (key: string) => () => void
  /**
   * 写入（按钮 / 开关 / IO 域等控制类组件用）。不实现 = 只读数据源，控制类组件绑定后显示为只读。
   * writable 可按数据项细分（如部分寄存器只读）。
   */
  write?: (key: string, value: WriteValue) => Promise<void> | void
  writable?: (key: string) => boolean
}

/** 控制类组件写入的值 */
export type WriteValue = number | string | boolean

// ---------------------------------------------------------------- 组件

export interface WidgetRect {
  x: number
  y: number
  w: number
  h: number
}

/** 画布上的一个组件实例（可序列化） */
export interface WidgetInstance extends WidgetRect {
  id: string
  /** 对应 WidgetDefinition.type */
  type: string
  title?: string
  binding?: DataBinding | null
  /** 数据处理函数（JS 源码，见 transform.ts）；空则不处理 */
  transform?: string
  /** 组件自定义属性，结构由 WidgetDefinition.propSchema 描述 */
  props: Record<string, any>
}

/** textarea：多行文本（选项列表等）；image：图片地址 + 选择本地文件（存为 data URL） */
export type PropFieldType = 'text' | 'textarea' | 'number' | 'color' | 'boolean' | 'select' | 'image'

/** 属性面板的声明式字段描述，通用编辑器据此渲染 */
export interface PropField {
  key: string
  label: () => string
  type: PropFieldType
  min?: number
  max?: number
  step?: number
  /** 占位文字；传函数可延迟到渲染时取 i18n（模块加载时语言包可能还没就绪） */
  placeholder?: string | (() => string)
  options?: () => { label: string; value: any }[]
}

/** 组件渲染时收到的 props */
export interface WidgetRenderProps {
  widget: WidgetInstance
  point?: DataPoint
  editing: boolean
  /** keepHistory > 0 时由宿主维护的最近 N 个数值 */
  history?: number[]
}

/** 组件库分类：shape 基础图素 / control 控制与显示 / data 数据看板 */
export type WidgetCategory = 'shape' | 'control' | 'data'

export interface WidgetDefinition {
  type: string
  label: () => string
  description?: () => string
  /** 组件库里的小图标（24×24 viewBox 的 SVG 渲染函数），缺省显示首字 */
  icon?: () => VNodeChild
  category?: WidgetCategory
  defaultSize: { w: number; h: number }
  minSize?: { w: number; h: number }
  /** 是否需要绑定数据；false 表示绑定可选（如文本标签：不绑定显示静态文字，绑定后显示数据 / 处理函数的输出） */
  needsBinding: boolean
  /** >0 时宿主保留最近 N 个数值传给组件（迷你趋势用） */
  keepHistory?: number
  defaultProps: () => Record<string, any>
  propSchema?: PropField[]
  component: Component
}

// ---------------------------------------------------------------- 布局

export interface CanvasConfig {
  /** 逻辑尺寸，展示时按容器等比缩放 */
  width: number
  height: number
  background: string
  /** 网格 / 吸附步长（px） */
  grid: number
}

export interface ScadaLayout {
  version: number
  canvas: CanvasConfig
  widgets: WidgetInstance[]
  updatedAt?: number
}
