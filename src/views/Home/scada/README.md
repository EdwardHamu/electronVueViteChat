# 数据组态展示页（scada）

首页新增的「数据组态」标签页：编辑模式下从组件库把组件拖到画布上、绑定数据源、保存；展示模式按保存的布局实时显示数据。

## 目录

| 文件 | 作用 |
| --- | --- |
| `types.ts` | 公共类型：`DataSourceProvider` / `DataBinding` / `DataPoint`（数据源层），`WidgetDefinition` / `WidgetInstance`（组件层），`ScadaLayout`（布局层） |
| `dataSource/registry.ts` | 数据源注册表 + `useDataPoint()` 组合式函数（组件内按绑定读值、自动订阅 / 退订） |
| `dataSource/productSource.ts` | **产品分类数据源**：`GetDeviceGroups(CurrentGroupId)` → `GetShowDataGroups` / `GetChartDataGroups` 列出数据项；`GetRealtimeData(GId)` 按 `sysConfig.ColloctInterval` 轮询（只轮询被绑定的 GId）；标准值 / 公差取自当前配方 `curEnableFormulaParamList` |
| `dataSource/simSource.ts` | 模拟信号数据源：无宿主时调试用，也是"第二个数据源"的实现范例 |
| `transform.ts` | 组件级**数据处理函数**：编译 / 执行用户写的 JS（三种写法、返回值合并规则、错误反馈），示例片段 `TRANSFORM_EXAMPLES` |
| `registry.ts` | 组件注册表 |
| `widgets/` | 内置示例组件：数值卡片、仪表盘、迷你趋势、状态灯、文本标签；`common.ts` 为共用工具 |
| `store.ts` | Pinia store：已保存布局 `layout`、编辑草稿 `draft`、选中项、增删改 / 层级 / 画布设置 |
| `storage.ts` | 持久化抽象 `LayoutStorage`，默认 localStorage（key `scadaLayout`） |
| `layout.ts` | 默认值与反序列化校验 / 版本迁移；`geometry.ts` 吸附、越界、缩放等纯函数 |
| `Canvas.tsx` | 等比缩放画布、`WidgetHost`（绑定 → 处理函数 → 历史值 → 组件）、Pointer Events 拖动 / 缩放组件、Delete 删除；编辑模式的视图缩放（滚轮 / 双指 / 键盘 + - 0）与长按平移 |
| `Palette.tsx` | 组件库（点按放到空位；按住拖到画布上松手放置）；`direction` = vertical（横屏侧栏）/ horizontal（竖屏顶部横向条带） |
| `PropertyPanel.tsx` | 属性面板（标题、数据绑定、位置尺寸、按 `propSchema` 生成的组件属性、层级 / 复制 / 删除；未选中时编辑画布）；`columns=2` 时分两栏；底部按钮打开数据处理函数弹窗 |
| `TransformDialog.tsx` | 数据处理函数编辑弹窗：本地草稿 + 用当前数据实时预览输出 / 错误，「确定」才写回组件，语法错误不可确定 |
| `index.tsx` | 页面入口 + 工具栏（含缩放按钮）；横屏三栏 / 竖屏三行布局切换 |

## 数据流

```
DataSourceProvider.read(key) ──► DataPoint ──► 数据处理函数（可选，transform.ts）──► 组件（只认 DataPoint，不关心来源）
        ▲                                                  ▲                            ▲
   registry / subscribe                     WidgetInstance.transform（JS 源码）    WidgetHost（Canvas.tsx）
        ▲
 WidgetInstance.binding = { source, key } ◄── 属性面板选择
```

`DataPoint` 统一携带 `value / unit / precision / standard / upper / lower / status`，组件据此显示数值、画公差带、按状态变色（ok / high / low / offline / none）。

## 数据处理函数

每个组件实例都可以写一段代码（选中组件 → 属性面板底部「数据处理函数 (JS)」按钮 → 弹窗编辑，按钮上会标出「已启用 / 函数错误」），宿主在把 `DataPoint` 交给组件之前先执行它（组件本身不用做任何事）。代码随布局保存在 `WidgetInstance.transform`。

