# 数据组态展示页（scada）

首页新增的「数据组态」标签页：编辑模式下从组件库把组件拖到画布上、绑定数据源、保存；展示模式按保存的布局实时显示数据。

展示模式**没有顶栏**，画布占满整个标签页；在页面任意位置**右键（触摸屏长按）**弹出菜单：`编辑` 进入编辑模式、`刷新数据源` 重新拉取数据项目录。编辑模式才显示顶部工具栏（编辑标记、画布尺寸、组件库 / 属性开关、缩放、`?` 操作说明弹窗、取消 / 保存）——操作提示不再以文字占用顶栏，全部放在 `?` 打开的 `NModal` 里（文案 `scada.help.*`，每节按 `\n` 分行）。本页挂载期间会把 `useMain().globalKeyBoardBlocked` 置为 `true`，`listenAllInputFocus` 因此不再弹出应用内虚拟键盘（离开标签页恢复）。

## 目录

| 文件 | 作用 |
| --- | --- |
| `types.ts` | 公共类型：`DataSourceProvider` / `DataBinding` / `DataPoint`（数据源层），`WidgetDefinition` / `WidgetInstance`（组件层），`ScadaLayout`（布局层） |
| `dataSource/registry.ts` | 数据源注册表 + `useDataPoint()` 组合式函数（组件内按绑定读值、自动订阅 / 退订） |
| `dataSource/productSource.ts` | **产品分类数据源**：`GetDeviceGroups(CurrentGroupId)` → `GetShowDataGroups` / `GetChartDataGroups` 列出数据项；`GetRealtimeData(GId)` 按 `sysConfig.ColloctInterval` 轮询（只轮询被绑定的 GId）；标准值 / 公差取自当前配方 `curEnableFormulaParamList` |
| `dataSource/simSource.ts` | 模拟信号数据源：无宿主时调试用，也是"第二个数据源"的实现范例 |
| `dataSource/localSource.ts` | **内部变量数据源**（`local`，`var1` ~ `var16`）：目前唯一实现了 `write()` 的数据源，按钮 / 开关 / IO 域写进来的值立即被绑定同一变量的组件读到，并持久化到 localStorage `scadaLocalVars` |
| `transform.ts` | 组件级**数据处理函数**：编译 / 执行用户写的 JS（三种写法、返回值合并规则、错误反馈），示例片段 `TRANSFORM_EXAMPLES` |
| `registry.ts` | 组件注册表 |
| `widgets/` | 内置组件，分三类（`WidgetDefinition.category`）：`shape` 基础图素（`shapes.tsx` 直线 / 折线 / 弧线 / 矩形 / 圆形 / 椭圆 / 扇形 / 弓形 / 多边形 / 管道，`TextLabel.tsx` 文本，`Image.tsx` 图片）、`control` 控制与显示（`controls.tsx` 数值 IO 域 / 字符 IO 域 / 日期时间域 / 按钮 / 位按钮 / 字按钮 / 位状态显示 / 字状态显示 / 文本列表 / 文本开关 / 单选框 / 复选框，`Table.tsx` 表格）、`data` 数据看板（数值卡片 / 仪表盘 / 迷你趋势 / 状态灯，以及 `visuals.tsx` 里的棒图 / 滑块 / 进度条 / 环形进度条 / 饼图 / 量表）。`icons.tsx` 是组件库用的 24×24 线条图标；`common.ts`（状态配色、`resolveRange` 量程推算）/ `controlCommon.ts`（`useControl` 写入封装、选项列表解析、共享秒表）为共用工具 |
| `store.ts` | Pinia store：已保存布局 `layout`、编辑草稿 `draft`、选中项、增删改 / 层级 / 画布设置 |
| `storage.ts` | 持久化抽象 `LayoutStorage`，默认 localStorage（key `scadaLayout`） |
| `resource.ts` | **资源文件**（图片等）：有宿主时经 `JsBridge.SaveResourceFile(fileName, base64)` 存到运行目录 `Resources/pic/<GUID>.<ext>`，布局里只记返回的 `https://pic.nt.local/<GUID>.<ext>`（WebView2 虚拟主机映射到该目录，跨域 fetch 已放开）；没有宿主桥（纯浏览器调试）退回 data URL 内嵌（单张 ≤ `INLINE_MAX_BYTES` 300 KB）。还包括递归的引用收集 / 替换（`walkStrings`，嵌套属性也算）、`fetchResource` / `resourceExists`、`downloadBlob`（`a[download]` 触发浏览器下载）、宿主调用封装 `callHost`、`listResourceFiles` / `deleteResourceFile` 与 **`cleanupUnusedResources(layout)`**（删掉 `Resources/pic` 里布局不再引用的 `<32 位 hex>.<ext>` 文件，`store.save()` 与展示模式 `applyLayout()` 后自动调用） |
| `zip.ts` | 零依赖 zip：写 STORE（含 CRC32、UTF-8 文件名标志），读 STORE / DEFLATE（`DecompressionStream('deflate-raw')`），够用于组态包 |
| `package.ts` | **组态包**导入导出（纯逻辑）。有宿主：`exportPackageViaHost(layout)` / `previewPackageViaHost('')` / `importPackageViaHost(path)` 分别调 `JsBridge.ExportScadaPackage`（另存为对话框 + 宿主打包）/ `PreviewScadaPackage`（打开对话框 + 清点）/ `ImportScadaPackage`（解压资源到 `Resources/pic`、返回布局），`layoutFromHostImport()` 规范化返回的布局；返回 `undefined` 表示老宿主没有该接口。浏览器 / 老宿主：`buildPackage()` 把布局 + 引用的全部资源打成一个 zip（`manifest.json` + `layout.json` + `resources/…`）；`parsePackage()` 解析 zip 或直接的 JSON；`planImport()` 清点资源（本机已有同名 GUID 文件 → 复用，否则上传，包里缺的 → 缺失）；`applyPackage()` 上传 / 复用 / 内嵌并返回引用已替换的布局 |
| `ImportDialog.tsx` | 导入弹窗，两种来源：`preview`（宿主 `PreviewScadaPackage` 的清点结果 → 确认后 `ImportScadaPackage`）或 `file`（前端解析 → 上传）；清单（组件数 / 画布 / 资源统计）→ 确认后调用 `store.applyLayout()`（展示模式直接持久化，编辑模式只替换草稿） |
| `layout.ts` | 默认值与反序列化校验 / 版本迁移；`geometry.ts` 吸附、越界、缩放等纯函数 |
| `Canvas.tsx` | 等比缩放画布、`WidgetHost`（绑定 → 处理函数 → 历史值 → 组件）、Pointer Events 拖动 / 缩放组件、Delete 删除、方向键微调（1px，Shift 按网格）；编辑模式的视图缩放（滚轮 / 双指 / 键盘 + - 0）与平移（空格 + 拖动 / 中键拖动 / 双指） |
| `Palette.tsx` | 组件库，HMI 工具箱样式：按三个分类分组（点分类标题折叠 / 展开），每项是小图标 + 名称，横屏可在**网格**（3 列）/ **列表**（图标 + 名称 + 说明）间切换（记在 localStorage `scadaPaletteView`）；点按放到空位、按住拖到画布上松手放置；`direction` = vertical（横屏侧栏 200px）/ horizontal（竖屏顶部横向条带，分类做成竖排标签）。滚动容器是 naive-ui `NScrollbar`（悬浮式滚动条，不占内容宽度） |
| `PropertyPanel.tsx` | 属性面板（标题、数据绑定、位置尺寸、按 `propSchema` 生成的组件属性、层级 / 复制 / 删除；未选中时编辑画布）；`columns=2` 时分两栏；底部按钮打开数据处理函数弹窗；同样用 `NScrollbar` 悬浮滚动。字段类型 text / textarea / number / color / boolean / select / image（图片 = 地址输入 + 「选择图片文件」按钮：有宿主时上传到 `Resources/pic` 只存 `https://pic.nt.local/…` 地址（≤ 20 MB），无宿主时读成 data URL 内嵌（≤ 300 KB），见 `resource.ts`） |
| `ColorField.tsx` | 颜色字段（组件颜色属性、画布背景）：一行色块按钮，点开在下方行内展开面板——第一界面是**预设颜色表**，按钮切换到 HSV **调色盘**（SV 面板 + 色相条 + hex 输入）；两处都能「加入预设」，「管理」模式点色块移除、可恢复默认；`clearable` 时提供「清除」（空值 = 组件默认色）。不用 naive-ui 的 NColorPicker 弹层（嵌在滚动面板 / 弹层里会被 click-outside 关掉）。**自动收起**：模块级 `activeColorField` 保证同时只展开一个（打开另一个字段时旧的收起）；展开期间在 `document` 上监听 `focusin` / `pointerdown`（capture），焦点或点按落到面板外的其它输入框 / 控件（`CLOSE_ON_POINTERDOWN_SELECTOR`）上就收起；点面板外空白处、拖滚动条 / 触摸滚动不收起 |
| `color.ts` / `colorPresets.ts` | hex ↔ HSV 等纯函数；预设颜色表（所有颜色字段共用，最多 64 个，localStorage key `scadaColorPresets`，损坏 / 清空时回落到默认 24 色） |
| `TransformDialog.tsx` | 数据处理函数编辑弹窗：本地草稿 + 用当前数据实时预览输出 / 错误，「确定」才写回组件，语法错误不可确定 |
| `index.tsx` | 页面入口：展示模式右键菜单（`NDropdown` trigger=manual：编辑 / 刷新数据源 / 导出组态 / 导入组态）、编辑模式工具栏（含缩放按钮、`?` 操作说明弹窗、`⋯` 更多菜单里的导出 / 导入）；有宿主时导出 / 导入交给宿主（另存为 / 打开对话框），否则前端打包下载、隐藏的 `<input type=file>` 选包后打开 `ImportDialog`；横屏三栏 / 竖屏三行布局切换；挂载期间屏蔽虚拟键盘 |

