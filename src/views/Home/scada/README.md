# 数据组态展示页（scada）

首页新增的「数据组态」标签页：编辑模式下从组件库把组件拖到画布上、绑定数据源、保存；展示模式按保存的布局实时显示数据。

展示模式**没有顶栏**，画布占满整个标签页；在页面任意位置**右键（触摸屏长按）**弹出菜单：`编辑` 进入编辑模式、`刷新数据源` 重新拉取数据项目录。编辑模式才显示顶部工具栏（两行：第一行是编辑标记、画布尺寸、组件库 / 图层 / 属性开关、缩放、`?` 操作说明弹窗、`⋯` 更多、**全屏**、取消 / 保存；第二行是**排列工具栏**）——操作提示不再以文字占用顶栏，全部放在 `?` 打开的 `NModal` 里（文案 `scada.help.*`，每节按 `\n` 分行）。本页挂载期间会把 `useMain().globalKeyBoardBlocked` 置为 `true`，`listenAllInputFocus` 因此不再弹出应用内虚拟键盘（离开标签页恢复）。

## 目录

| 文件 | 作用 |
| --- | --- |
| `types.ts` | 公共类型：`DataSourceProvider` / `DataBinding` / `DataPoint`（数据源层），`WidgetDefinition` / `WidgetInstance`（组件层；任务 59 起带可选的 `rotate` / `flipX` / `flipY` / `locked` / `groupId` / `hidden`），`ScadaLayout`（布局层；任务 60 起带 `variables` / `variableSeq` = 内部变量定义） |
| `dataSource/registry.ts` | 数据源注册表 + `useDataPoint()` 组合式函数（组件内按绑定读值、自动订阅 / 退订） |
| `dataSource/productSource.ts` | **产品分类数据源**：`GetDeviceGroups(CurrentGroupId)` → `GetShowDataGroups` / `GetChartDataGroups` 列出数据项；`GetRealtimeData(GId)` 按 `sysConfig.ColloctInterval` 轮询（只轮询被绑定的 GId）；标准值 / 公差取自当前配方 `curEnableFormulaParamList` |
| `dataSource/simSource.ts` | 模拟信号数据源：无宿主时调试用，也是"第二个数据源"的实现范例 |
| `dataSource/localSource.ts` | **内部变量数据源**（`local`；有哪些变量、叫什么是**布局的一部分**——默认 `var1` ~ `var16`，可在工具栏「内部变量」里增删改名，见 `variables.ts` / `VariableDialog.tsx`）：目前唯一实现了 `write()` 的数据源，按钮 / 开关 / IO 域写进来的值立即被绑定同一变量的组件读到，并持久化到 localStorage `scadaLocalVars`（这里只存 / 读「值」；变量定义由 store 通过 `setLocalVarResolver()` 注入：编辑中读草稿、展示时读已保存布局，取不到时退回默认 16 个；`pruneLocalVarValues()` 在保存并退出编辑时清掉已删变量的值） |
| `transform.ts` | 组件级**数据处理函数**：编译 / 执行用户写的 JS（三种写法、返回值合并规则、错误反馈），示例片段 `TRANSFORM_EXAMPLES` |
| `registry.ts` | 组件注册表 |
| `widgets/` | 内置组件，分四类（`WidgetDefinition.category`）：`shape` 基础图素（`shapes.tsx` 直线 / 折线 / 弧线 / 矩形 / 圆形 / 椭圆 / 扇形 / 弓形 / 多边形 / 管道，`TextLabel.tsx` 文本，`Image.tsx` 图片）、`control` 控制与显示（`controls.tsx` 数值 IO 域 / 字符 IO 域 / 日期时间域 / 按钮 / 位按钮 / 字按钮 / 位状态显示 / 字状态显示 / 文本列表 / 文本开关 / 单选框 / 复选框，`Table.tsx` 表格）、`data` 数据看板（数值卡片 / 仪表盘 / 迷你趋势 / 状态灯，以及 `visuals.tsx` 里的棒图 / 滑块 / 进度条 / 环形进度条 / 饼图 / 量表，`Custom.tsx` 自定义组件——用户自写 HTML / CSS / JS，跑在 srcdoc iframe 里）、`other` 其他（`codes.tsx` 二维码 / 条形码，编码器在 `../codes/`）。`icons.tsx` 是组件库用的 24×24 线条图标；`common.ts`（状态配色、`resolveRange` 量程推算）/ `controlCommon.ts`（`useControl` 写入封装、选项列表解析、共享秒表）为共用工具 |
| `store.ts` | Pinia store：已保存布局 `layout`、编辑草稿 `draft`、**选中项 `selectedIds`（有序，第一个 = 参考对象；`selectedId` / `selected` 只在恰好选中一个时有值）**、增删改 / 画布设置、图层顺序（置顶 / 置底 / 上移 / 下移 / 拖动排序）、组合 / 锁定 / 隐藏、对齐 / 分布 / 等宽高 / 旋转 / 翻转 / 微调 / 整体缩放（运算在 `arrange.ts`，这里只取数据、把 `Patch` 夹紧到画布内落到草稿上）、`gridOn` / `layersShow` / `fullscreen` 等编辑器开关；**任务 60**：撤销 / 重做（`history.ts` 历史栈 + `installHistory()` 里的 `$onAction` 钩子，所有编辑类 action 自动记一步，见下文「撤销」）、`batch(fn)`、剪贴板 `copySelection / cutSelection / pasteClipboard`、`selectNext(±1)`、`setVariables()`、`save({ stay })`（保存但留在编辑模式） |
| `storage.ts` | 持久化抽象 `LayoutStorage`，默认 localStorage（key `scadaLayout`） |
| `resource.ts` | **资源文件**（图片等）：有宿主时经 `JsBridge.SaveResourceFile(fileName, base64)` 存到运行目录 `Resources/pic/<GUID>.<ext>`，布局里只记返回的 `https://pic.nt.local/<GUID>.<ext>`（WebView2 虚拟主机映射到该目录，跨域 fetch 已放开）；没有宿主桥（纯浏览器调试）退回 data URL 内嵌（单张 ≤ `INLINE_MAX_BYTES` 300 KB）。还包括递归的引用收集 / 替换（`walkStrings`，嵌套属性也算）、`fetchResource` / `resourceExists`、`downloadBlob`（`a[download]` 触发浏览器下载）、宿主调用封装 `callHost`、`listResourceFiles` / `deleteResourceFile` 与 **`cleanupUnusedResources(layout)`**（删掉 `Resources/pic` 里布局不再引用的 `<32 位 hex>.<ext>` 文件，`store.save()` 与展示模式 `applyLayout()` 后自动调用） |
| `codes/qrcode.ts` / `codes/barcode.ts` | 零依赖编码器：QR 码（版本 1~40、L/M/Q/H、数字 / 字母数字 / 字节模式、掩码按规范罚分自选）与一维条码（Code 128 自动 A/B/C、EAN-13 / UPC-A、EAN-8），只输出模块矩阵 / 序列，渲染在 `widgets/codes.tsx` |
| `zip.ts` | 零依赖 zip：写 STORE（含 CRC32、UTF-8 文件名标志），读 STORE / DEFLATE（`DecompressionStream('deflate-raw')`），够用于组态包 |
| `package.ts` | **组态包**导入导出（纯逻辑）。有宿主：`exportPackageViaHost(layout)` / `previewPackageViaHost('')` / `importPackageViaHost(path)` 分别调 `JsBridge.ExportScadaPackage`（另存为对话框 + 宿主打包）/ `PreviewScadaPackage`（打开对话框 + 清点）/ `ImportScadaPackage`（解压资源到 `Resources/pic`、返回布局），`layoutFromHostImport()` 规范化返回的布局；返回 `undefined` 表示老宿主没有该接口。浏览器 / 老宿主：`buildPackage()` 把布局 + 引用的全部资源打成一个 zip（`manifest.json` + `layout.json` + `resources/…`）；`parsePackage()` 解析 zip 或直接的 JSON；`planImport()` 清点资源（本机已有同名 GUID 文件 → 复用，否则上传，包里缺的 → 缺失）；`applyPackage()` 上传 / 复用 / 内嵌并返回引用已替换的布局 |
| `ImportDialog.tsx` | 导入弹窗，两种来源：`preview`（宿主 `PreviewScadaPackage` 的清点结果 → 确认后 `ImportScadaPackage`）或 `file`（前端解析 → 上传）；清单（组件数 / 画布 / 资源统计）→ 确认后调用 `store.applyLayout()`（展示模式直接持久化，编辑模式只替换草稿） |
| `layout.ts` | 默认值与反序列化校验 / 版本迁移（任务 59 新增的可选字段在这里保留 / 清理，落单的 `groupId` 会被去掉）；`geometry.ts` 吸附、越界、缩放、旋转 / 翻转几何（`visualRect` / `layoutFromVisual` / `clampLayoutRect` / `transformCss`）等纯函数 |
| `Canvas.tsx` | 等比缩放画布、`WidgetHost`（绑定 → 处理函数 → 历史值 → 组件）、Pointer Events 拖动组件 / **八点缩放**（四角 + 四边中点，画在 overlay 层）/ **Ctrl（⌘）· Shift 点击多选**、Delete 删除、方向键微调（1px，Shift 按网格）、Ctrl + A / G 全选 / 组合；组件的旋转 / 翻转是 wrapper 上的 CSS transform；编辑模式的视图缩放（滚轮 / 双指 / 键盘 + - 0）与平移（空格 + 拖动 / 中键拖动 / 双指）；导出 `viewCenterInCanvas()`（视野中心换算成画布坐标，组件库点按居中用）/ `canvasFocused()`（Tab 切换选中要用） |
| `Palette.tsx` | 组件库，HMI 工具箱样式：按四个分类分组（点分类标题折叠 / 展开），每项是小图标 + 名称，横屏可在**网格**（3 列）/ **列表**（图标 + 名称 + 说明）间切换（记在 localStorage `scadaPaletteView`）；点按放到**当前视野正中央**（`Canvas.viewCenterInCanvas()`，连续点按同一组件依次错开两格）、按住拖到画布上松手放置；`direction` = vertical（横屏侧栏 200px）/ horizontal（竖屏顶部横向条带，分类做成竖排标签）。滚动容器是 naive-ui `NScrollbar`（悬浮式滚动条，不占内容宽度） |
| `arrange.ts` | **排列运算（纯函数）**：`alignItems`（与参考对象对齐：左 / 右 / 上 / 下 / 垂直中心轴 / 水平中心轴 / 中心点）、`centerInCanvas`（相对整个画面居中）、`distributeItems`（等间距 / 中心等距）、`sizeItems`（等宽 / 等高 / 等宽高）、`rotateItems` / `flipItems`（整个选区绕外接框中心转 / 镜像）、`resizeBounds` + `scaleItems`（八点缩放：只动被拖的边、吸附网格、不出画布、不小于最小尺寸，Shift 四角等比）、图层顺序 `orderToFront` / `orderForward` / `orderRelative` 等；位置一律按「视觉外框」算，结果是 `Patch[]`，由 `store.applyPatches()` 落地 |
| `ArrangeBar.tsx` / `toolIcons.tsx` | **排列工具栏**（编辑模式第二行，布局和图标顺序参照 HMI 组态软件的对齐工具栏）：对齐 6 个 + 「中心点 ▾」、水平 / 垂直「分布 ▾」、等宽 / 等高 / 等宽高、顺 / 逆时针旋转 90°、左右 / 上下翻转、组合 / 取消组合、锁定 / 解锁、置顶 / 置底 / 上移 / 下移一层、网格开关，最右侧显示已选数量与参考对象；不可用的变灰；按钮不抢焦点。`toolIcons.tsx` 是 24×24 的线条 SVG 图标（`currentColor`） |
| `LayerPanel.tsx` | **图层栏**（横屏在左栏组件库下方，竖屏在画布下方一行的左侧）：列表从上到下 = 画布上层到下层；点击选中（与画布双向同步，Ctrl / ⌘ 多选、Shift 选一段）；拖 ⋮⋮ 手柄排序（Pointer Events，触摸屏可用，选中多个时整批拖）、标题栏置顶 / 上移 / 下移 / 置底；每行有参考对象旗标（多选时）、眼睛（隐藏）、挂锁（锁定）；同组合的行左边有同色竖条 |
| `history.ts` | **撤销历史栈（纯函数）**：`HISTORY_LIMIT = 10`；`pushStep` / `takeUndo` / `takeRedo` / `canMerge` + `mergeStep`（同一个合并键在窗口期内并入上一步）/ `snapshotJson`；快照 = 画布 + 组件 + 变量定义的 JSON，`selection` 一起存，撤销后选中回到操作之前 |
| `shortcuts.ts` | **快捷键匹配表（纯函数）**：`matchShortcut(e)` → 命令名（`undo` / `redo` / `save` / `copy` / `cut` / `paste` / `duplicate` / `lock` / `forward` / `backward` / `toFront` / `toBack` / `selectNext` / `selectPrev` / `deselect` / `fullscreen` / `help`），多按修饰键 / 没按 Ctrl 的一律不匹配；`isTextEntry(target)`（输入框 / 文本域 / 下拉 / contenteditable）、`overlayOpen()`（有没有弹窗 / 颜色浮层 / 下拉菜单） |
| `variables.ts` | **内部变量定义（纯函数）**：`defaultVariables()`（var1 ~ var16）、`sanitizeVariables()`（丢非法 / 重复 key、名字限 40 字）、`nextVarSeq()`（key 自动编号只增不减）、`varDisplayName()`（名字留空 = 「变量 N」）、`variableUsers()`（哪些组件绑定 / 选了它）、`unbindVariables()` |
| `VariableDialog.tsx` | **内部变量管理弹窗**（工具栏「内部变量」按钮 / 属性面板「管理内部变量…」）：本地草稿列表，名称 / 标识（只读）/ 当前值 / 使用数（悬停看是哪些组件）/ 删除；重名（含默认名、不分大小写）标红并禁用「确定」；删除被引用的变量先确认；「确定」（或 Ctrl + Enter）一次写回草稿（`setVariables`，一步可撤销），取消 / ✕ 不改任何东西 |
| `panelSections.ts` | **属性面板区块的折叠状态**（任务 61）：模块级响应式状态，按区块 id 记（`widget` / `binding` / `geometry` / `props` / `actions` / `multi` / `multiBounds` / `canvas`），全局共享，存 localStorage `scadaPanelCollapsed`（折叠着的 id 数组，损坏当作没有）；`isSectionCollapsed` / `toggleSection` / `setSectionCollapsed` / `parseCollapsed` |
| `PropertyPanel.tsx` | 属性面板（标题、锁定、数据绑定、位置尺寸、按 `propSchema` 生成的组件属性、层级 / 复制 / 删除；旋转 / 翻转只在顶部排列工具栏里，面板里没有（任务 61 去掉）；**每个区块的标题都能点击折叠 / 展开**（`Section` + `panelSections.ts`）；**选中多个时是多选面板**：数量 / 参考对象 / 选区外接框 x y w h / 置顶 置底 复制 删除；未选中时编辑画布）；`columns=2` 时分两栏；底部按钮打开数据处理函数弹窗；同样用 `NScrollbar` 悬浮滚动。位置尺寸显示画面上的外框（旋转 90° 时宽高互换）。字段类型 text / textarea / number / color / boolean / select / font（系统字体，任务 62）/ image（图片 = 地址输入 + 「选择图片文件」按钮：有宿主时上传到 `Resources/pic` 只存 `https://pic.nt.local/…` 地址（≤ 20 MB），无宿主时读成 data URL 内嵌（≤ 300 KB），见 `resource.ts`） |
| `ColorField.tsx` | 颜色字段（组件颜色属性、画布背景）：一行色块按钮，点开在色块**上方弹出浮动面板**（Teleport 到 body 的 `fixed` 浮层，`z-index` 2500 高于 naive 弹窗层；向上弹出，头顶不足 220px 且下方更宽裕才翻到下方；水平夹在窗口内、小箭头指向色块；属性面板滚动 / 窗口缩放时跟随）——第一界面是**预设颜色表**，按钮切换到 HSV **调色盘**（SV 面板 + 色相条 + hex 输入）；两处都能「加入预设」，「管理」模式点色块移除、可恢复默认；`clearable` 时提供「清除」（空值 = 组件默认色）。**收起**：模块级 `activeColorField` 保证同时只展开一个；展开期间在 `document` 上监听 `focusin` / `pointerdown` / `keydown`（capture），点按 / 焦点落到面板和色块之外、Esc、面板右上角 ✕ 都收起，面板内部（含 hex 输入框）不收起 |
| `fonts.ts` / `FontField.tsx` | **系统字体**（任务 62）：`fontFamilyCss()`（选中的字体 + 默认字体栈，去掉危险字符）、字体列表（canvas 测宽探测常见字体 + Local Font Access `queryLocalFonts`）；`FontField` = 属性面板的字体下拉（可搜索、选项用自己的字体显示、本机没装的当前值标「未安装」） |
| `color.ts` / `colorPresets.ts` | hex ↔ HSV 等纯函数；预设颜色表（所有颜色字段共用，最多 64 个，localStorage key `scadaColorPresets`，损坏 / 清空时回落到默认 24 色） |
| `TransformDialog.tsx` | 数据处理函数编辑弹窗：本地草稿 + 用当前数据实时预览输出 / 错误，「确定」才写回组件，语法错误不可确定 |
| `CodeDialog.tsx` / `CodeEditor.tsx` / `highlight.ts` | `code` 类型属性的编辑弹窗（自定义组件的 HTML + CSS 同一弹窗、JS 单独）、带语法高亮的代码输入框（透明 textarea 叠高亮 pre）、无依赖的 HTML / CSS / JS 高亮分词与配色 |
| `index.tsx` | 页面入口：展示模式右键菜单（`NDropdown` trigger=manual：编辑 / 刷新数据源 / 导出组态 / 导入组态）、编辑模式两行工具栏（第一行含缩放按钮、`?` 操作说明弹窗、`⋯` 更多菜单里的导出 / 导入、全屏按钮；第二行 `ArrangeBar`）；**全屏**（根元素 `fixed inset-0 z-[1990]` 盖住整个应用窗口 + 尽力调 `documentElement.requestFullscreen()`，全屏期间不重新量「整页尺寸」）；有宿主时导出 / 导入交给宿主（另存为 / 打开对话框），否则前端打包下载、隐藏的 `<input type=file>` 选包后打开 `ImportDialog`；横屏 / 竖屏布局切换；挂载期间屏蔽虚拟键盘；**任务 60**：全局快捷键分发 `onShortcut`（匹配表在 `shortcuts.ts`）、`onSaveStay`（Ctrl + S / 「保存并继续」）、「内部变量」按钮 + `VariableDialog` |

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

