- The role of this file is to describe common mistakes andconfusion points that agents might encounter as they work inthis project. If you ever encounter something in the projectthat surprises you, please alert the developer working with youand indicate that this is the case in the AgentMD file to helpprevent future agents from having the same issue.

- 本项目测试不需要执行 lint 检查, 也不需要执行build检查

- 本项目已经不是electron项目, 而是依附于一个c#项目,前端通过webview2启动

- 本项目的测试方法文档在 ./docs/webview2-testing.md中

- 横竖屏/分辨率的坑：`store.isLandscape` 只在启动时由 `listenLandscape()` 按 innerHeight > innerWidth 判定一次；`store.isLowRes` 由 `isLowResolution()`（screen.width 或 innerWidth <= 1440）决定，因此竖屏（宽 ≤ 1440）几乎必然同时命中 `isLowRes` 分支——调竖屏字号时要改的是 isLowRes 那一支。

- 首页黑色装饰条（`bg-[#39393b] absolute top-[51px]`）依赖父容器 `relative`；竖屏下方区块曾漏掉 relative，导致该条以视口定位跑到屏幕顶部并盖住上方区块的 tab。tab 底边约在 65px（nav padding 8 + tab 12+30+12 + 底边 3），装饰条 top 54 + 高 14 = 68，比 tab 底边低 3px，这 3px 落在 pane 的 16px 上内边距里（pane/pane-wrapper 无背景），所以能在所有 tab 下方露出一条平整黑边；要调黑边粗细只改 `top-[..px]`（历史值 51 = 与 tab 底边齐平、不露边，56 = 露 5px）：它用 z-0 排在所有 tab 之下（未选中 tab 是 position:relative、z-index auto 且在 DOM 中靠后，选中 tab 为 z-6，都会盖住它），只在 tab 之间和右侧空隙露出；不要用负 z-index，否则会被 nav 的 PanelHead 背景图盖住而完全看不见。历史上曾是 z-5（只有选中 tab 能盖住它），已按需求改掉。

- 首页「数据组态」标签页在 `src/views/Home/scada/`（README.md 有结构说明）。数据源 / 组件都走注册表，新增时不要改画布代码；文案在 `public/locales/*.json` 的 `menu.scada` 与顶层 `scada` 块。注意：这 4 个语言包里存在重复 key（如 `eccentricity`、`ellipse`），用 `json.load` → `json.dump` 重写会悄悄改掉原值，只能做文本插入。

- 真实依赖版本以 `pnpm-lock.yaml`（2026-08）为准：vue 3.5.41、naive-ui 2.45.1、vue-i18n 11.4.8、typescript 4.9.5；`package-lock.json` / `yarn.lock` 是 2023 年的旧文件，不要据此判断版本。无宿主的冒烟测试见 `scripts/scada-smoke/run.mjs`（esbuild + jsdom，桩掉 `@/store/config` 与 `@/utils/callm`，否则会把 echarts 等整套依赖拉进来）。
- 数据组态页数据处理函数（`src/views/Home/scada/transform.ts`）：`WidgetHost` 里的 `processed` 计算属性不能依赖历史值数组（历史值用普通数组 + `shallowRef` 快照），否则每次 push 都会再跑一遍用户函数，滑动平均之类的有状态函数会重复计数。画布视图状态 `canvasView.zoom/panX/panY` 只在编辑模式生效、退出编辑复位；滚轮监听必须 `{ passive: false }` 手动注册才能 `preventDefault`。竖屏时组件库条带用 `touch-action: pan-x`（横滑滚动条带、下拉到画布放置），横屏侧栏仍是 `none`。冒烟测试 `scripts/scada-smoke/run.mjs` 额外把 `@/store` 桩掉（真实模块会拉进 `@vueuse/core`），目前 35 步。
- TSX 里元素 / Teleport 的**唯一**子节点不能是布尔值：`<Teleport>{show && <div/>}</Teleport>` 在 show 为 false 时 `h()` 会把 `false` 当文本渲染成字面 "false"（曾在 body 末尾多出一个 "false" 文本节点）；有兄弟节点时布尔会变成注释没问题，唯一子节点请写三元 `: null`。数据处理函数改为属性面板底部按钮 + `TransformDialog.tsx` 弹窗（草稿 + 实时预览，确定才写回）；冒烟测试 44 步。
- 组态画布平移已从「长按空白处」改为「按住空格 + 拖动鼠标」（`canvasView.spaceDown`，容器 `tabindex=-1` 并在 pointerdown 时 focus，空格只在焦点为 body / 容器内时生效；中键拖动、双指手势保留）。属性面板「位置 / 尺寸」四个 NInputNumber 不能套通用 `Row`（88px 标签）再放进两列网格——300px 侧栏里每格只剩约 40px，数字显示不出来；现在是 1 字符标签 + `showButton={false}`。
- 与后端 SPC_M 提交 `c41cddf`（添加 beta 和壁厚数据）的对齐：`DataClassEnum` 新增 `WALL01..WALL08 = 311..318`（名称用 `config.wallThicknessN` + `{n}` 插值，`WALL_DATA_CLASSES` 列出顺序），后端把它们加进了偏心仪的 `EccDatas`，`GetDataClass(3)` 会返回，前端枚举缺失时下拉会出现 `undefined` 空选项。驱动名集中在 `devConfigNew/enum.ts` 的 `driverNameEnum`：`betaUltrasonic = 'UltrasonicWave'`（后端 `fac4e7e` 定的名；`c41cddf` 时还叫 `"Modbus Tcp Client"`，与 Modbus 驱动同名会在 `DriverHelper` 按名去重时互相覆盖——谁先被扫描谁接管所有同名设备，症状是全部 `GetRealtimeData` 报 `无效的数据`），后端若再改名只改这一处字符串。后端 `0aaa79f` 起 `DriverHelper.LoadSupportDevice()` 已把 `SPC.Driver.Beta.dll` 加进内置驱动列表（按程序目录定位）；若 `InitDevice` 仍报 `不受支持的仪器`，先用 `GetDevcieDrivers` 看后端实际加载到的驱动名列表。该驱动的连接表单是 `connect/ConnectBetaTcpForm.tsx`（Modbus TCP 参数 + `WallNum` 下拉 1~8，`propNameEnum.WallNum` / `WallNumList`），地址表单复用 `ModbusForm`；后端只在 `InitConfig` 时按 `WallNum` 生成 WALL 地址，之后改点数要手动增删地址。壁厚数据不在后端 `ChartDatas` / `ShowDatas` 里，首页曲线 / 右侧数值 / 组态数据源暂时都不会列出它们。`MyFormWrap` 的 `numInput` 渲染器项目里无人使用且未套用统一样式，需要数字输入时优先用 select。
