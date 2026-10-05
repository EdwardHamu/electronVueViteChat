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

/**
 * 多数据绑定条目（widget.props.bindings，multiBinding 组件用，如标准趋势）：
 * 可为每条数据自定义上 / 下公差，临时覆盖数据源（配方）给的值；null / 不填 = 跟随数据源
 */
export interface MultiBindingEntry extends DataBinding {
  upper?: number | null
  lower?: number | null
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
  /** 数据类型（设备配置采集地址里的 DataType 数值索引，对应 DataTypeList），数据项选择弹窗显示用 */
  dataType?: number
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
  /**
   * 顺时针旋转角度，只有 0 / 90 / 180 / 270（工具栏按 90° 步进）；缺省 = 0。
   * x / y / w / h 描述「旋转前」的外框，旋转 / 翻转绕外框中心进行（画面上的外框见 geometry.ts 的 visualRect）
   */
  rotate?: number
  /** 左右 / 上下翻转（镜像）；渲染时先翻转、再旋转。缺省 = 不翻转 */
  flipX?: boolean
  flipY?: boolean
  /** 锁定：不能被拖动 / 缩放 / 对齐 / 旋转 / 翻转 / 删除（仍可选中、改属性、调层级） */
  locked?: boolean
  /** 组合：groupId 相同的组件一起选中、移动、缩放（至少两个成员才有意义，反序列化时会清理落单的） */
  groupId?: string
  /** 图层里隐藏：展示模式不显示，编辑模式半透明（仍可选中） */
  hidden?: boolean
}

/**
 * textarea：多行文本（选项列表等）；image：图片地址 + 选择本地文件（存为 data URL）；multiselect：多选（值为数组）；
 * code：代码（HTML / CSS / JS），面板里只显示一个按钮，点开 CodeDialog 弹窗（带语法高亮）编辑；一个 code 字段可以同时编辑多段代码（parts）
 * font：系统字体（可搜索的下拉，选项用各自的字体预览；值为字体名，空 = 默认字体），见 fonts.ts
 */
export type PropFieldType = 'text' | 'textarea' | 'number' | 'color' | 'boolean' | 'select' | 'multiselect' | 'image' | 'code' | 'font'

export type CodeLanguage = 'html' | 'css' | 'js'

/** code 字段里的一段代码：对应组件的一个属性键，各有自己的语言 / 示例 / 说明 */
export interface CodePart {
  key: string
  label: () => string
  language: CodeLanguage
  example?: () => string
  hint?: () => string
}

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
  /** select / multiselect 的选项；会传入当前组件，选项可依赖其它属性（如饼图按所选数据源列出数据项） */
  options?: (widget?: WidgetInstance) => { label: string; value: any }[]
  /** code 字段（单段写法）：语言、示例代码、编辑框下方的说明；多段（如 HTML + CSS 同一个弹窗）用 parts */
  language?: CodeLanguage
  example?: () => string
  hint?: () => string
  parts?: CodePart[]
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
export type WidgetCategory = 'shape' | 'control' | 'data' | 'other'

export interface WidgetDefinition {
  type: string
  label: () => string
  description?: () => string
  /** 组件库里的小图标（24×24 viewBox 的 SVG 渲染函数），缺省显示首字 */
  icon?: () => VNodeChild
  category?: WidgetCategory
  /**
   * 组件里有文字：registerWidget 会自动加一个「字体」属性（props.fontFamily，放在字号后面，没有字号就放最后），
   * Canvas 把它应用到组件外层并让内部全部文字继承（见 fonts.ts）
   */
  hasText?: boolean
  defaultSize: { w: number; h: number }
  minSize?: { w: number; h: number }
  /** 是否需要绑定数据；false 表示绑定可选（如文本标签：不绑定显示静态文字，绑定后显示数据 / 处理函数的输出） */
  needsBinding: boolean
  /**
   * 多数据绑定（如标准趋势）：属性面板「数据绑定」区块改为绑定列表，复用同一个数据项选择浮窗逐个添加，
   * 绑定存在 widget.props.bindings（DataBinding[]），与单绑定的 widget.binding 互不相干
   */
  multiBinding?: boolean
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

/**
 * 内部变量（数据源 local）的定义：key 是稳定的标识（形如 var17，自动编号、不复用），name 是用户起的名字（空 = 用默认名「变量 N」）。
 * 定义随布局一起保存 / 导出 / 撤销；变量的「值」是运行期数据，不在布局里（见 dataSource/localSource.ts）。
 */
export interface LocalVarDef {
  key: string
  name: string
}

export interface ScadaLayout {
  version: number
  canvas: CanvasConfig
  widgets: WidgetInstance[]
  /** 内部变量定义；老布局没有这个字段，读入时补默认的 var1 ~ var16（layout.ts） */
  variables?: LocalVarDef[]
  /** 下一个自动编号（删掉 var17 后新增得到 var18，不复用旧标识） */
  variableSeq?: number
  updatedAt?: number
}