## 数据流

```
DataSourceProvider.read(key) ──► DataPoint ──► 数据处理函数（可选，transform.ts）──► 组件（只认 DataPoint，不关心来源）
        ▲                                                  ▲                            ▲
   registry / subscribe                     WidgetInstance.transform（JS 源码）    WidgetHost（Canvas.tsx）
        ▲
 WidgetInstance.binding = { source, key } ◄── 属性面板选择
```

`DataPoint` 统一携带 `value / unit / precision / standard / upper / lower / status`，组件据此显示数值、画公差带、按状态变色（ok / high / low / offline / none）。

## 控制组件与写入

控制类组件（按钮 / 位按钮 / 字按钮 / 文本列表 / 文本开关 / 单选框 / 复选框 / 可编辑的 IO 域）通过 `writeBinding(binding, value)` 往绑定的数据项写值，前提是 `canWrite(binding)`：数据源实现了 `DataSourceProvider.write()`，且 `writable(key)`（可按数据项细分）为真。组件统一用 `controlCommon.ts` 的 `useControl()`：编辑模式不响应；未绑定 / 数据源只读时 `$message.warning` 提示；写失败 `$message.error`。

- 目前**只有内部变量数据源可写**：宿主 `JsBridge` 没有向仪器 / PLC 写值的方法（只有开始 / 停止 / 清空 / 轴采集等命令），产品分类与模拟数据源都是只读。后端提供写接口后，给 `productSource` 加 `write()` 即可，控制组件不用改。
- 按钮的「动作」除了写值 / 取反，还可以调宿主命令：开始 / 停止 / 清空 / 轴采集（优先走首页注册的 `window.frontFn.startCollect / stopCollect`，没有时直接 `callBrige`）。
- 数值 IO 域：本页屏蔽了应用内虚拟键盘，所以数值输入除了点值进入行内编辑（Enter 提交 / Esc 取消），还带 `－ ＋` 步进按钮（`step / min / max`），触摸屏也能改值；字符 IO 域同样行内编辑。
- 文本列表 / 单选框 / 字状态显示的选项写在多行文本里，一行一项：`值=文字|颜色`、`值=文字` 或只写 `文字`（值为行号）。
- 表格不绑定单个数据项，而是列出所选数据源的全部数据项（名称 / 当前值 / 单位 / 状态 / 更新时间），并只订阅表里出现的项。