## 其他：二维码 / 条形码（`widgets/codes.tsx`）

- 两个组件都不强制绑定：内容来自「内容模板」属性 `content`，其中 `{value}`（按 `decimals` / 数据源精度格式化）`{raw}` `{text}` `{name}` `{unit}` `{time}` `{status}` 用绑定的数据点替换，未绑定或无值时对应占位符为空，其它文字原样保留（`resolveTemplate()`）。默认模板 `{value}`：未绑定时内容为空，编辑模式显示「在属性面板填写内容或绑定数据」。
- 二维码：`encodeQr(text, { ecc })` 自动选最小版本与最优掩码，`qrToPath()` 把每行连续深色模块合成矩形；SVG viewBox 含 `quiet` 个模块的静区、`preserveAspectRatio="xMidYMid meet"` 保持正方形居中，可选在下方显示内容文字。内容超过 40 版容量时显示「内容太长」。
- 条形码：`format` 为 Code 128（任意 ASCII，数字段自动切 C 表）/ EAN-13（12 位自动补校验位，13 位校验；UPC-A 前面补 0 即可）/ EAN-8；不合法时显示「内容不符合 … 格式」。SVG 用 `preserveAspectRatio="none"` 横向铺满（所有条等比拉伸，宽度比例不变），静区按格式取 10 / 11+7 / 7 模块，人眼可读文字在 SVG 外单独渲染避免拉伸变形。
- 编码器经 python `qrcode`（逐模块比对 300+ 组合、40 版 × 4 等级的表）/ `python-barcode`（Code 128 / EAN 序列一致）与 `zxing-cpp`（全部解码成功）验证过；冒烟测试里保留了 HELLO WORLD 与 5177 / 5901234123457 的固定向量。

