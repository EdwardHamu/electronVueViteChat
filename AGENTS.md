- The role of this file is to describe common mistakes andconfusion points that agents might encounter as they work inthis project. If you ever encounter something in the projectthat surprises you, please alert the developer working with youand indicate that this is the case in the AgentMD file to helpprevent future agents from having the same issue.

- 本项目测试不需要执行 lint 检查, 也不需要执行build检查

- 本项目已经不是electron项目, 而是依附于一个c#项目,前端通过webview2启动

- 本项目的测试方法文档在 ./docs/webview2-testing.md中

- 横竖屏/分辨率的坑：`store.isLandscape` 只在启动时由 `listenLandscape()` 按 innerHeight > innerWidth 判定一次；`store.isLowRes` 由 `isLowResolution()`（screen.width 或 innerWidth <= 1440）决定，因此竖屏（宽 ≤ 1440）几乎必然同时命中 `isLowRes` 分支——调竖屏字号时要改的是 isLowRes 那一支。

- 首页黑色装饰条（`bg-[#39393b] absolute top-[51px]`）依赖父容器 `relative`；竖屏下方区块曾漏掉 relative，导致该条以视口定位跑到屏幕顶部并盖住上方区块的 tab。tab 底边约在 65px（nav padding 8 + tab 12+30+12 + 底边 3），装饰条 top 56 + 高 14 = 70，比 tab 底边低 5px，这 5px 落在 pane 的 16px 上内边距里（pane/pane-wrapper 无背景），所以能在所有 tab 下方露出一条平整黑边；要调黑边粗细只改 `top-[..px]`（历史值 51 = 与 tab 底边齐平、不露边）：它用 z-0 排在所有 tab 之下（未选中 tab 是 position:relative、z-index auto 且在 DOM 中靠后，选中 tab 为 z-6，都会盖住它），只在 tab 之间和右侧空隙露出；不要用负 z-index，否则会被 nav 的 PanelHead 背景图盖住而完全看不见。历史上曾是 z-5（只有选中 tab 能盖住它），已按需求改掉。

- 首页「数据组态」标签页在 `src/views/Home/scada/`（README.md 有结构说明）。数据源 / 组件都走注册表，新增时不要改画布代码；文案在 `public/locales/*.json` 的 `menu.scada` 与顶层 `scada` 块。注意：这 4 个语言包里存在重复 key（如 `eccentricity`、`ellipse`），用 `json.load` → `json.dump` 重写会悄悄改掉原值，只能做文本插入。

- 真实依赖版本以 `pnpm-lock.yaml`（2026-08）为准：vue 3.5.41、naive-ui 2.45.1、vue-i18n 11.4.8、typescript 4.9.5；`package-lock.json` / `yarn.lock` 是 2023 年的旧文件，不要据此判断版本。无宿主的冒烟测试见 `scripts/scada-smoke/run.mjs`（esbuild + jsdom，桩掉 `@/store/config` 与 `@/utils/callm`，否则会把 echarts 等整套依赖拉进来）。