## 数据处理函数

每个组件实例都可以写一段代码（选中组件 → 属性面板底部「数据处理函数 (JS)」按钮 → 弹窗编辑，按钮上会标出「已启用 / 函数错误」），宿主在把 `DataPoint` 交给组件之前先执行它（组件本身不用做任何事）。代码随布局保存在 `WidgetInstance.transform`。

- 写法：完整函数 `(value, point, ctx) => …`、函数体 `if (…) return …; return …`、或单个表达式 `value * 1000`（按此顺序识别）。
- 参数：`value` 当前值（无数据为 `null`）、`point` 原始数据点（未绑定为 `undefined`）、`ctx = { widget, history, state, prev, now }`——`state` 是该组件专属的持久对象（代码改变时清空，可做滑动平均），`history` 为宿主保留的最近 N 个显示值。
- 返回值：`undefined` 不改动；`null` 清空数值；数字 → 新 `value`（状态 / 公差不变）；字符串 / 布尔 → 显示文本；对象 → 合并 `value / text / name / unit / precision / standard / upper / lower / status / time`，改了公差但没给 `status` 时按新公差重新判定状态。不支持异步函数和数组返回值。
- 出错（语法或运行时）时保持原始数据点不变；弹窗里用当前数据实时预览草稿的输入 / 输出 / 错误（预览有独立的 `ctx.state`），画布实例的最近一次结果在 `transformErrors` / `transformDebug` 里。
- 文本标签的绑定是可选的：绑定后显示数值或处理函数拼出的文字（如 `return '外径 ' + value.toFixed(2) + ' mm'`）。
- 代码用 `new Function` 执行，只在本机 WebView 内、由现场人员配置，不做沙箱隔离。