## 自定义组件（`widgets/Custom.tsx`）

- 用户在属性面板里编辑 HTML / CSS / JS（`PropFieldType = 'code'`：面板只放一个「编辑 · N 字符」按钮，点开 `CodeDialog.tsx` 弹窗，确定 / Ctrl + Enter 才写回属性）。一个 code 字段可以带多段代码（`PropField.parts: CodePart[]`，每段有自己的 key / language / example / hint）：自定义组件把 **HTML 与 CSS 放在同一个弹窗**（横屏左右两栏、竖屏上下两栏，`data-code-layout`），JS 单独一个弹窗；每段各有字符数、插入示例、清空和说明。编辑框是 `CodeEditor.tsx`——透明文字的 textarea 叠在高亮好的 `<pre>` 上（字体 / 内边距 / 换行 / `scrollbar-gutter` 完全一致，滚动同步），输入体验仍是原生 textarea；Tab 两个空格、Shift + Tab 退一级、Enter 保持缩进（`{ ( [` 后多缩一级），优先 `execCommand('insertText')` 保住撤销栈。高亮是自写的 `highlight.ts`（HTML / CSS / JS 近似分词，HTML 内嵌 `<style>` / `<script>` 分别按 CSS / JS；输出已转义且与原文等长，否则退回纯文本），配色与编辑器样式 `CODE_EDITOR_CSS` 由 `ensureCodeEditorStyle()` 一次性注入 `<head>`。三段代码由 `buildCustomDoc()` 拼成 `srcdoc` 放进 `<iframe sandbox="allow-scripts allow-same-origin allow-forms allow-modals">`：样式脚本与页面隔离，代码改了 iframe 自动重载。文档顺序是：基础样式（html/body 100%、无边距、透明背景）→ 运行时脚本（`CUSTOM_RUNTIME`，放 `<head>`，所以 HTML 里内联的 `<script>` 也能用 `scada`）→ 用户 CSS → 用户 HTML → 用户 JS；用户代码里的 `</script>` / `</style>` 会被转义成 `<\/…` 以免提前结束标签。
- 宿主 ⇄ iframe 用 `postMessage`：iframe 解析完发 `scada:ready`，宿主随后（以及数据点 / 历史 / 编辑状态 / 尺寸 / 标题 / 绑定变化时）推 `{ type: 'scada:data', point, widget, history, editing }`（`widget.props` 里不含三段代码）。iframe 内全局 `scada`：`point` / `value` / `history`（`keepHistory: 60`）/ `widget` / `editing` 只读属性，`onData(cb)` 订阅（已有数据时立即回调一次），`write(value)` 发 `scada:write` → 宿主经 `useControl().write()` 写回（只接受数字 / 文本 / 布尔；未绑定 / 只读数据源给出与按钮相同的提示），`format(v, digits)` / `statusColor(status)` 小工具。宿主只处理 `e.source === iframe.contentWindow` 的消息。
- iframe 里的右键 / 长按被运行时拦下（`preventDefault`）并转发 `scada:contextmenu {x, y}`，宿主按 `getBoundingClientRect / clientWidth` 换算画布缩放后在 iframe 元素上派发一个冒泡的 `contextmenu`，展示模式菜单照常弹出；脚本异常 / `unhandledrejection` 转发 `scada:error`，编辑模式下显示为组件左下角红色角标（`[data-custom-error]`）。编辑模式下 iframe `pointer-events: none`（和其它组件一致，拖动 / 选中不被 iframe 吃掉）；HTML 与 JS 都为空时编辑模式显示占位提示。
- 默认属性带一份示例模板（`CUSTOM_TEMPLATE`：名称 + 按精度 / 状态色显示的数值 + 单位 + 公差范围），弹窗里「插入示例」随时可恢复。运行时是 ES5 字符串常量，不会被打包器改写；jsdom 不加载 `srcdoc`，冒烟测试用独立 `JSDOM(runScripts: 'dangerously')` 跑文档并伪造 `parent` 验证运行时，宿主侧则直接向 `window` 派发 `source = iframe.contentWindow` 的 `MessageEvent`。

