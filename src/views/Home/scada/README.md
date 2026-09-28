# 数据组态展示页（scada）

首页新增的「数据组态」标签页：编辑模式下从组件库把组件拖到画布上、绑定数据源、保存；展示模式按保存的布局实时显示数据。

## 目录

| 文件 | 作用 |
| --- | --- |
| `types.ts` | 公共类型：`DataSourceProvider` / `DataBinding` / `DataPoint`（数据源层），`WidgetDefinition` / `WidgetInstance`（组件层），`ScadaLayout`（布局层） |
| `dataSource/registry.ts` | 数据源注册表 + `useDataPoint()` 组合式函数（组件内按绑定读值、自动订阅 / 退订） |
| `dataSource/productSource.ts` | **产品分类数据源**：`GetDeviceGroups(CurrentGroupId)` → `GetShowDataGroups` / `GetChartDataGroups` 列出数据项；`GetRealtimeData(GId)` 按 `sysConfig.ColloctInterval` 轮询（只轮询被绑定的 GId）；标准值 / 公差取自当前配方 `curEnableFormulaParamList` |
| `dataSource/simSource.ts` | 模拟信号数据源：无宿主时调试用，也是"第二个数据源"的实现范例 |
| `registry.ts` | 组件注册表 |
| `widgets/` | 内置示例组件：数值卡片、仪表盘、迷你趋势、状态灯、文本标签；`common.ts` 为共用工具 |
| `store.ts` | Pinia store：已保存布局 `layout`、编辑草稿 `draft`、选中项、增删改 / 层级 / 画布设置 |
| `storage.ts` | 持久化抽象 `LayoutStorage`，默认 localStorage（key `scadaLayout`） |
| `layout.ts` | 默认值与反序列化校验 / 版本迁移；`geometry.ts` 吸附、越界、缩放等纯函数 |
| `Canvas.tsx` | 等比缩放画布、Pointer Events 拖动 / 缩放、Delete 删除 |
| `Palette.tsx` | 组件库（点按放到空位；按住拖到画布上松手放置） |
| `PropertyPanel.tsx` | 属性面板（标题、数据绑定、位置尺寸、按 `propSchema` 生成的组件属性、层级 / 复制 / 删除；未选中时编辑画布） |
| `index.tsx` | 页面入口 + 工具栏 |

## 数据流

```
DataSourceProvider.read(key) ──► DataPoint ──► 组件（只认 DataPoint，不关心来源）
        ▲                                        ▲
   registry / subscribe                    WidgetHost（Canvas.tsx）
        ▲                                        ▲
 WidgetInstance.binding = { source, key } ◄── 属性面板选择
```

`DataPoint` 统一携带 `value / unit / precision / standard / upper / lower / status`，组件据此显示数值、画公差带、按状态变色（ok / high / low / offline / none）。

## 新增一个组件

1. 在 `widgets/` 写一个接收 `widgetProps`（`widget`、`point`、`editing`、`history`）的 `defineComponent`；
2. 导出一个 `WidgetDefinition`：`type`、`label()`、`defaultSize`、`needsBinding`、`defaultProps()`、`propSchema`（属性面板自动渲染 text / number / color / boolean / select）、`component`，需要历史值时设 `keepHistory`；
3. 在 `widgets/index.ts` 里 `registerWidget()`；
4. 在 `public/locales/*.json` 的 `scada.widget` / `scada.prop` 下补文案。

画布、属性面板、存储都不用改。

## 新增一个数据源

实现 `DataSourceProvider`（`id`、`label()`、`options()`、`read(key)`，可选 `start / stop / refresh / subscribe`），在 `dataSource/index.ts` 里 `registerDataSource()` 即可出现在属性面板的「数据源」下拉里。
`read()` 必须从 `reactive` / `ref` 状态读取，组件才会自动刷新；轮询型数据源可用 `subscribe` 做按需请求（参考 `productSource.ts`）。

## 更换存储

实现 `LayoutStorage`（`load / save / clear`）后调用 `setLayoutStorage()`；`normalizeLayout()` 会校验任意来源的数据并处理版本迁移。`exportLayoutText / importLayoutText` 可用于备份或跨设备复制。

## 坐标系

布局保存的是逻辑尺寸 `canvas.width × canvas.height` 下的像素坐标；展示时按容器等比缩放并居中（横竖屏、编辑时侧栏占位都能完整显示）。首次进入没有保存过布局时，画布尺寸取当前可视区域；属性面板的「适配当前屏幕」可随时重设。

## 测试

无需 WebView2 宿主：`npm i --no-save esbuild@0.21 jsdom@22 && node scripts/scada-smoke/run.mjs`（见脚本头部说明）。
