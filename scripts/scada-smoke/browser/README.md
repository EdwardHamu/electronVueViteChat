# 数据组态的真浏览器验证（可选）

`scripts/scada-smoke/run.mjs` 是 jsdom 冒烟测试（没有布局、没有真正的指针捕获 / 层叠 / 滚动）。要看真实的排版、`position: fixed` 浮层、指针捕获拖动、全屏等，可以把组态页打进一个模拟应用布局的页面，用 Playwright 的 Chromium 打开。这不是 WebView2 宿主的测试（宿主只能按 `docs/webview2-testing.md`），只是换一个真实的渲染引擎。

```bash
# 1. 工具（不要装进仓库目录）：vue / naive-ui / pinia / vue-i18n / esbuild 等同冒烟测试；另需 sass 与 tailwindcss 3.2 的命令行、playwright
pip install playwright && python3 -m playwright install chromium
#    Linux 沙箱还要系统库：sudo apt-get install -y libnspr4 libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2 libpango-1.0-0 libcairo2

# 2. 打包（输出目录默认 <tmp>/scada-browser）
OUT=/tmp/scada-browser
NODE_PATH=/path/to/node_modules node scripts/scada-smoke/browser/build.mjs $OUT

# 3. 样式：应用的 style.scss 只有 `@tailwind utilities`（没有 preflight），先 sass 再交给 tailwind CLI（沿用仓库的 tailwind.config.js）
sass src/style.scss /tmp/style.css --no-source-map
tailwindcss -c tailwind.config.js -i /tmp/style.css -o $OUT/style.css

# 4. 托管并驱动
(cd $OUT && python3 -m http.server 8765 --bind 0.0.0.0) &
python3 scripts/scada-smoke/browser/drive.py http://localhost:8765/index.html /tmp
```

注意：

- 页面里 `window.__t = { scada, main, canvasView, widgetDefinitions, pinia }`，脚本可以直接 `page.evaluate` 调 store（建组件、选中、保存）；指针 / 键盘用 Playwright 的真实鼠标键盘。
- i18n 的语言包是异步 `fetch('/locales/zh-CN.json')`，载入后等一秒再截图，否则文案是 key。
- 依赖目录里**不能有两份 vue**（比如 harness 解析到另一个装了 `vue` 的 `node_modules`），否则 pinia 报 `getActivePinia() was called but there was no active Pinia`。
- 应用全局样式（`style.scss`）把 `.n-dropdown-menu` 的选项做成 64px 高的大按钮（背景图在 `src/assets`，build.mjs 已软链），下拉菜单看起来大是正常的。
- 无头 Chromium 支持 Fullscreen API，可以验证全屏按钮；没有 CJK 字体时中文会是方块（`fonts-noto-cjk`）。