## 编辑器操作（任务 59）

- **多选**：Ctrl（Mac ⌘）或 Shift + 点击组件加减选择；点组合里的组件选中整个组合，Alt + 点击只选这一个；Ctrl + A 全选；点空白处取消（带 Ctrl / Shift 时保留，中键 / 右键不动选择）；在空白处拖动 = 框选（任务 62，见「字体 / 框选」）。多选时拖动、八点缩放、方向键、Delete 都作用于所有选中（且未锁定）的组件。**参考对象** = 最先选中的那个（画布上橙色外框 + 「基准」标记，图层栏里有旗标可改）：对齐、等宽高以它为准，它本身不动。
- **八点缩放**：选区（单个组件或多选的外接框）四角 + 四边中点共 8 个手柄（画在 `Canvas.tsx` 的 overlay 层，尺寸按 `1/scale` 抵消成固定的屏幕像素，点击区域更大，选区很窄时只留四角和长边手柄）；只动被拖的边，吸附网格，不出画布，不小于组件的最小尺寸；Shift + 拖四角等比缩放；多选时各组件按外接框的缩放比例一起缩放。按下不动（位移 < 3px）不算拖动。
- **旋转 / 翻转**：`rotate`（0 / 90 / 180 / 270）、`flipX` / `flipY` 是 `WidgetInstance` 的可选字段；`x / y / w / h` 仍是旋转前的外框，画面上的外框是 `geometry.visualRect()`（90° / 270° 宽高互换、中心不变），手柄、对齐、越界夹紧、属性面板的位置尺寸都按视觉外框算。CSS 是先翻转再旋转，而画面镜像作用在旋转之后，所以翻转时 `rotate` 取负（`arrange.flipItems`）。多选旋转 / 翻转像 PPT 一样整体进行。滑块这类靠指针位置取值的组件用 `widgets/common.localFraction()` 把指针落点换算回自己的坐标轴。
- **组合 / 锁定 / 隐藏**：`groupId` 相同的组件一起选中 / 移动 / 缩放（至少两个成员，落单的自动清理）；`locked` 的组件不能拖动、缩放、对齐、旋转、翻转、删除（仍可选中、改属性、调层级，角上有小锁标记；多选里有锁定的只动没锁的；被拦下时提示「所选组件已锁定」）；`hidden` 的组件展示模式不显示、编辑模式半透明。
- **排列工具栏**（`ArrangeBar.tsx`）对应关系：与参考对象对齐（左 / 右 / 上 / 下边缘，垂直中心坐标轴 = 中心 x 相同，水平中心坐标轴 = 中心 y 相同，中心点 = 两者）；「中心点 ▾」下拉里还有三个相对整个画面居中的功能（水平居中：每个对象中心落在画面水平中线上、纵向位置不变；垂直居中：y 居中、横向不变；画面中心）；分布（至少 3 个，两端不动：等间距 / 中心等距）；等宽 / 等高 / 等宽高（按参考对象）；旋转 90°、翻转、组合、锁定、四个层次按钮、网格（显示并吸附，关闭后只取整）。图标后带小三角的（中心点、两个分布）点图标 = 执行上次选的项，点三角 = 选项。
- **图层栏**（`LayerPanel.tsx`）见上表；全屏见 `index.tsx`：根元素 `fixed inset-0 z-[1990]`（低于 naive 弹窗层 2000 起，下拉 / 弹窗 / 颜色浮层仍在上面）+ 整页（`documentElement`，不是根元素，否则 Teleport 到 body 的浮层会看不见）调 `requestFullscreen()`（没有 / 被拒绝就只保留前者）；Esc（有弹窗 / 下拉 / 颜色浮层时先留给它们）/ 再点一次 / 保存或取消编辑都会退出。
- 快捷键只在焦点在画布（或页面空白）时生效：Delete / Backspace / 方向键 / Ctrl + A / Ctrl + G（组合）/ Ctrl + Shift + G（取消组合）；焦点在按钮 / 下拉 / 色块上时不拦截（选完颜色顺手按退格不会把组件删掉）。任务 60 新增的撤销 / 复制粘贴 / 保存并继续等见下一节。