## 数据看板里的可视化组件（`widgets/visuals.tsx`）

- 棒图 / 进度条 / 环形进度条 / 量表 / 仪表盘都按「量程」作图：`common.resolveRange()`——组件属性 `min` / `max` 可只填一个，没填的取自动值（公差带外扩 50% → 0 ~ 2×标准值 → 0 ~ 100）；棒图 / 量表还会把公差区画成红 / 绿 / 橙色带。
- 滑块是这组里唯一可写的组件：拖动时只改本地显示值，松手后经 `useControl().write()` 写回（按 `step` 取整、限制在 `min ~ max`），未绑定 / 数据源只读时点按给出与按钮相同的提示，`readOnly` 属性可让它只作显示；松手到数据源刷新之前先显示写入值（`pending`），避免闪回旧值。
- 饼图不绑定单个数据项：像表格一样选一个数据源，`items`（multiselect，留空 = 全部）挑若干数据项，用它们的当前值算占比，负值 / 无值按 0；支持环形、图例位置、扇区百分比标注与自定义配色（一行一个颜色）。

## 新增一个组件

1. 在 `widgets/` 写一个接收 `widgetProps`（`widget`、`point`、`editing`、`history`）的 `defineComponent`——收到的 `point` 已经过数据处理函数，组件不用关心；
2. 导出一个 `WidgetDefinition`：`type`、`label()`、`description()`、`icon()`（`icons.tsx` 风格的 24×24 SVG，`currentColor`）、`category`（shape / control / data，决定在组件库里的分组）、`defaultSize`、`needsBinding`、`defaultProps()`、`propSchema`（属性面板自动渲染 text / textarea / number / color / boolean / select / multiselect / image；`placeholder` 可传函数以便渲染时再取 i18n；select / multiselect 的 `options(widget)` 会收到当前组件，可按别的属性动态给选项）、`component`，需要历史值时设 `keepHistory`；
3. 在 `widgets/index.ts` 里 `registerWidget()`；
4. 在 `public/locales/*.json` 的 `scada.widget` / `scada.prop` 下补文案。

