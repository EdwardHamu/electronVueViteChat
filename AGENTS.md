- The role of this file is to describe common mistakes andconfusion points that agents might encounter as they work inthis project. If you ever encounter something in the projectthat surprises you, please alert the developer working with youand indicate that this is the case in the AgentMD file to helpprevent future agents from having the same issue.

- 本项目测试不需要执行 lint 检查, 也不需要执行build检查

- 本项目已经不是electron项目, 而是依附于一个c#项目,前端通过webview2启动

- 本项目的测试方法文档在 ./docs/webview2-testing.md中

- 横竖屏/分辨率的坑：`store.isLandscape` 只在启动时由 `listenLandscape()` 按 innerHeight > innerWidth 判定一次；`store.isLowRes` 由 `isLowResolution()`（screen.width 或 innerWidth <= 1440）决定，因此竖屏（宽 ≤ 1440）几乎必然同时命中 `isLowRes` 分支——调竖屏字号时要改的是 isLowRes 那一支。

- 首页黑色装饰条（`bg-[#39393b] absolute top-[51px]`）依赖父容器 `relative`；竖屏下方区块曾漏掉 relative，导致该条以视口定位跑到屏幕顶部并盖住上方区块的 tab。tab 底边约在 65px（nav padding 8 + tab 12+30+12 + 底边 3），装饰条 51+14 正好到 65：它靠 z-5 盖住未选中 tab 文字下方那一段、并低于选中 tab 的 z-6 来形成"露出黑边"的效果，不是真的伸出 tab 之下。