## 撤销 / 快捷键 / 内部变量（任务 60）

- **撤销 / 重做**：排列工具栏最左边的两个按钮（`[data-tool-history]`，右下角小角标 = 当前能撤销 / 重做的步数）+ Ctrl + Z / Ctrl + Y（Ctrl + Shift + Z，Mac ⌘）。最多回溯最近 **10 步**（`HISTORY_LIMIT`），历史只在一次编辑会话里有效：进入编辑时清空，保存并退出 / 取消后丢弃；「保存并继续」（Ctrl + S）不清历史，保存之后仍能撤销，`dirty` 按「当前内容是否等于最后一次保存的内容」计算（撤销回到保存时的状态 = 没有未保存的修改）。
  - **怎么记**：`store.ts` 的 `installHistory()` 给 store 挂一个 `$onAction` 钩子，`HISTORY_ACTIONS` 表里的 action（增删 / 改属性 / 改绑定 / 位置尺寸 / 旋转翻转 / 组合锁定隐藏 / 层次 / 画布设置 / 粘贴剪切 / 变量…）执行前拍快照、执行后比较，**内容没变就不占步数**；选择、视图（缩放 / 网格 / 图层栏 / 全屏）不记。组件里不用自己管历史，新增会改草稿的 action 只要加进 `HISTORY_ACTIONS`。嵌套调用（比如 `cutSelection` 里调 `removeWidgets`）只记最外层的一步；`scada.batch(fn)` 把一组调用并成一步（代码属性弹窗里 HTML + CSS 一起「确定」就是这样）。
  - **什么算一步**：加 / 删 / 粘贴一次；画布上**一次拖动或一次缩放手势**（每次 `pointermove` 用同一个合并键 `drag:N`，整个手势一步）；同一个属性在 1 秒内连续修改（输入框打字、数字步进）并成一步，每次合并都会刷新计时，停顿超过 1 秒另起一步；方向键连按（间隔 0.6 秒内）同理；撤销之后、保存之后再改同一属性都不会并进旧的那一步（`lastKey` 复位）。
  - **注意**：开发模式下 pinia 会给**每次 action 调用**的 `this` 包一层新的 `Proxy`（devtools 的 action 分组），所以历史栈按 `toRaw(store)` 索引、钩子里长期持有的引用用 `ctx.store`，别直接拿 `this` 当 `WeakMap` 的键。