画布、属性面板、存储都不用改。

## 新增一个数据源

实现 `DataSourceProvider`（`id`、`label()`、`options()`、`read(key)`，可选 `start / stop / refresh / subscribe`，可写的数据源再实现 `write(key, value)` / `writable(key)`），在 `dataSource/index.ts` 里 `registerDataSource()` 即可出现在属性面板的「数据源」下拉里。
`read()` 必须从 `reactive` / `ref` 状态读取，组件才会自动刷新；轮询型数据源可用 `subscribe` 做按需请求（参考 `productSource.ts`）。

## 更换存储

实现 `LayoutStorage`（`load / save / clear`）后调用 `setLayoutStorage()`；`normalizeLayout()` 会校验任意来源的数据并处理版本迁移。`exportLayoutText / importLayoutText` 可用于备份或跨设备复制。

## 导入 / 导出组态包

- 入口：展示模式右键菜单，或编辑模式工具栏的 `⋯` 菜单。包结构（宿主与前端实现一致）：`manifest.json`（格式 / 版本 / 组件数 / 画布 / 资源清单 `[{ file, url }]`）、`layout.json`（与 localStorage 里保存的结构一致）、`resources/<GUID>.<ext>`（图片等，文件名就是 `Resources/pic` 里的名字，所以 `layout.json` 里的 `https://pic.nt.local/<GUID>.<ext>` 在导入机器上原样可用）。
- **有宿主（SPC_M `91ebedd` 起）——打包 / 解包都在 C# 侧完成，前端只传布局、确认清单、应用结果：**
  - 导出：`exportPackageViaHost(scada.current)` → `JsBridge.ExportScadaPackage(layoutJson, '')`：宿主弹「另存为」（默认名 `scada-layout-YYYYMMDD-HHmmss.zip`，初始目录 = 系统配置的导出路径），直接从 `Resources/pic` 读文件打包，布局里内嵌的 data URL 由宿主抽成新的 GUID 文件；返回 `{ Cancelled, Path, FileName, Size, Widgets, Resources, Missing }`，取消时 `Cancelled=true` 静默返回，`Missing`（本机没有的引用）提示但不中断。
  - 导入：`previewPackageViaHost('')` → `JsBridge.PreviewScadaPackage('')`：宿主弹打开文件对话框并只清点不写文件，返回 `{ Path, FileName, Widgets, Canvas, Resources, ToCopy, Reusable, Missing, Files }` → `ImportDialog`（`preview` 模式）显示清单 → 确认 → `importPackageViaHost(Path)` → `JsBridge.ImportScadaPackage(Path)`：宿主把本机没有的资源解压到 `Resources/pic`（同名文件复用、不覆盖；旧版前端包里的 `pkg:resources/…` 占位另存为新 GUID 并改写地址）并返回 `Layout` → `layoutFromHostImport()`（`normalizeLayout`）→ `store.applyLayout()`。
  - 老宿主没有这些接口时 `callHost` 返回 `undefined`（真实 WebView2 代理会先抛错、`callBrige` 弹一条错误），页面自动退回下面的浏览器流程。
- **没有宿主桥（纯浏览器调试）：** 导出 `buildPackage(scada.current)` → zip → `downloadBlob()` 浏览器下载（内嵌 data URL 抽成 `resources/inline-N.ext` + `pkg:resources/inline-N.ext` 占位）；导入选 zip（也接受直接导出的 JSON）→ `parsePackage` → `planImport`（`resourceExists` 用 `fetch(https://pic.nt.local/<name>)` 探测同名文件）→ 确认 → `applyPackage`（需上传的逐个 `SaveResourceFile`；没有宿主桥时内嵌成 data URL）→ `store.applyLayout()`。
- 展示模式导入后直接持久化并显示；编辑模式只替换草稿，保存才生效（取消编辑可丢弃）。
- **孤儿资源清理：** `store.save()` 与展示模式 `applyLayout()` 成功后异步调用 `cleanupUnusedResources(layout)`：`ListResourceFiles` 列出 `Resources/pic`，把布局（递归扫描全部字符串值）没有引用、且文件名形如 `<32 位 hex>.<ext>`（宿主生成的名字）的文件逐个 `DeleteResourceFile`；手工放进目录的文件、`.gitkeep` 不碰；列举失败 / 老宿主没有接口时什么都不删。编辑草稿里刚上传、还没保存的图片不会被清（清理只在保存后按保存结果跑）。