- 写法：完整函数 `(value, point, ctx) => …`、函数体 `if (…) return …; return …`、或单个表达式 `value * 1000`（按此顺序识别）。
- 参数：`value` 当前值（无数据为 `null`）、`point` 原始数据点（未绑定为 `undefined`）、`ctx = { widget, history, state, prev, now }`——`state` 是该组件专属的持久对象（代码改变时清空，可做滑动平均），`history` 为宿主保留的最近 N 个显示值。
- 返回值：`undefined` 不改动；`null` 清空数值；数字 → 新 `value`（状态 / 公差不变）；字符串 / 布尔 → 显示文本；对象 → 合并 `value / text / name / unit / precision / standard / upper / lower / status / time`，改了公差但没给 `status` 时按新公差重新判定状态。不支持异步函数和数组返回值。
- 出错（语法或运行时）时保持原始数据点不变；弹窗里用当前数据实时预览草稿的输入 / 输出 / 错误（预览有独立的 `ctx.state`），画布实例的最近一次结果在 `transformErrors` / `transformDebug` 里。
- 文本标签的绑定是可选的：绑定后显示数值或处理函数拼出的文字（如 `return '外径 ' + value.toFixed(2) + ' mm'`）。
- 代码用 `new Function` 执行，只在本机 WebView 内、由现场人员配置，不做沙箱隔离。

## 新增一个组件

1. 在 `widgets/` 写一个接收 `widgetProps`（`widget`、`point`、`editing`、`history`）的 `defineComponent`——收到的 `point` 已经过数据处理函数，组件不用关心；
2. 导出一个 `WidgetDefinition`：`type`、`label()`、`defaultSize`、`needsBinding`、`defaultProps()`、`propSchema`（属性面板自动渲染 text / number / color / boolean / select）、`component`，需要历史值时设 `keepHistory`；
3. 在 `widgets/index.ts` 里 `registerWidget()`；
4. 在 `public/locales/*.json` 的 `scada.widget` / `scada.prop` 下补文案。

画布、属性面板、存储都不用改。

## 新增一个数据源

实现 `DataSourceProvider`（`id`、`label()`、`options()`、`read(key)`，可选 `start / stop / refresh / subscribe`），在 `dataSource/index.ts` 里 `registerDataSource()` 即可出现在属性面板的「数据源」下拉里。
`read()` 必须从 `reactive` / `ref` 状态读取，组件才会自动刷新；轮询型数据源可用 `subscribe` 做按需请求（参考 `productSource.ts`）。

## 更换存储

实现 `LayoutStorage`（`load / save / clear`）后调用 `setLayoutStorage()`；`normalizeLayout()` 会校验任意来源的数据并处理版本迁移。`exportLayoutText / importLayoutText` 可用于备份或跨设备复制。

## 坐标系与视图

布局保存的是逻辑尺寸 `canvas.width × canvas.height` 下的像素坐标；展示时按容器等比缩放并居中（横竖屏、编辑时侧栏占位都能完整显示）。首次进入没有保存过布局时，画布尺寸取当前可视区域；属性面板的「适配当前屏幕」可随时重设。

编辑模式下可以缩放 / 平移视图（`canvasView.zoom / panX / panY`，1 = 刚好适配容器，范围 0.25 ~ 6，不保存）：滚轮或双指捏合以指针为中心缩放，键盘 `+` `-` `0`，工具栏 `－ 100% ＋`；**长按空白处**（400ms）后拖动、或按住鼠标中键拖动平移，画布至少保留 60px 在视口内。保存 / 取消退出编辑时自动复位。组件拖动、组件库拖放都按实际缩放换算，展示模式不可缩放。

## 横竖屏布局

- 横屏：组件库（190px）| 画布 | 属性面板（300px）。
- 竖屏（`useMain().isLandscape === false`）：组件库改为画布上方 92px 的横向条带（可横向滚动，条带内 `touch-action: pan-x`，向下拖到画布放置），属性面板放在画布下方（高 36%，区块两栏排布）。

## 测试

无需 WebView2 宿主：`npm i --no-save esbuild@0.21 jsdom@22 && node scripts/scada-smoke/run.mjs`（见脚本头部说明）。