- **Ctrl + S**：编辑模式下保存并**留在编辑模式**（提示「组态已保存，可继续编辑」）；按钮「保存并继续」等价。和「保存」按钮（保存并退出）的区别：不清理宿主里不再引用的资源文件、不清理已删变量的值（这两件事延后到退出时的保存，因为撤销还可能把它们找回来）。焦点在输入框里也能保存（先让它失焦，免得漏掉正在输入的值）；有弹窗 / 颜色浮层打开、或不在编辑模式时不响应（不会拦掉浏览器自己的 Ctrl + S）。
- **其他快捷键**（`shortcuts.ts`，`index.tsx` 的 `onShortcut` 分发；焦点在输入框里时 Ctrl + Z / C / V / D、Tab、Esc 归浏览器，只有 Ctrl + S / F1 / F11 照常；有弹窗 / 浮层打开时一律不响应；页面上选着一段文字且焦点不在画布里时 Ctrl + C / X 也归浏览器，点过画布就仍复制 / 剪切组件——点画布清不掉别处的文字选区）：Ctrl + C / X / V 复制 / 剪切 / 粘贴（剪贴板是模块级变量，不进布局；粘贴追加到最上层并选中，连续粘贴依次错开两格，剪切后第一次粘贴原位；锁定的组件不能剪切）、Ctrl + D 就地复制、Ctrl + L 锁定 / 解锁、Ctrl + ] / [ 上移 / 下移一层（加 Shift 置顶 / 置底）、Tab / Shift + Tab 按图层顺序切换选中（只在焦点在画布 / 页面空白时；到头循环）、Esc（有全屏先退全屏，再按取消选中）、F11 全屏、F1 操作说明。Ctrl + A / G / Shift + G、Delete、方向键仍在 `Canvas.tsx`。F11 / Ctrl + S 这类浏览器加速键在真实 WebView2 里是否先被宿主吃掉没有验证（jsdom 里无法验证）。
- **组件库点按居中**：`Canvas.tsx` 导出 `viewCenterInCanvas()`——按 `canvasView` 的缩放 / 平移把**容器（视口）的中心**换算成画布坐标；中心落在画布外（放大 / 平移后）就取「可见区 ∩ 画布」里离中心最近的点；量不出视口（还没挂载 / 尺寸为 0）返回 `null`，退到画布中心。`Palette.tsx` 点按把它当作**组件的中心**传给 `store.addWidget(type, pos, { cascade })`，该位置同类型同尺寸已经有组件时每次再错开 2 个网格。按住拖到画布上松手仍然放在松手位置。
- **内部变量管理**：变量定义（`key` + 可选的显示名）存在 `ScadaLayout.variables`（`variableSeq` = 下一个自动编号），所以随草稿撤销 / 保存 / 导出导入组态包；老布局没有这个字段时补默认的 `var1` ~ `var16`。key 自动编号（`var17`、`var18`…）**只增不减、不复用**，不能改；名字可改，留空 = 默认「变量 N」，名字不能重复（含默认名、不分大小写）。删除变量：绑定它的组件（数据绑定）自动解除绑定；饼图 / 表格这类按数据项列表选的组件只是那一项不再显示（key 不复用，不会串到新变量上）。**值**（`scadaLocalVars`）不属于布局：不随导出走，删除变量后它的值在「保存并退出」时才清除（所以撤销删除能把值一起找回来）。数据源只读「当前生效的定义」（编辑中读草稿、展示时读已保存布局）。

## 属性面板（任务 61）

- **旋转 / 翻转不在面板里**：单个组件面板的「位置 / 尺寸」区块只有 x / y / w / h 四个输入框（显示画面上的外框）和锁定提示，旋转下拉、左右 / 上下翻转开关都去掉了——旋转 90° / 翻转用顶部第二行排列工具栏的按钮（多选时整体进行）。`store.setRotation()` / `setFlip()` 还在（冒烟测试和程序化调用用），只是界面上没有入口。组件自己的几何选项（多边形的「旋转角」、弓形的「朝向」、直线的「方向」、扇形 / 弧线的起止角）不属于公共的旋转 / 翻转，保留。
- **区块可折叠**：`PropertyPanel.tsx` 里的 `Section` 标题行是一个按钮（箭头朝下 = 展开、朝右 = 折叠，`data-scada-section-toggle`、`aria-expanded`），折叠时内容**不渲染**（里面开着的颜色浮层随之卸载）。单个组件面板 5 个区块（组件 / 数据绑定 / 位置尺寸 / 组件属性 / 操作）、多选面板 3 个（多选 / 选区位置尺寸 / 操作）、画布面板 1 个（画布）；同 id 的区块在不同面板里共用一份状态（「操作」在单选 / 多选里一起折叠），选中别的组件、重新进入编辑、刷新页面都保持。折叠只是界面状态：不进撤销历史、不弄脏草稿。底部「数据处理函数」按钮不是区块，始终显示。
- 标题按钮 `tabindex=-1` + mousedown `preventDefault`，点它不抢键盘焦点，折叠后仍可直接按 Delete / 方向键 / Ctrl + Z 操作画布。箭头的旋转写成**内联样式**：本应用的 `style.scss` 只有 `@tailwind utilities`、没有 base 里的 `--tw-*` 变量初值，`rotate-90` 这类 transform 工具类不会生效（`translate-*` / `scale-*` 同理）。

## 字体 / 框选（任务 62）

- **字体**：组件定义写 `hasText: true`，`registerWidget` 就会自动加一个「字体」属性（`props.fontFamily`，类型 `'font'`，放在 `fontSize` / `textSize` / `captionSize` 后面，没有字号就放最后，默认空 = 默认字体）；目前带文字的是控制组件、数据看板（含可视化组件）、文字、表格、自定义、二维码 / 条形码，纯图形和图片没有。渲染不用每个组件自己处理：`Canvas.tsx` 把 `fontFamilyCss(fontFamily)` 加在组件外层（`data-scada-font`），`src/style.scss` 的 `[data-scada-font] * { font-family: inherit !important }` 让内部所有元素（input / button、SVG 文字、`.value-number`、`font-mono`）继承。自定义组件是 iframe，继承不到，`buildCustomDoc()` 第 4 个参数把字体写进 iframe 的基础样式（用户 CSS 在后面，仍可覆盖）。多选面板有「字体」区块：给选中的带文字组件统一设置（一步撤销），字体不同时显示「多个字体」。
- **字体列表**：第一次点开字体下拉时用 canvas 测宽探测 `FONT_CANDIDATES` 里的常见字体（测不了就全列出），同时在这次点击（用户手势）里调用 Local Font Access API（`window.queryLocalFonts`，WebView2 会走宿主的权限请求，默认弹提示）；允许后合并本机全部字体，拒绝 / 不支持就只用探测结果。宿主 JsBridge 没有列字体的接口。布局从别的电脑来、本机没装的字体仍保留在下拉里，标「未安装」，显示时退回默认字体栈。
- **框选**：编辑模式下在空白处（画布，或画布外的灰色区域）按住拖动，出现蓝色框（`data-marquee`，画在 overlay 层，框可以伸出画布），**完全**落在框内的组件实时选中；组合只有整个外接框都在框内才选中（整组）；Ctrl / Shift + 框选追加到原选择（参考对象不变）。移动不到 3px 等于点空白（取消选择）。拖动中按 Esc、按下空格（平移修饰键）、第二根手指按下（改为捏合缩放）或 pointercancel：取消框选并恢复开始前的选择。按在组件 / 手柄上照旧拖动 / 缩放，中键 / 空格 + 拖动照旧平移，右键不动选择。框选只改选择，不进撤销历史。**行为变化**：以前画布外的灰色区域按下什么都不做，现在也会取消选择并开始框选。

## 新增一个组件

1. 在 `widgets/` 写一个接收 `widgetProps`（`widget`、`point`、`editing`、`history`）的 `defineComponent`——收到的 `point` 已经过数据处理函数，组件不用关心；
2. 导出一个 `WidgetDefinition`：`type`、`label()`、`description()`、`icon()`（`icons.tsx` 风格的 24×24 SVG，`currentColor`）、`category`（shape / control / data / other，决定在组件库里的分组）、`defaultSize`、`needsBinding`、`defaultProps()`、`propSchema`（属性面板自动渲染 text / textarea / number / color / boolean / select / multiselect / image；`placeholder` 可传函数以便渲染时再取 i18n；select / multiselect 的 `options(widget)` 会收到当前组件，可按别的属性动态给选项）、`component`，需要历史值时设 `keepHistory`；
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

- 横屏：左栏（200px：组件库在上、图层栏在下，图层栏高 38% 且不小于 170px，组件库关掉则图层栏占满）| 画布 | 属性面板（300px）。
- 竖屏（`useMain().isLandscape === false`）：组件库改为画布上方 92px 的横向条带（`NScrollbar xScrollable`，鼠标滚轮也横向滚动，条带内 `touch-action: pan-x`，向下拖到画布放置），下方一行（高 36%）左侧是图层栏（宽 30%，不小于 170px）、右侧是属性面板（区块两栏排布）；两行工具栏在窄屏上可以横向滚动（`.scada-noscrollbar` 隐藏滚动条）。
- 两个侧栏的滚动条都是 `NScrollbar` 的悬浮轨道（`overflow: overlay` 在新 Chromium / WebView2 里已被移除，不能靠它）；组件库（横屏列表与竖屏条带）的滑块通过 `themeOverrides` 设为完全透明（`Palette.tsx` `TRANSPARENT_SCROLLBAR`），看不见滚动条但滚轮 / 触摸拖动照常，属性面板的滑轨仍可见。

## 测试

无需 WebView2 宿主：`npm i --no-save esbuild@0.21 jsdom@22 && node scripts/scada-smoke/run.mjs`（见脚本头部说明；任务 59 加了多选 / 八点缩放 / 排列工具栏 / 旋转翻转 / 组合 / 锁定 / 图层栏 / 全屏 / 颜色浮层的用例，其中 `arrange.ts` 的纯函数直接在 node 里断言；任务 60 加了撤销 / 重做（历史栈纯函数 + 按钮 / 合并 / 上限 10 步）、Ctrl + S 保存并继续、组件库点按居中（mock 视口尺寸 + 缩放 / 平移）、内部变量管理弹窗、快捷键匹配表与分发的用例；任务 61 加了属性面板去掉旋转 / 翻转项、区块折叠（状态纯函数、各面板的折叠 / 展开 / 共享 / 持久化 / 不抢焦点 / 折叠时浮层卸载）的用例；任务 62 加了字体（纯函数、注册表自动加字段、下拉探测 + Local Font Access 桩、画布外层样式、未安装标记、多选统一设置 + 一步撤销、自定义组件 iframe）与框选（实时选中、部分框住不选、组合整体、Ctrl / Shift 追加、从灰色区域开始、Esc / 空格 / 捏合取消、点空白、组件上拖动、右键、展示模式）的用例；目前 444 步；zip / 组态包 / 资源上传部分用 Node 20 自带的 `DecompressionStream` 与 jsdom 的 `File` / `FileReader`，宿主 `SaveResourceFile` / `ListResourceFiles` / `DeleteResourceFile` / `ExportScadaPackage` / `PreviewScadaPackage` / `ImportScadaPackage` 与 `https://pic.nt.local/` 静态目录都在脚本里模拟——前半段在没有打包接口的桥上跑（覆盖浏览器 / 老宿主流程），任务 42 一节再把新接口补进桩里）。宿主侧对应的自检是 `SPC.M.Test.exe --scada-package`。

编码器交叉验证（可选）：`pip install qrcode python-barcode zxing-cpp pillow && python3 scripts/scada-smoke/verify-codes.py`——通过 `codes-dump.mjs` 用 esbuild 打包 `codes/*.ts` 批量输出矩阵，与 python `qrcode` 逐模块比对（固定掩码）、`zxing-cpp` 解码（自动掩码 / 全部条码）、`python-barcode` 比 EAN 序列与 Code 128 符号数；退出码非 0 即有差异。