## 坐标系与视图

布局保存的是逻辑尺寸 `canvas.width × canvas.height` 下的像素坐标；展示时按容器等比缩放并居中（横竖屏、编辑时侧栏占位都能完整显示）。首次进入没有保存过布局时，画布尺寸取当前可视区域；属性面板的「适配当前屏幕」可随时重设。这两处用的尺寸都是页面根元素（`rootRef`）的大小，即展示模式下没有顶栏时画布能占到的整页面积——编辑模式虽然多了工具栏，量的仍是整页，所以适配后回到展示模式正好铺满。

编辑模式下可以缩放 / 平移视图（`canvasView.zoom / panX / panY`，1 = 刚好适配容器，范围 0.25 ~ 6，不保存）：滚轮或双指捏合以指针为中心缩放，键盘 `+` `-` `0`，工具栏 `－ 100% ＋`；**按住空格键拖动鼠标**（画布任意位置，组件上方也可以，此时不会拖动组件）、或按住鼠标中键拖动平移，触摸屏双指同时可缩放 / 平移；画布至少保留 60px 在视口内。空格只在焦点位于页面空白或画布容器（点一下画布即可）时生效，焦点在输入框 / 按钮上时按原生行为处理。保存 / 取消退出编辑时自动复位。组件拖动、组件库拖放都按实际缩放换算，展示模式不可缩放。

选中组件后**方向键**逐像素微调位置，**Shift + 方向键**按 `canvas.grid` 步进，越界由 `updateWidgetRect` 收口；判定焦点的规则与空格相同（焦点在属性面板输入框里时方向键仍是编辑文字）。按下组件时画布容器会主动 `focus()`（pointerdown 已 `preventDefault`，浏览器不会自动移焦），所以点一下组件就能直接用方向键。

## 横竖屏布局

- 横屏：组件库（200px）| 画布 | 属性面板（300px）。
- 竖屏（`useMain().isLandscape === false`）：组件库改为画布上方 92px 的横向条带（`NScrollbar xScrollable`，鼠标滚轮也横向滚动，条带内 `touch-action: pan-x`，向下拖到画布放置），属性面板放在画布下方（高 36%，区块两栏排布）。
- 两个侧栏的滚动条都是 `NScrollbar` 的悬浮轨道（`overflow: overlay` 在新 Chromium / WebView2 里已被移除，不能靠它）；组件库（横屏列表与竖屏条带）的滑块通过 `themeOverrides` 设为完全透明（`Palette.tsx` `TRANSPARENT_SCROLLBAR`），看不见滚动条但滚轮 / 触摸拖动照常，属性面板的滑轨仍可见。

## 测试

无需 WebView2 宿主：`npm i --no-save esbuild@0.21 jsdom@22 && node scripts/scada-smoke/run.mjs`（见脚本头部说明，目前 138 步；zip / 组态包 / 资源上传部分用 Node 20 自带的 `DecompressionStream` 与 jsdom 的 `File` / `FileReader`，宿主 `SaveResourceFile` / `ListResourceFiles` / `DeleteResourceFile` / `ExportScadaPackage` / `PreviewScadaPackage` / `ImportScadaPackage` 与 `https://pic.nt.local/` 静态目录都在脚本里模拟——前半段在没有打包接口的桥上跑（覆盖浏览器 / 老宿主流程），任务 42 一节再把新接口补进桩里）。宿主侧对应的自检是 `SPC.M.Test.exe --scada-package`。
