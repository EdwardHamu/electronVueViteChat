/**
 * 数据组态页（src/views/Home/scada）的无浏览器冒烟测试：esbuild 打包 + jsdom 挂载，不依赖 WebView2 宿主。
 *
 * 运行（仓库根目录）：
 *   npm i --no-save esbuild@0.21 jsdom@22      # 或 pnpm add -D，二者都不需要进入 package.json
 *   node scripts/scada-smoke/run.mjs
 *
 * 覆盖：组件 / 数据源注册表、产品分类数据源加载去重与按需轮询、编辑模式、组件库点按添加、
 *       拖动 / 缩放的网格吸附与最小尺寸、各示例组件渲染、数据处理函数（数字 / 对象 / 文本 / 出错 / 三种写法 / 持久状态）、
 *       画布视图缩放（滚轮 / 键盘 / 双指）与空格 + 拖动 / 中键平移、位置尺寸输入框、竖屏上下布局、Delete 删除、保存到 localStorage、取消丢弃草稿、卸载后停止轮询、
 *       工具箱式组件库（分类折叠 / 网格列表切换 / NScrollbar）、操作说明弹窗、全部图素 / 控制组件渲染、内部变量数据源写入（位按钮 / IO 域步进 / 复选框 / 字按钮 / 只读提示）、表格、多行文本与图片字段、
 *       zip 读写（STORE / DEFLATE）、组态包导出（宿主资源 + 内嵌图 → zip）/ 解析 / 清点 / 执行导入（上传 / 复用 / 内嵌 / 失败）、右键菜单导出下载与导入弹窗流程、图片经 SaveResourceFile 上传到 https://pic.nt.local/。
 *       任务 42：宿主打包（ExportScadaPackage 另存为 / PreviewScadaPackage 清点 → 导入弹窗 → ImportScadaPackage 解压并替换布局、取消 / 失败 / 编辑模式）、
 *       嵌套属性里的资源引用、保存 / 展示模式导入后经 ListResourceFiles + DeleteResourceFile 清理未引用的 GUID 文件（老宿主没有这些接口时退回前端 zip 流程 —— 前面的用例就是在没有这些接口的桥上跑的）。
 *       任务 43 / 59：颜色字段改成向上弹出的浮动面板（Teleport 到 body、fixed 定位、头顶放不下翻到下方、靠右缘时左移、滚动 / 缩放跟随），打开另一个 / 点面板外 / 焦点落到别处 / Esc / ✕ 收起，面板内操作不收起。
 *       任务 59：排列运算纯函数（对齐 / 居中 / 分布 / 等宽高 / 旋转 / 翻转 / 八点缩放 / 图层顺序 / 旋转几何 / 布局反序列化 / 指针落点换算）、Ctrl·⌘·Shift 多选与参考对象、八个缩放手柄（单个 / 多选 / Shift 等比 / 边界 / 最小尺寸）、网格开关、
 *       排列工具栏（按钮状态 / 对齐 / 画面居中下拉 / 分布 / 等宽高 / 旋转 / 翻转 / 组合 / 锁定 / 层次）、图层栏（选择同步 / 拖动排序 / 眼睛 / 挂锁 / 旗标 / 显隐开关 / 竖屏位置）、全屏（冻结整页尺寸 / Esc / Fullscreen API 桩）、属性面板（多选面板 / 锁定 / 旋转 / 翻转）、保存与读回。
 * 说明：@/store、@/store/config 与 @/utils/callm 被 stubs/ 里的桩替换（真实模块会把 echarts 等整套依赖拉进来）。
 */
import { build } from 'esbuild'
import { JSDOM, VirtualConsole } from 'jsdom'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '..', '..')
const outdir = fs.mkdtempSync(path.join(os.tmpdir(), 'scada-smoke-'))
const harness = path.join(outdir, 'harness.tsx')
fs.writeFileSync(harness, `
import { createApp, nextTick } from 'vue'
import { createPinia } from 'pinia'
import i18n from '@/i18n'
import Scada from '@/views/Home/scada'
import { useScadaStore } from '@/views/Home/scada/store'
import { useConfigStore } from '@/store/config'
import { useMain } from '@/store'
import { getDataSource, dataSourceList } from '@/views/Home/scada/dataSource'
import { widgetDefinitions } from '@/views/Home/scada/registry'
import { canvasView, zoomCanvas, resetCanvasView } from '@/views/Home/scada/Canvas'
import { compileTransform, runTransform, mergeTransformResult, transformErrors, transformDebug } from '@/views/Home/scada/transform'
import { normalizeHex, hexToHsv, hsvToHex, isLightColor } from '@/views/Home/scada/color'
import { useColorPresets, DEFAULT_COLOR_PRESETS, COLOR_PRESETS_KEY } from '@/views/Home/scada/colorPresets'
export { createApp, nextTick, createPinia, i18n, Scada, useScadaStore, useConfigStore, useMain, getDataSource, dataSourceList, widgetDefinitions }
export { canvasView, zoomCanvas, resetCanvasView, compileTransform, runTransform, mergeTransformResult, transformErrors, transformDebug }
export { normalizeHex, hexToHsv, hsvToHex, isLightColor, useColorPresets, DEFAULT_COLOR_PRESETS, COLOR_PRESETS_KEY }
import { createZip, readZip, zipEntryText, crc32 } from '@/views/Home/scada/zip'
import { buildPackage, parsePackage, planImport, applyPackage, PACKAGE_REF_PREFIX } from '@/views/Home/scada/package'
import { collectResourceRefs, RESOURCE_BASE_URL, RESOURCE_MAX_BYTES, INLINE_MAX_BYTES } from '@/views/Home/scada/resource'
import { CUSTOM_TEMPLATE, CUSTOM_RUNTIME, buildCustomDoc } from '@/views/Home/scada/widgets/Custom'
export { CUSTOM_TEMPLATE, CUSTOM_RUNTIME, buildCustomDoc }
import { highlight } from '@/views/Home/scada/highlight'
export { highlight }
import * as arrange from '@/views/Home/scada/arrange'
import { visualRect, layoutFromVisual, unionRect, normRotate, clampLayoutRect, transformCss } from '@/views/Home/scada/geometry'
import { normalizeLayout } from '@/views/Home/scada/layout'
import { localFraction } from '@/views/Home/scada/widgets/common'
export { arrange, visualRect, layoutFromVisual, unionRect, normRotate, clampLayoutRect, transformCss, normalizeLayout, localFraction }
import { encodeQr, qrToPath } from '@/views/Home/scada/codes/qrcode'
import { encodeBarcode, eanCheckDigit } from '@/views/Home/scada/codes/barcode'
import { resolveTemplate } from '@/views/Home/scada/widgets/codes'
export { encodeQr, qrToPath, encodeBarcode, eanCheckDigit, resolveTemplate }
export { createZip, readZip, zipEntryText, crc32, buildPackage, parsePackage, planImport, applyPackage, PACKAGE_REF_PREFIX, collectResourceRefs, RESOURCE_BASE_URL, RESOURCE_MAX_BYTES, INLINE_MAX_BYTES }
import { replaceResourceRefs, cleanupUnusedResources, listResourceFiles, deleteResourceFile, HOST_GENERATED_NAME } from '@/views/Home/scada/resource'
import { exportPackageViaHost, previewPackageViaHost, importPackageViaHost, layoutFromHostImport } from '@/views/Home/scada/package'
export { replaceResourceRefs, cleanupUnusedResources, listResourceFiles, deleteResourceFile, HOST_GENERATED_NAME, exportPackageViaHost, previewPackageViaHost, importPackageViaHost, layoutFromHostImport }
`)
const stubs = {
  '@/store': path.join(here, 'stubs', 'store.ts'),
  '@/store/config': path.join(here, 'stubs', 'config.ts'),
  '@/utils/callm': path.join(here, 'stubs', 'callm.ts')
}
const bundle = path.join(outdir, 'bundle.mjs')
await build({
  entryPoints: [harness],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  outfile: bundle,
  jsx: 'automatic',
  jsxImportSource: 'vue',
  tsconfig: path.join(repo, 'tsconfig.json'),
  absWorkingDir: repo,
  nodePaths: [path.join(repo, 'node_modules'), ...(process.env.NODE_PATH || '').split(path.delimiter).filter(Boolean)],
  define: { 'import.meta.env.BASE_URL': '"/"', 'process.env.NODE_ENV': '"development"', __VUE_OPTIONS_API__: 'true', __VUE_PROD_DEVTOOLS__: 'false', __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false' },
  logLevel: 'error',
  plugins: [{
    name: 'stubs',
    setup(b) {
      b.onResolve({ filter: /^@\/(store|store\/config|utils\/callm)$/ }, args => ({ path: stubs[args.path] }))
    }
  }]
})

// ---------------- jsdom 环境 ----------------
const dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>', { pretendToBeVisual: true, url: 'http://localhost/' })
const { window } = dom
for (const k of ['window', 'document', 'navigator', 'HTMLElement', 'Element', 'Node', 'SVGElement', 'getComputedStyle', 'localStorage', 'Event', 'InputEvent', 'MouseEvent', 'KeyboardEvent', 'WheelEvent', 'requestAnimationFrame', 'cancelAnimationFrame', 'CSS', 'MutationObserver', 'Text', 'Comment', 'DocumentFragment', 'HTMLInputElement', 'Blob', 'File', 'FileReader', 'HTMLAnchorElement']) {
  if (window[k] !== undefined) globalThis[k] = window[k]
}
globalThis.__resizeCallbacks = []
globalThis.ResizeObserver = class { constructor(cb) { globalThis.__resizeCallbacks.push(cb) } observe() {} disconnect() {} unobserve() {} }
globalThis.PointerEvent = window.PointerEvent || class PointerEvent extends window.MouseEvent {
  constructor(type, init = {}) { super(type, init); this.pointerId = init.pointerId ?? 1; this.pointerType = init.pointerType ?? 'mouse' }
}
window.PointerEvent = globalThis.PointerEvent
// fetch：i18n 初始化的语言包请求直接失败（随后手动注入 zh-CN）；https://pic.nt.local/<name> 由下面模拟的宿主静态目录 hostFiles 提供（导出打包 / 导入查重用）
const hostFiles = new Map()
globalThis.fetch = async url => {
  const u = String(url)
  if (!u.startsWith('https://pic.nt.local/')) return { ok: false, status: 404 }
  const bytes = hostFiles.get(decodeURIComponent(u.slice('https://pic.nt.local/'.length)))
  if (!bytes) return { ok: false, status: 404 }
  return { ok: true, status: 200, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) }
}
const origError = console.error
console.error = (...args) => { if (!String(args[0]).includes('Failed to load locale')) origError(...args) }

// ---------------- 模拟 C# 宿主桥 ----------------
const calls = { realtime: 0, groups: 0 }
const json = Data => Promise.resolve(JSON.stringify({ Code: 0, Data }))
window.chrome = { webview: { hostObjects: { JsBridge: {
  GetDeviceGroups: gid => { calls.groups++; return json(gid === 'g1' ? [{ GId: 'dev1', DeviceName: '测径仪A' }, { GId: 'dev2', DeviceName: '测温仪B' }] : []) },
  GetShowDataGroups: did => json(did === 'dev1' ? [{ GId: 'd_od', DataName: '外径', Unit: 'mm', Precision: 3 }] : [{ GId: 'd_temp', DataName: '温度', Unit: '℃', Precision: 1 }]),
  GetChartDataGroups: did => json(did === 'dev1' ? [{ GId: 'd_od', DataName: '外径', Unit: 'mm', Precision: 3 }, { GId: 'd_ov', DataName: '椭圆度', Unit: 'mm', Precision: 4 }] : []),
  GetRealtimeData: gid => { calls.realtime++; return json({ GId: gid, Value: gid === 'd_od' ? 1.523 : 88.4, StringValue: '', DataType: 0, Intime: '', Index: 0 }) },
  // 任务 41：资源上传（SPC_M 4cbe92c）——按 GUID 改名存到 Resources/pic，返回 https://pic.nt.local/ 地址；这里用递增序号代替 GUID
  SaveResourceFile: (fileName, base64Data) => {
    calls.save = (calls.save || 0) + 1
    calls.lastSave = { fileName, base64Data }
    if (typeof fileName !== 'string' || /[\\/:*?"<>|]/.test(fileName)) return Promise.resolve(JSON.stringify({ Code: 1, Message: '保存资源失败：文件名不合法' }))
    const ext = (fileName.split('.').pop() || 'bin').toLowerCase()
    const name = `${String(calls.save).padStart(8, '0')}-0000-4000-8000-000000000000.${ext}`
    const b64 = String(base64Data).replace(/^data:[^,]*,/, '')
    const bytes = new Uint8Array(Buffer.from(b64, 'base64'))
    hostFiles.set(name, bytes)
    return json({ FileName: name, OriginalFileName: fileName, RelativePath: 'Resources/pic/' + name, Url: 'https://pic.nt.local/' + name, Size: bytes.length })
  }
} } } }
globalThis.chrome = window.chrome

const m = await import(pathToFileURL(bundle).href)
const { createApp, nextTick, createPinia, i18n, Scada, useScadaStore, useConfigStore, useMain, getDataSource, dataSourceList, widgetDefinitions } = m
const { canvasView, zoomCanvas, resetCanvasView, compileTransform, runTransform, mergeTransformResult, transformErrors, transformDebug } = m
const { normalizeHex, hexToHsv, hsvToHex, isLightColor, useColorPresets, DEFAULT_COLOR_PRESETS, COLOR_PRESETS_KEY } = m
const { createZip, readZip, zipEntryText, crc32, buildPackage, parsePackage, planImport, applyPackage, PACKAGE_REF_PREFIX, collectResourceRefs, RESOURCE_BASE_URL, RESOURCE_MAX_BYTES, INLINE_MAX_BYTES } = m
const { CUSTOM_TEMPLATE, CUSTOM_RUNTIME, buildCustomDoc, highlight, encodeQr, qrToPath, encodeBarcode, eanCheckDigit, resolveTemplate } = m
const { arrange, visualRect, layoutFromVisual, unionRect, normRotate, clampLayoutRect, transformCss, normalizeLayout, localFraction } = m
i18n.global.setLocaleMessage('zh-CN', JSON.parse(fs.readFileSync(path.join(repo, 'public/locales/zh-CN.json'), 'utf8')))
i18n.global.locale.value = 'zh-CN'

const sleep = ms => new Promise(r => setTimeout(r, ms))
const pinia = createPinia()
const app = createApp(Scada).use(pinia).use(i18n)
app.config.warnHandler = msg => { if (!/Extraneous non-props|Non-function value encountered for default slot/.test(msg)) console.warn('[vue warn]', msg) }
window.$message = { success: t => console.log('  $message.success:', t), error: t => console.log('  $message.error:', t) }
const configStore = useConfigStore(pinia)
configStore.sysConfig = { CurrentGroupId: 'g1', ColloctInterval: 100 }
configStore.curEnableFormulaParamList = [{ DataGroupId: 'd_od', Standard: 1.5, UpperTol: 0.05, LowerTol: 0.05 }]

const root = document.getElementById('app')
app.mount(root)
await nextTick(); await sleep(50)

let step = 0
const check = (name, fn) => { step++; fn(); console.log(`  ✓ ${step}. ${name}`) }
/** NScrollbar 滑块是否完全透明（naive 把主题变量写在 .n-scrollbar 的行内 style：--n-scrollbar-color / --n-scrollbar-color-hover） */
const scrollbarTransparent = el => { const st = el.getAttribute('style') || ''; return /--n-scrollbar-color:\s*transparent/.test(st) && /--n-scrollbar-color-hover:\s*transparent/.test(st) }

const SHAPES = ['line', 'polyline', 'arc', 'rect', 'circle', 'ellipse', 'sector', 'segment', 'polygon', 'textLabel', 'image', 'pipe']
const CONTROLS = ['numericIO', 'stringIO', 'datetime', 'button', 'bitButton', 'wordButton', 'bitStatus', 'wordStatus', 'textList', 'textSwitch', 'radio', 'checkbox', 'table']
const DATA = ['valueCard', 'gauge', 'sparkline', 'statusLamp']
const VISUAL = ['barGauge', 'slider', 'progressBar', 'ringProgress', 'pie', 'meter']
const CUSTOM = ['custom']
const OTHER = ['qrCode', 'barcode']
check('注册表：四类共 38 个组件，全部带图标与分类（可视化组件 + 自定义组件归入数据看板，二维码 / 条形码归入「其他」）', () => {
  assert.deepEqual(widgetDefinitions().map(d => d.type), [...SHAPES, ...CONTROLS, ...DATA, ...VISUAL, ...CUSTOM, ...OTHER])
  widgetDefinitions().forEach(d => { assert.equal(typeof d.icon, 'function', d.type); assert.ok(['shape', 'control', 'data', 'other'].includes(d.category), d.type) })
  assert.ok([...DATA, ...VISUAL, ...CUSTOM].every(t => widgetDefinitions().find(d => d.type === t).category === 'data'))
  assert.ok(OTHER.every(t => widgetDefinitions().find(d => d.type === t).category === 'other'))
  const qd = widgetDefinitions().find(d => d.type === 'qrCode'); assert.ok(qd.description().includes('{value} {name}'), qd.description())  // 文案里的模板占位符不能被 vue-i18n 吃掉
  assert.equal(qd.propSchema[0].placeholder(), '{value}，可用 {name} {unit} {text} {time} {status} {raw}')
  assert.deepEqual(dataSourceList().map(p => p.id), ['product', 'sim', 'local'])
})
const buttons = () => [...root.querySelectorAll('button')]
const main = useMain(pinia)
check('展示模式空状态：没有顶栏（无“编辑 / 刷新”按钮），画布占满整页', () => {
  assert.ok(root.textContent.includes('尚未配置组态组件')); assert.ok(root.textContent.includes('右键'))
  assert.ok(!buttons().some(b => ['编辑', '刷新数据源'].includes(b.textContent.trim()))); assert.ok(!root.querySelector('.h-11'))
  assert.ok(!root.textContent.includes('false')) // 条件渲染的布尔值不能变成文本
})
check('组态页挂载后屏蔽虚拟键盘', () => { assert.equal(main.globalKeyBoardBlocked, true); assert.equal(main.globalKeyBoardShow, false) })
const product = getDataSource('product')
check('产品分类数据源按 CurrentGroupId 加载并去重', () => {
  assert.deepEqual(product.options().map(o => `${o.group}/${o.label}`), ['测径仪A/外径', '测径仪A/椭圆度', '测温仪B/温度'])
})
const scada = useScadaStore(pinia)
const contextMenu = async (x = 30, y = 40) => {
  const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: x, clientY: y })
  // 从页面内部（画布区域）冒泡上来，模拟在任意位置右键 / 长按
  ;(canvasView.el || root.firstElementChild).dispatchEvent(ev); await nextTick(); await sleep(30)
  return ev
}
const menuItems = () => [...document.body.querySelectorAll('.n-dropdown-option-body')]
const menuItem = text => menuItems().find(o => o.textContent.trim() === text)
const cmEv = await contextMenu()
check('展示模式右键弹出菜单：标题 / 组件数 + 编辑 + 刷新数据源', () => {
  assert.ok(cmEv.defaultPrevented); assert.ok(menuItem('编辑') && menuItem('刷新数据源'))
  assert.ok(document.body.querySelector('.n-dropdown-menu').textContent.includes('数据组态'))
})
menuItem('编辑').click(); await nextTick(); await sleep(30)
check('右键菜单“编辑”进入编辑模式，顶栏出现', () => {
  assert.ok(scada.editing); assert.ok(root.textContent.includes('组件库') && root.textContent.includes('数值卡片') && root.textContent.includes('画布'))
  assert.ok(root.textContent.includes('编辑模式')); assert.ok(buttons().some(b => b.textContent.trim() === '保存')); assert.ok(!menuItem('编辑'))
})
const cmEdit = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 30, clientY: 40 }); root.firstElementChild.dispatchEvent(cmEdit); await nextTick()
check('编辑模式下右键不弹菜单（保留默认行为）', () => { assert.ok(!cmEdit.defaultPrevented); assert.equal(menuItems().length, 0) })
const item = root.querySelector('[data-palette-item="valueCard"]')
item.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 10, clientY: 10, pointerId: 7 }))
item.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: 11, clientY: 11, pointerId: 7 }))
await nextTick()
check('组件库点按添加', () => { assert.equal(scada.draft.widgets.length, 1); assert.equal(scada.draft.widgets[0].type, 'valueCard'); assert.equal(scada.selectedId, scada.draft.widgets[0].id) })
const w = scada.draft.widgets[0]
const wA = () => scada.draft.widgets.find(e => e.id === w.id)
scada.setBinding(w.id, { source: 'product', key: 'd_od', label: '外径' })
await sleep(350); await nextTick()
check('绑定后轮询取值并渲染（含配方公差）', () => {
  assert.ok(calls.realtime > 0); const p = product.read('d_od')
  assert.equal(p.value, 1.523); assert.equal(p.status, 'ok'); assert.equal(p.upper, 1.55); assert.equal(p.lower, 1.45)
  assert.ok(root.textContent.includes('1.523')); assert.ok(root.textContent.includes('外径'))
})
check('未订阅的数据项不轮询', () => { assert.equal(product.read('d_temp').status, 'offline'); assert.equal(product.read('d_temp').name, '温度') })
const wrapper = [...root.querySelectorAll('div')].find(d => d.style.cursor === 'move')
const x0 = w.x, y0 = w.y
wrapper.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 100, clientY: 100, pointerId: 3 }))
wrapper.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 153, clientY: 128, pointerId: 3 }))
wrapper.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: 153, clientY: 128, pointerId: 3 }))
await nextTick()
check('拖动按网格吸附', () => { assert.equal(w.x, x0 + 50); assert.equal(w.y, y0 + 30) })
const handle = root.querySelector('[data-handle="se"]')
const w0 = w.w
handle.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 0, clientY: 0, pointerId: 4 }))
wrapper.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 44, clientY: -100, pointerId: 4 }))
wrapper.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: 44, clientY: -100, pointerId: 4 }))
await nextTick()
check('缩放吸附 + 最小尺寸', () => { assert.equal(w.w, w0 + 40); assert.equal(w.h, 50) })
for (const type of ['gauge', 'sparkline', 'statusLamp', 'textLabel']) scada.addWidget(type)
scada.setBinding(scada.draft.widgets.find(e => e.type === 'sparkline').id, { source: 'sim', key: 'sine', label: 'sine' })
scada.setBinding(scada.draft.widgets.find(e => e.type === 'gauge').id, { source: 'product', key: 'd_temp' })
scada.setBinding(scada.draft.widgets.find(e => e.type === 'statusLamp').id, { source: 'sim', key: 'walk' })
scada.setWidgetProp(scada.draft.widgets.find(e => e.type === 'textLabel').id, 'text', '生产线一号机')
await sleep(1200); await nextTick()
check('其余组件渲染（模拟数据源 / SVG / 历史值）', () => {
  assert.ok(root.querySelector('polyline')); assert.ok(root.querySelector('svg path'))
  assert.ok(root.textContent.includes('生产线一号机')); assert.ok(root.textContent.includes('88.4'))
  assert.equal(product.read('d_temp').status, 'none')
})
// ---------------- 数据处理函数 ----------------
const ctx = () => ({ widget: { id: 'x', type: 'valueCard', props: {} }, history: [], state: {}, prev: undefined, now: 0 })
const pt = { value: 1.5, status: 'ok', unit: 'mm', precision: 3, standard: 1.5, upper: 1.55, lower: 1.45 }
check('处理函数：三种写法 / 返回类型合并（纯函数）', () => {
  assert.equal(runTransform(compileTransform('(v) => v * 2'), pt, ctx()).point.value, 3)
  assert.equal(runTransform(compileTransform('function (value, point) { return point.upper }'), pt, ctx()).point.value, 1.55)
  assert.equal(runTransform(compileTransform('if (value > 1) return "big"\nreturn "small"'), pt, ctx()).point.text, 'big')
  assert.equal(runTransform(compileTransform('value * 1000;'), pt, ctx()).point.value, 1500)
  assert.equal(runTransform(compileTransform('value * 2 // 注释'), pt, ctx()).point.value, 3)
  assert.equal(runTransform(compileTransform('   '), pt, ctx()).point, pt)
  assert.equal(compileTransform('return (').error !== null, true)
  assert.match(runTransform(compileTransform('return [1]'), pt, ctx()).error, /array/)
  assert.match(runTransform(compileTransform('async () => 1'), pt, ctx()).error, /async/)
  const merged = mergeTransformResult(pt, { value: '2.5', unit: 'μm', upper: 2, lower: 1 })
  assert.equal(merged.value, 2.5); assert.equal(merged.unit, 'μm'); assert.equal(merged.status, 'high')
  assert.equal(mergeTransformResult(pt, { status: 'low' }).status, 'low')
  assert.equal(mergeTransformResult(pt, { value: 'N/A' }).text, 'N/A')
  assert.equal(mergeTransformResult(pt, null).value, null)
  assert.equal(mergeTransformResult(pt, true).text, 'true')
  assert.equal(mergeTransformResult(undefined, 7).status, 'none')
  const st = ctx(); const avg = compileTransform('const b = ctx.state.b || (ctx.state.b = []); b.push(value); return b.reduce((a, c) => a + c, 0) / b.length')
  runTransform(avg, { value: 1, status: 'none' }, st); assert.equal(runTransform(avg, { value: 3, status: 'none' }, st).point.value, 2)
})
scada.select(w.id); await nextTick()
const transformBtn = () => [...root.querySelectorAll('button')].find(b => b.textContent.trim().startsWith('数据处理函数'))
const inModal = sel => document.body.querySelector(`.n-modal-container ${sel}`)
transformBtn().click(); await nextTick(); await sleep(50)
check('属性面板底部按钮打开处理函数弹窗（面板内不再有代码区）', () => {
  assert.ok(!root.textContent.includes('插入示例')); assert.ok(document.body.textContent.includes('插入示例'))
  assert.ok(document.body.textContent.includes('输入代码后')); assert.ok(inModal('textarea'))
})
check('body 里没有多余的 "false" 文本节点（Teleport 唯一子节点不能是布尔值）', () => {
  assert.ok(![...document.body.childNodes].some(n => n.nodeType === 3 && n.textContent.trim() === 'false'))
})
const ta = inModal('textarea')
ta.value = 'return value * 1000'; ta.dispatchEvent(new Event('input', { bubbles: true })); await nextTick()
check('弹窗内用当前数据实时预览草稿输出，未确定前不写回组件', () => {
  assert.ok(document.body.textContent.includes('输出: 1523.000'), document.body.textContent.slice(-800)); assert.equal(w.transform || '', '')
})
ta.value = 'return ('; ta.dispatchEvent(new Event('input', { bubbles: true })); await nextTick()
const okBtn = () => [...document.body.querySelectorAll('.n-modal-container button')].find(b => b.textContent.trim() === '确定')
check('语法错误时显示错误且不能确定', () => { assert.ok(document.body.textContent.includes('函数错误: SyntaxError')); assert.ok(okBtn().disabled) })
ta.value = 'return value * 1000'; ta.dispatchEvent(new Event('input', { bubbles: true })); await nextTick()
okBtn().click(); await nextTick(); await sleep(50)
check('确定后写回组件、画布生效、按钮标记已启用', () => {
  assert.equal(w.transform, 'return value * 1000'); assert.ok(root.textContent.includes('1523.000'), root.textContent.slice(0, 200))
  assert.ok(transformBtn().textContent.includes('已启用')); assert.equal(transformErrors[w.id], undefined)
  assert.equal(transformDebug[w.id].input.value, 1.523); assert.equal(transformDebug[w.id].output.value, 1523); assert.equal(transformDebug[w.id].output.status, 'ok')
})
scada.updateWidget(w.id, { transform: "return { value: value * 1000, upper: point.upper * 1000, lower: point.lower * 1000, unit: 'μm' }" }); await nextTick()
check('组件处理函数：对象 → 合并公差 / 单位并重判状态', () => {
  const out = transformDebug[w.id].output
  assert.equal(out.upper, 1550); assert.equal(out.unit, 'μm'); assert.equal(out.status, 'ok'); assert.ok(root.textContent.includes('μm'))
})
scada.updateWidget(w.id, { transform: 'return { upper: 1 }' }); await nextTick()
check('组件处理函数：公差变化后状态重判为超上限', () => assert.equal(transformDebug[w.id].output.status, 'high'))
scada.updateWidget(w.id, { transform: "value > 1 ? '合格' : '不合格'" }); await nextTick()
check('组件处理函数：字符串 → 显示文本', () => { assert.ok(root.textContent.includes('合格')); assert.equal(transformDebug[w.id].output.value, null) })
scada.updateWidget(w.id, { transform: 'return foo.bar' }); await nextTick()
check('组件处理函数：出错时保持原值并在底部按钮上反馈错误', () => {
  assert.ok(root.textContent.includes('1.523')); assert.match(transformErrors[w.id], /ReferenceError/); assert.ok(transformBtn().textContent.includes('函数错误'))
})
scada.updateWidget(w.id, { transform: '' }); await nextTick()
check('清空处理函数后错误消失', () => { assert.equal(transformErrors[w.id], undefined); assert.ok(!transformBtn().textContent.includes('函数错误')) })
const label = scada.draft.widgets.find(e => e.type === 'textLabel')
scada.setBinding(label.id, { source: 'product', key: 'd_od' }); scada.updateWidget(label.id, { transform: "return '外径 ' + value.toFixed(2) + ' mm'" }); await sleep(250); await nextTick()
check('文本标签绑定数据 + 处理函数拼动态文字', () => assert.ok(root.textContent.includes('外径 1.52 mm'), root.textContent.slice(0, 300)))

// ---------------- 颜色选择器：预设表 → 调色盘 ----------------
check('颜色工具函数', () => {
  assert.equal(normalizeHex(' #ABC '), '#aabbcc'); assert.equal(normalizeHex('ff8d3f'), '#ff8d3f'); assert.equal(normalizeHex('#12345'), null); assert.equal(normalizeHex(''), null)
  assert.deepEqual(hexToHsv('#ff0000'), { h: 0, s: 1, v: 1 }); assert.equal(hsvToHex({ h: 120, s: 1, v: 1 }), '#00ff00'); assert.equal(hsvToHex(hexToHsv('#ff8d3f')), '#ff8d3f')
  assert.equal(isLightColor('#ffffff'), true); assert.equal(isLightColor('#1f2937'), false)
})
scada.select(w.id); await nextTick()
const fields = () => [...root.querySelectorAll('[data-color-field]')]
const popups = () => [...document.body.querySelectorAll('[data-color-popup]')]
const popup = () => popups()[0]
const panel = () => document.body.querySelector('[data-color-panel]')
check('属性面板颜色字段是「标签 + 色块按钮」：没有行内面板、没有 NColorPicker 弹层，面板没打开时 body 里也没有浮层', () => {
  assert.equal(fields().length, 2); assert.ok(!root.querySelector('.n-color-picker')); assert.ok(!root.querySelector('[data-color-panel]')); assert.equal(popups().length, 0)
  assert.ok(fields()[0].querySelector('[data-color-trigger]').textContent.includes('▲'), '色块按钮上的小箭头朝上，提示向上弹出')
})
const bgField = fields()[0]
const trig = f => f.querySelector('[data-color-trigger]')
/** jsdom 没有布局：给色块按钮一个屏幕位置（窗口 1024×768） */
const placeTrigger = (f, left, top, width = 200) => { trig(f).getBoundingClientRect = () => ({ left, top, width, height: 28, right: left + width, bottom: top + 28 }) }
placeTrigger(bgField, 700, 500)
trig(bgField).click(); await nextTick()
check('点色块：在 body 下弹出浮动面板（Teleport 到 body 的 fixed 浮层，不在属性面板 / 字段行里），向上弹出——底边贴在色块上沿之上、小箭头指向色块', () => {
  assert.ok(popup() && panel()); assert.ok(!bgField.contains(popup())); assert.equal(popup().parentElement, document.body); assert.ok(popup().classList.contains('fixed'))
  assert.equal(popup().dataset.placement, 'top'); assert.equal(popup().style.bottom, '276px', popup().getAttribute('style'))   // 768 - 500 + 8
  assert.equal(popup().style.top, ''); assert.equal(popup().style.width, '272px'); assert.equal(popup().style.left, '664px')   // 以色块中心 800 为基准居中
  assert.ok(Number(popup().style.zIndex) >= 2100, '浮层要高于 naive 的弹窗层（2000 起）')
  assert.equal(panel().style.maxHeight, '484px')   // 上方可用高度 = 500 - 8 - 8
  assert.ok(popup().querySelector('div[style*="rotate(45deg)"]'), '有指向色块的小箭头')
  assert.ok(trig(bgField).textContent.includes('▼'), '打开时色块按钮的小箭头翻转')
})
check('点开后第一界面是预设颜色表（默认 24 色），此时没有调色盘', () => {
  assert.ok(panel()); assert.equal(panel().querySelectorAll('[data-color]').length, DEFAULT_COLOR_PRESETS.length)
  assert.ok(!panel().querySelector('[data-color-sv]')); assert.ok(panel().textContent.includes('预设颜色')); assert.ok(!panel().textContent.includes('false'))
  assert.ok(panel().querySelector('[data-color-close]') && panel().querySelector('[data-color-switch]'))
})
panel().querySelector('[data-color="#ff8d3f"]').click(); await nextTick()
check('点预设色块 → 写入组件属性并高亮选中（面板保持打开，可以接着试别的颜色）', () => {
  assert.equal(wA().props.bg, '#ff8d3f'); assert.ok(panel().querySelector('[data-color="#ff8d3f"]').textContent.includes('✓'))
  assert.ok(trig(bgField).textContent.includes('#ff8d3f')); assert.ok(popup())
})
panel().querySelector('[data-color-switch]').click(); await nextTick()
check('按钮切换到调色盘：SV 面板 + 色相条 + hex 输入', () => {
  assert.ok(panel().querySelector('[data-color-sv]') && panel().querySelector('[data-color-hue]') && panel().querySelector('input'))
  assert.ok(!panel().querySelector('[data-color-presets]')); assert.equal(panel().querySelector('input').value, '#ff8d3f')
})
const sv = panel().querySelector('[data-color-sv]')
sv.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100 })
sv.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 100, clientY: 0, pointerId: 21, button: 0 }))
sv.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: 100, clientY: 0, pointerId: 21 })); await nextTick()
check('在 SV 面板上点按 → 按当前色相取纯色写回（面板内的点按不会收起面板）', () => { assert.equal(wA().props.bg, hsvToHex({ ...hexToHsv('#ff8d3f'), s: 1, v: 1 })); assert.ok(popup()) })
const hexInput = panel().querySelector('input')
hexInput.value = '#123456'; hexInput.dispatchEvent(new InputEvent('input', { bubbles: true })); await nextTick()
check('hex 输入满 6 位立即生效', () => assert.equal(wA().props.bg, '#123456'))
const addBtn = () => [...panel().querySelectorAll('button')].find(b => b.textContent.includes('加入预设'))
addBtn().click(); await nextTick()
const presets = useColorPresets()
check('调色盘里“加入预设”追加到预设表并持久化', () => {
  assert.equal(presets.colors.length, DEFAULT_COLOR_PRESETS.length + 1); assert.equal(presets.colors.at(-1), '#123456')
  assert.deepEqual(JSON.parse(localStorage.getItem(COLOR_PRESETS_KEY)), presets.colors); assert.ok(addBtn().disabled)
})
panel().querySelector('[data-color-switch]').click(); await nextTick()
check('切回预设表：新颜色出现在末尾', () => assert.equal([...panel().querySelectorAll('[data-color]')].at(-1).dataset.color, '#123456'))
;[...panel().querySelectorAll('button')].find(b => b.textContent.trim() === '管理').click(); await nextTick()
panel().querySelector('[data-color="#123456"]').click(); await nextTick()
check('管理模式点色块 → 从预设移除并持久化（组件属性不变）', () => {
  assert.equal(presets.colors.length, DEFAULT_COLOR_PRESETS.length); assert.ok(!panel().querySelector('[data-color="#123456"]'))
  assert.equal(JSON.parse(localStorage.getItem(COLOR_PRESETS_KEY)).length, DEFAULT_COLOR_PRESETS.length); assert.equal(wA().props.bg, '#123456')
})
;[...panel().querySelectorAll('button')].find(b => b.textContent.trim() === '清除').click(); await nextTick()
check('“清除”恢复为组件默认色（空值）', () => { assert.equal(wA().props.bg, ''); assert.ok(trig(bgField).textContent.includes('默认')) })
trig(bgField).click(); await nextTick()
check('再次点击色块按钮收起面板（浮层从 body 里消失）', () => { assert.ok(!panel()); assert.equal(popups().length, 0) })
// ---- 自动收起：打开另一个颜色字段 / 焦点或点按落到面板和色块之外的任何地方 / Esc / ✕；面板内部的操作不收起 ----
const fgField = fields()[1]
const panelOf = () => panel()
placeTrigger(fgField, 700, 560)
trig(bgField).click(); await nextTick(); trig(fgField).click(); await nextTick()
check('打开另一个颜色字段：先前展开的自动收起，同一时间只有一个浮层', () => { assert.equal(popups().length, 1); assert.ok(popup().textContent.includes(fgField.querySelector('.truncate').textContent)); assert.equal(popup().style.bottom, '216px') })   // 768 - 560 + 8
const otherInput = [...root.querySelectorAll('input')].find(i => !i.closest('[data-color-field]'))
assert.ok(otherInput, '属性面板里应有别的输入框')
otherInput.focus(); await nextTick()
check('焦点移到别的输入框（focusin）：颜色面板收起', () => { assert.equal(document.activeElement, otherInput); assert.equal(popups().length, 0) })
otherInput.blur(); await nextTick()
trig(fgField).click(); await nextTick(); assert.ok(panelOf())
otherInput.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 31, button: 0 })); await nextTick()
check('在别的输入框上按下（触摸等拿不到焦点的场景）：颜色面板收起', () => assert.equal(popups().length, 0))
trig(fgField).click(); await nextTick(); panelOf().querySelector('[data-color-switch]').click(); await nextTick()
const ownHex = panelOf().querySelector('input'); ownHex.focus(); await nextTick()
ownHex.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 32, button: 0 })); await nextTick()
check('面板内自己的 hex 输入框获得焦点 / 点按：不收起', () => { assert.ok(panelOf()); assert.ok(panelOf().querySelector('[data-color-sv]')) })
ownHex.blur(); await nextTick()
root.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 33, button: 0 })); await nextTick()
check('点面板外的空白处：浮层收起（浮层不是行内面板，点外面就关）', () => assert.equal(popups().length, 0))
trig(fgField).click(); await nextTick()
trig(bgField).dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 34, button: 0 })); trig(bgField).click(); await nextTick()
check('按下另一个颜色字段的按钮：旧面板先收起、新面板打开且回到预设表', () => { assert.equal(popups().length, 1); assert.ok(popup().textContent.includes(bgField.querySelector('.truncate').textContent)); assert.ok(panelOf().querySelector('[data-color-presets]')) })
document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await nextTick()
check('按 Esc 收起', () => assert.equal(popups().length, 0))
trig(bgField).click(); await nextTick(); panel().querySelector('[data-color-close]').click(); await nextTick()
check('点面板右上角 ✕ 收起', () => assert.equal(popups().length, 0))
// 定位：头顶放不下时翻到下方；靠近窗口右缘时左移、箭头仍指向色块；属性面板滚动 / 窗口缩放时跟随色块
placeTrigger(bgField, 960, 40, 60)
trig(bgField).click(); await nextTick()
check('头顶放不下（色块离窗口上沿只有 40px）而下方宽裕：翻到色块下方；靠近右缘时面板左移贴边、箭头仍指向色块中心', () => {
  assert.equal(popup().dataset.placement, 'bottom'); assert.equal(popup().style.top, '76px', popup().getAttribute('style')); assert.equal(popup().style.bottom, '')   // 40 + 28 + 8
  assert.equal(popup().style.left, '744px'); assert.equal(panel().style.maxHeight, String(768 - 68 - 16) + 'px')   // 1024 - 272 - 8
  assert.ok(popup().querySelector('div[style*="left: 241px"]'), popup().innerHTML.slice(-300))   // 色块中心 990 - 744 = 246，箭头左边缘 246 - 5
})
placeTrigger(bgField, 100, 600, 200)
window.dispatchEvent(new window.Event('resize')); await nextTick()
check('窗口缩放 / 滚动时面板重新定位并回到向上弹出', () => { assert.equal(popup().dataset.placement, 'top'); assert.equal(popup().style.bottom, '176px'); assert.equal(popup().style.left, '64px') })   // 768 - 600 + 8；中心 200 - 136
placeTrigger(bgField, 100, 500, 200)
document.dispatchEvent(new window.Event('scroll')); await nextTick()
check('监听属性面板滚动（捕获阶段）', () => assert.equal(popup().style.bottom, '276px'))
trig(bgField).click(); await nextTick()
check('收起后没有任何颜色面板残留，滚动监听也已移除', () => {
  assert.equal(popups().length, 0); placeTrigger(bgField, 100, 300, 200); window.dispatchEvent(new window.Event('resize')); assert.equal(popups().length, 0)
})

// ---------------- 视图缩放 / 平移（编辑模式） ----------------
const container = canvasView.el.parentElement
container.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, clientX: 50, clientY: 50, bubbles: true, cancelable: true })); await nextTick()
check('滚轮放大', () => { assert.ok(canvasView.zoom > 1.1 && canvasView.zoom < 1.2, String(canvasView.zoom)); assert.ok(root.textContent.includes('复位视图')) })
container.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, clientX: 50, clientY: 50, bubbles: true, cancelable: true })); await nextTick()
check('滚轮缩小回到原比例', () => assert.ok(Math.abs(canvasView.zoom - 1) < 1e-9))
window.dispatchEvent(new KeyboardEvent('keydown', { key: '+' })); zoomCanvas(1.5); await nextTick()
check('键盘 + / 工具栏缩放', () => { assert.ok(Math.abs(canvasView.zoom - 1.8) < 1e-9); assert.ok(root.textContent.includes('180%')) })
resetCanvasView(); await nextTick()
check('复位视图', () => { assert.equal(canvasView.zoom, 1); assert.equal(canvasView.panX, 0) })
// 先点一下画布：容器获得焦点，之后的空格才被当作平移修饰键
container.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 5, clientY: 5, pointerId: 8, button: 0 }))
container.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: 5, clientY: 5, pointerId: 8, button: 0 }))
check('点击画布容器后容器获得焦点', () => assert.equal(document.activeElement, container))
// ---------------- 方向键微调 ----------------
const key = (k, init = {}) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init }))
scada.select(w.id); await nextTick()
const { x: ax, y: ay } = wA()
key('ArrowRight'); key('ArrowDown'); key('ArrowDown'); await nextTick()
check('方向键微调选中组件（1px）', () => { assert.equal(wA().x, ax + 1); assert.equal(wA().y, ay + 2) })
key('ArrowLeft', { shiftKey: true }); key('ArrowUp', { shiftKey: true }); await nextTick()
check('Shift + 方向键按网格步进', () => { const g = scada.draft.canvas.grid || 10; assert.equal(wA().x, ax + 1 - g); assert.equal(wA().y, ay + 2 - g) })
for (let i = 0; i < 400; i++) key('ArrowLeft', { shiftKey: true })
await nextTick()
check('微调不会越出画布', () => assert.equal(wA().x, 0))
scada.updateWidgetRect(w.id, { x: ax, y: ay, w: wA().w, h: wA().h })
const panelInput = [...root.querySelectorAll('input')].find(i => !container.contains(i))
panelInput.focus()
key('ArrowRight'); key('ArrowRight'); await nextTick()
check('焦点在属性面板输入框时方向键不移动组件', () => { assert.equal(document.activeElement, panelInput); assert.equal(wA().x, ax) })
const wrapperA = [...root.querySelectorAll('div')].find(d => d.style.cursor === 'move' && d.className === 'absolute')
wrapperA.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 0, clientY: 0, pointerId: 13, button: 0 }))
wrapperA.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: 0, clientY: 0, pointerId: 13 })); await nextTick()
key('ArrowRight'); await nextTick()
check('按下组件后画布容器夺回焦点，方向键随即可用', () => { assert.equal(document.activeElement, container); assert.equal(wA().x, ax + 1) })
scada.updateWidgetRect(w.id, { x: ax, y: ay, w: wA().w, h: wA().h }); await nextTick()
const space = type => window.dispatchEvent(new KeyboardEvent(type, { code: 'Space', key: ' ', bubbles: true, cancelable: true }))
space('keydown'); await nextTick()
check('按下空格：进入平移修饰状态（光标 grab）', () => { assert.equal(canvasView.spaceDown, true); assert.equal(container.style.cursor, 'grab') })
container.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 200, clientY: 200, pointerId: 9, button: 0 }))
container.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 260, clientY: 230, pointerId: 9 })); await nextTick()
check('空格 + 拖动鼠标 → 平移', () => { assert.equal(canvasView.panning, true); assert.equal(canvasView.panX, 60); assert.equal(canvasView.panY, 30) })
container.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: 260, clientY: 230, pointerId: 9 })); await nextTick()
check('松开后结束平移并保留位置', () => { assert.equal(canvasView.panning, false); assert.equal(canvasView.panX, 60) })
const wrapperS = [...root.querySelectorAll('div')].find(d => d.style.cursor === 'grab' && d.className === 'absolute')
const wS = scada.draft.widgets.find(e => e.id === w.id); const xS = wS.x
wrapperS.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 0, clientY: 0, pointerId: 12, button: 0 }))
wrapperS.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 10, clientY: 0, pointerId: 12 }))
container.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 10, clientY: 0, pointerId: 12 }))
container.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: 10, clientY: 0, pointerId: 12 })); await nextTick()
check('按住空格时在组件上拖动 → 平移画布而不是移动组件，也不取消选中', () => {
  assert.equal(wS.x, xS); assert.equal(canvasView.panX, 70); assert.equal(scada.selectedId, w.id)
})
space('keyup'); await nextTick()
container.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 0, clientY: 0, pointerId: 10, button: 0 }))
container.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 100, clientY: 100, pointerId: 10 }))
container.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: 100, clientY: 100, pointerId: 10 })); await nextTick()
check('松开空格后普通拖动空白处 → 不平移', () => { assert.equal(canvasView.spaceDown, false); assert.equal(canvasView.panX, 70); assert.equal(canvasView.panY, 30) })
const dummyBtn = document.createElement('button'); document.body.appendChild(dummyBtn); dummyBtn.focus()
space('keydown'); await nextTick()
check('焦点在按钮上时空格不作为平移修饰键', () => assert.equal(canvasView.spaceDown, false))
dummyBtn.remove(); container.focus()
canvasView.panX = 60; canvasView.panY = 30
container.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 0, clientY: 0, pointerId: 11, button: 1 }))
container.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: -10, clientY: -20, pointerId: 11 }))
container.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: -10, clientY: -20, pointerId: 11 })); await nextTick()
check('鼠标中键立即平移', () => { assert.equal(canvasView.panX, 50); assert.equal(canvasView.panY, 10) })
check('位置 / 尺寸输入框：四个无按钮的 NInputNumber 显示当前值', () => {
  const geo = [...root.querySelectorAll('.n-input-number')].filter(el => !el.querySelector('.n-input-number-suffix, .n-button'))
  const vals = geo.map(el => el.querySelector('input').value)
  assert.ok(vals.includes(String(wS.x)) && vals.includes(String(wS.y)) && vals.includes(String(wS.w)) && vals.includes(String(wS.h)), JSON.stringify(vals))
})
container.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 100, clientY: 100, pointerId: 21, pointerType: 'touch' }))
container.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 200, clientY: 100, pointerId: 22, pointerType: 'touch' }))
container.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 300, clientY: 100, pointerId: 22, pointerType: 'touch' }))
container.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: 300, clientY: 100, pointerId: 22, pointerType: 'touch' }))
container.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: 100, clientY: 100, pointerId: 21, pointerType: 'touch' })); await nextTick()
check('双指捏合缩放', () => assert.ok(Math.abs(canvasView.zoom - 2) < 1e-9, String(canvasView.zoom)))
const wrapper2 = [...root.querySelectorAll('div')].find(d => d.style.cursor === 'move')
const w2 = scada.draft.widgets.find(e => e.id === w.id)
const x1 = w2.x
wrapper2.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 0, clientY: 0, pointerId: 5 }))
wrapper2.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 100, clientY: 0, pointerId: 5 }))
wrapper2.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: 100, clientY: 0, pointerId: 5 })); await nextTick()
check('放大后拖动组件按实际比例换算（100px 屏幕 = 50px 逻辑）', () => assert.equal(w2.x, x1 + 50))

// ---------------- 竖屏：组件库 / 属性面板上下布局 ----------------
main.isLandscape = false; await nextTick()
check('竖屏：组件库在上（横向条带）、属性面板在下（两栏）', () => {
  const body = canvasView.el.parentElement.parentElement.parentElement
  assert.ok(body.className.includes('flex-col'), body.className)
  const first = body.children[0], last = body.children[body.children.length - 1]
  assert.ok(first.textContent.includes('组件库') && first.className.includes('h-[92px]'))
  assert.ok(last.textContent.includes('属性') && last.querySelector('.columns-2'))
  const pitem = root.querySelector('[data-palette-item="valueCard"]')
  assert.equal(pitem && pitem.style.touchAction, 'pan-x', 'palette strip item should allow pan-x in portrait')
  assert.ok(first.querySelector('.n-scrollbar'), 'portrait strip should use NScrollbar (overlay rail)')
  assert.ok(scrollbarTransparent(first.querySelector('.n-scrollbar')), 'portrait strip scrollbar should be transparent: ' + first.querySelector('.n-scrollbar').getAttribute('style'))
})
main.isLandscape = true; await nextTick()
check('横屏：恢复左右三栏', () => {
  const body = canvasView.el.parentElement.parentElement.parentElement
  assert.ok(body.className.includes('flex-row')); assert.ok(body.children[0].className.includes('w-[200px]')); assert.ok(!root.querySelector('.columns-2'))
})

scada.select(null); window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' })); await nextTick()
check('未选中时 Delete 无效果', () => assert.equal(scada.draft.widgets.length, 5))
scada.select(w.id); scada.sendToBack(w.id)
window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true })); await nextTick()
check('置底 + Delete 删除选中', () => { assert.ok(!scada.draft.widgets.find(e => e.id === w.id)); assert.equal(scada.draft.widgets.length, 4) })
await scada.save()
check('保存到 localStorage（含处理函数）；退出编辑视图复位', () => {
  assert.ok(!scada.editing); const saved = JSON.parse(localStorage.getItem('scadaLayout'))
  assert.equal(saved.widgets.length, 4); assert.equal(saved.version, 1); assert.ok(!buttons().some(b => b.textContent.trim() === '保存')); assert.ok(!root.querySelector('.h-11'))
  assert.equal(saved.widgets.find(e => e.type === 'textLabel').transform, "return '外径 ' + value.toFixed(2) + ' mm'")
  assert.equal(canvasView.zoom, 1); assert.equal(canvasView.panX, 0)
  container.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true })); assert.equal(canvasView.zoom, 1)
})
scada.startEdit(); scada.addWidget('textLabel'); scada.cancelEdit()
check('取消编辑丢弃草稿', () => assert.equal(scada.layout.widgets.length, 4))

// ---------------- 任务 40：工具箱式组件库 / 悬浮滚动条 / 操作说明弹窗 / 新组件 / 内部变量写入 / 表格 / 图片与多行字段 ----------------
const warns = []
window.$message.warning = t => { warns.push(t); console.log('  $message.warning:', t) }
scada.startEdit(); await nextTick()
const bodyRow = () => canvasView.el.parentElement.parentElement.parentElement
const paletteCol = () => bodyRow().children[0]
const propsCol = () => bodyRow().children[bodyRow().children.length - 1]
const inPalette = sel => [...paletteCol().querySelectorAll(sel)]
check('组件库：按“基础图素 / 控制与显示 / 数据看板 / 其他”分组的小图标网格，共 38 项（数据看板 11 项、其他 2 项）；容器为 NScrollbar 悬浮轨道；顶栏无说明文字', () => {
  assert.deepEqual(inPalette('[data-palette-group]').map(g => g.dataset.paletteGroup), ['shape', 'control', 'data', 'other'])
  assert.equal(inPalette('[data-palette-item]').length, 38); assert.equal(inPalette('[data-palette-item] svg').length, 38)
  assert.deepEqual(inPalette('[data-palette-group="other"] [data-palette-item]').map(e => e.dataset.paletteItem), OTHER)
  const oh = paletteCol().querySelector('[data-palette-category="other"]'); assert.ok(oh.textContent.includes('其他') && oh.textContent.includes('2'), oh.textContent)
  assert.ok(inPalette('[data-palette-item="qrCode"]')[0].textContent.includes('二维码') && inPalette('[data-palette-item="barcode"]')[0].textContent.includes('条形码'))
  assert.equal(inPalette('[data-palette-group="shape"] [data-palette-item]').length, 12)
  assert.equal(inPalette('[data-palette-group="control"] [data-palette-item]').length, 13)
  assert.deepEqual(inPalette('[data-palette-group="data"] [data-palette-item]').map(e => e.dataset.paletteItem), [...DATA, ...VISUAL, ...CUSTOM])
  const dh = paletteCol().querySelector('[data-palette-category="data"]'); assert.ok(dh.textContent.includes('数据看板') && dh.textContent.includes('11'), dh.textContent)
  assert.ok(!paletteCol().querySelector('[data-palette-category="visual"]'))
  assert.ok(inPalette('[data-palette-item="slider"]')[0].textContent.includes('滑块'))
  const hdr = paletteCol().querySelector('[data-palette-category="shape"]'); assert.ok(hdr.textContent.includes('基础图素') && hdr.textContent.includes('12'))
  assert.ok(paletteCol().querySelector('.n-scrollbar')); assert.ok(!paletteCol().querySelector('.overflow-y-auto'))
  assert.ok(scrollbarTransparent(paletteCol().querySelector('.n-scrollbar')), 'palette scrollbar should be fully transparent: ' + paletteCol().querySelector('.n-scrollbar').getAttribute('style'))
  assert.ok(propsCol().querySelector('.n-scrollbar'), 'property panel should use NScrollbar too')
  assert.ok(!scrollbarTransparent(propsCol().querySelector('.n-scrollbar')), 'property panel scrollbar stays visible')
  assert.ok(paletteCol().querySelector('[data-palette-view="grid"]').className.includes('bg-blue-100'))
  assert.ok(paletteCol().querySelector('[data-palette-item="line"]').className.includes('flex-col'))
  assert.ok(!root.textContent.includes('滚轮缩放') && !root.textContent.includes('放到画布')); assert.ok(root.querySelector('[data-scada-help]'))
})
paletteCol().querySelector('[data-palette-category="shape"]').click(); await nextTick()
check('点击分类标题折叠该组', () => { assert.equal(inPalette('[data-palette-group="shape"] [data-palette-item]').length, 0); assert.equal(inPalette('[data-palette-item]').length, 26) })
paletteCol().querySelector('[data-palette-category="shape"]').click(); await nextTick()
check('再次点击展开', () => assert.equal(inPalette('[data-palette-item]').length, 38))
paletteCol().querySelector('[data-palette-view="list"]').click(); await nextTick()
check('切换为列表视图（图标 + 名称 + 说明）并记住选择', () => {
  assert.equal(localStorage.getItem('scadaPaletteView'), 'list')
  const li = paletteCol().querySelector('[data-palette-item="line"]')
  assert.ok(!li.className.includes('flex-col')); assert.ok(li.textContent.includes('直线') && li.textContent.includes('可设线宽'))
  assert.ok(paletteCol().querySelector('[data-palette-view="list"]').className.includes('bg-blue-100'))
})
paletteCol().querySelector('[data-palette-view="grid"]').click(); await nextTick()
check('切回网格视图', () => { assert.equal(localStorage.getItem('scadaPaletteView'), 'grid'); assert.ok(paletteCol().querySelector('[data-palette-item="line"]').className.includes('flex-col')) })

root.querySelector('[data-scada-help]').click(); await nextTick(); await sleep(30)
check('顶栏“?”按钮打开操作说明弹窗：6 节（组件库 / 画布 / 组件 / 排列与图层 / 展示模式 / 控制组件），含缩放 / 平移 / 微调 / 多选 / 八点缩放 / 图层 / 全屏说明', () => {
  const c = document.body.querySelector('.n-modal-container [data-scada-help-content]'); assert.ok(c)
  assert.equal(c.children.length, 6); assert.ok(c.querySelectorAll('li').length >= 10)
  for (const kw of ['滚轮', '空格', '方向键', '右键', '内部变量', 'Ctrl', '8 个手柄', '参考对象', '图层', '全屏']) assert.ok(c.textContent.includes(kw), kw)
  assert.ok(document.body.querySelector('.n-modal-container').textContent.includes('操作说明'))
})
document.body.querySelector('.n-modal-container .n-card-header__close').click(); await nextTick(); await sleep(60)
check('关闭操作说明弹窗', () => assert.ok(!document.body.querySelector('[data-scada-help-content]')))

const keepIds = new Set(scada.draft.widgets.map(e => e.id))
const NEW_TYPES = [...SHAPES, ...CONTROLS, ...VISUAL, ...CUSTOM, ...OTHER].filter(t => t !== 'textLabel')
for (const type of NEW_TYPES) scada.addWidget(type)
await nextTick()
const byType = t => scada.draft.widgets.find(e => e.type === t && !keepIds.has(e.id))
const hostOf = t => canvasView.el.querySelector(`[data-widget-id="${byType(t).id}"]`)
check('新增 33 个组件全部渲染：图形为 SVG，控制 / 可视化组件各有标记，自定义组件为 iframe，二维码 / 条形码未绑定时显示填写提示，图片显示占位提示，日期时间域走时', () => {
  assert.equal(scada.draft.widgets.length, 4 + NEW_TYPES.length); assert.ok(!root.textContent.includes('未知组件')); assert.ok(!root.textContent.includes('false'), 'literal false in: ' + [...canvasView.el.querySelectorAll('[data-widget-type]')].filter(h => h.textContent.includes('false')).map(h => h.dataset.widgetType + '=' + h.innerHTML.slice(0, 300)).join(' | '))
  for (const t of ['line', 'polyline', 'arc', 'rect', 'circle', 'ellipse', 'sector', 'segment', 'polygon', 'pipe']) assert.ok(hostOf(t).querySelector('svg'), t)
  assert.ok(hostOf('polygon').querySelector('svg polygon')); assert.ok(hostOf('circle').querySelector('svg circle, svg ellipse')); assert.ok(hostOf('rect').querySelector('svg rect'))
  assert.equal(canvasView.el.querySelectorAll('[data-io-field]').length, 2)
  for (const sel of ['[data-scada-button]', '[data-scada-bit-button]', '[data-scada-word-button]', '[data-scada-text-list]', '[data-scada-text-switch]', '[data-scada-radio]', '[data-scada-checkbox]', '[data-scada-table]']) assert.ok(canvasView.el.querySelector(sel), sel)
  assert.ok(hostOf('image').textContent.includes('在属性面板设置图片'))
  assert.match(hostOf('datetime').textContent, /\d{2}:\d{2}:\d{2}/)
  for (const sel of ['[data-scada-bar-gauge]', '[data-scada-slider] [data-slider-track]', '[data-scada-progress] [data-progress-fill]', '[data-scada-ring]', '[data-scada-pie] svg', '[data-scada-meter] [data-meter-needle]']) assert.ok(canvasView.el.querySelector(sel), sel)
  assert.ok(hostOf('barGauge').textContent.includes('未绑定数据') && hostOf('barGauge').querySelector('svg rect'))
  assert.ok(hostOf('slider').textContent.includes('--') && hostOf('slider').textContent.includes('100'))
  assert.ok(hostOf('progressBar').textContent.includes('--'))
  assert.ok(hostOf('meter').querySelectorAll('svg line').length >= 6 && hostOf('meter').textContent.includes('100'))
  // 饼图默认取产品分类数据源的全部数据项（冒烟里有模拟值）：有扇区 + 图例
  assert.ok(hostOf('pie').querySelector('[data-pie-legend]') && hostOf('pie').querySelectorAll('[data-pie-slice]').length >= 2)
  assert.ok(hostOf('custom').querySelector('[data-scada-custom] iframe'))
  for (const t of ['qrCode', 'barcode']) assert.ok(hostOf(t).textContent.includes('在属性面板填写内容或绑定数据'), t)
  assert.ok(hostOf('qrCode').querySelector('[data-scada-qr]') && hostOf('barcode').querySelector('[data-scada-barcode]'))
})
// 内部变量数据源：可写、响应式、持久化
const local = getDataSource('local')
check('内部变量数据源：16 个变量，可写；产品分类 / 模拟数据源只读', () => {
  assert.equal(local.options().length, 16); assert.equal(local.writable('var1'), true); assert.equal(local.read('var1').status, 'offline')
  assert.ok(!product.write); assert.ok(!getDataSource('sim').write)
})
scada.setBinding(byType('bitButton').id, { source: 'local', key: 'var1' })
scada.setBinding(byType('numericIO').id, { source: 'local', key: 'var1' })
scada.setBinding(byType('bitStatus').id, { source: 'local', key: 'var1' })
scada.setBinding(byType('checkbox').id, { source: 'local', key: 'var2' })
scada.setBinding(byType('wordButton').id, { source: 'local', key: 'var3' }); scada.setWidgetProp(byType('wordButton').id, 'value', 42)
scada.setBinding(byType('button').id, { source: 'product', key: 'd_od' })
scada.setWidgetProp(byType('table').id, 'source', 'local'); scada.setWidgetProp(byType('table').id, 'maxRows', 3)
// 数据可视化组件：滑块写 var4，进度条 / 环形 / 量表读 var3，棒图读产品分类（带公差），饼图取内部变量 var1 + var3
scada.setBinding(byType('slider').id, { source: 'local', key: 'var4' })
scada.setBinding(byType('progressBar').id, { source: 'local', key: 'var3' })
scada.setBinding(byType('ringProgress').id, { source: 'local', key: 'var3' })
scada.setBinding(byType('meter').id, { source: 'local', key: 'var3' })
scada.setBinding(byType('barGauge').id, { source: 'product', key: 'd_od' })
scada.setWidgetProp(byType('pie').id, 'source', 'local'); scada.setWidgetProp(byType('pie').id, 'items', ['var1', 'var3'])
await nextTick()
hostOf('bitButton').querySelector('[data-scada-bit-button]').click(); await nextTick()
const sliderArea0 = hostOf('slider').querySelector('[data-slider-area]')
sliderArea0.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 50, clientY: 4, pointerId: 31, button: 0 }))
sliderArea0.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: 50, clientY: 4, pointerId: 31, button: 0 })); await nextTick()
check('编辑模式下点击位按钮 / 按下滑块都不写值', () => { assert.equal(local.read('var1').value, null); assert.equal(local.read('var4').value, null) })
// 属性面板：多行文本字段与图片字段
scada.select(byType('textList').id); await nextTick()
const itemsTa = propsCol().querySelector('textarea')
check('文本列表：属性面板用多行文本框编辑选项（占位文字说明格式；组件空列表时也显示该说明）', () => { assert.ok(itemsTa); assert.ok(itemsTa.placeholder.includes('一行一个')); assert.ok(hostOf('textList').textContent.includes('一行一个')) })
itemsTa.value = '0=停止|#9ca3af\n1=运行|#22c55e\n2=报警|#ff0000'; itemsTa.dispatchEvent(new Event('input', { bubbles: true })); await nextTick()
check('修改选项后组件按行渲染三项（带颜色）', () => {
  assert.equal(byType('textList').props.items, '0=停止|#9ca3af\n1=运行|#22c55e\n2=报警|#ff0000')
  const txt = hostOf('textList').textContent; assert.ok(txt.includes('停止') && txt.includes('运行') && txt.includes('报警'))
})
scada.select(byType('image').id); await nextTick()
check('图片：属性面板有地址输入 + “选择图片”按钮', () => {
  assert.ok(buttons().some(b => b.textContent.trim().includes('选择图片'))); assert.ok(propsCol().querySelector('input'))
})
const urlInput = [...propsCol().querySelectorAll('input')].find(i => (i.placeholder || '').includes('http') || (i.placeholder || '').includes('data:'))
urlInput.value = 'https://example.com/a.png'; urlInput.dispatchEvent(new Event('input', { bubbles: true })); await nextTick()
check('输入图片地址后渲染 <img>', () => { assert.equal(byType('image').props.src, 'https://example.com/a.png'); const img = hostOf('image').querySelector('img'); assert.ok(img); assert.equal(img.getAttribute('src'), 'https://example.com/a.png') })
// ---------------- 其他：二维码 / 条形码（编码器 + 组件） ----------------
const HELLO_QR = ["111111100010101111111", "100000101110001000001", "101110100010101011101", "101110100010101011101", "101110101011101011101", "100000100111001000001", "111111101010101111111", "000000000000000000000", "101010100100100010010", "011110001001000010001", "000111111101001011000", "111101011001110101110", "010011110101001110101", "000000001010001000101", "111111100000100101100", "100000100110001101000", "101110101100101111111", "101110100011010100010", "101110101111011101001", "100000100001110001011", "111111101101011100001"]
check('QR 编码器：HELLO WORLD（M）= 版本 1 掩码 0，模块矩阵与 python qrcode 逐位一致；数字 / 字母数字 / 字节(UTF-8) 模式与版本自动选择；太长返回 null', () => {
  const q = encodeQr('HELLO WORLD', { ecc: 'M' }); assert.equal(q.version, 1); assert.equal(q.mask, 0); assert.equal(q.size, 21)
  assert.deepEqual(q.modules.map(r => r.map(b => (b ? '1' : '0')).join('')), HELLO_QR)
  assert.equal(encodeQr('1'.repeat(41), { ecc: 'L' }).version, 1); assert.equal(encodeQr('1'.repeat(42), { ecc: 'L' }).version, 2)   // 数字模式 1-L 容量 41
  assert.equal(encodeQr('A'.repeat(25), { ecc: 'L' }).version, 1); assert.equal(encodeQr('A'.repeat(26), { ecc: 'L' }).version, 2)   // 字母数字 1-L 容量 25
  assert.equal(encodeQr('x'.repeat(17), { ecc: 'L' }).version, 1); assert.equal(encodeQr('x'.repeat(18), { ecc: 'L' }).version, 2)   // 字节 1-L 容量 17
  assert.equal(encodeQr('外径', { ecc: 'H' }).version, 1); assert.equal(encodeQr('1'.repeat(7089), { ecc: 'L' }).version, 40); assert.equal(encodeQr('1'.repeat(7090), { ecc: 'L' }), null)
  const h = encodeQr('HELLO WORLD', { ecc: 'H' }); assert.equal(h.version, 2); assert.equal(h.size, 25)  // 1-H 只放得下 9 个码字
  for (let m = 0; m < 8; m++) assert.equal(encodeQr('HELLO WORLD', { ecc: 'M', mask: m }).mask, m)
  const big = encodeQr('https://example.com/' + 'a'.repeat(300), { ecc: 'Q' }); assert.ok(big.version >= 7 && big.size === big.version * 4 + 17)  // 含版本信息区
  assert.match(qrToPath(q), /^M0 0h7v1h-7zM10 0h1v1h-1zM12 0h1v1h-1zM14 0h7v1h-7zM0 1h1v1h-1z/)  // 连续深色模块合并成一个矩形
})
check('条码编码器：Code 128（自动 B / C 切换，含校验与终止）与 python-barcode 一致；EAN-13 补校验位 / 校验位错判无效；EAN-8；非法内容返回 null', () => {
  assert.equal(encodeBarcode('5177', 'code128').modules.map(b => (b ? '1' : '0')).join(''), '110100111001101110100011110111010110011011001100011101011')
  const e13 = encodeBarcode('590123412345', 'ean13'); assert.equal(e13.text, '5901234123457'); assert.equal(e13.modules.length, 95)
  assert.equal(e13.modules.map(b => (b ? '1' : '0')).join(''), '10100010110100111011001100100110111101001110101010110011011011001000010101110010011101000100101')
  assert.equal(encodeBarcode('5901234123457', 'ean13').text, '5901234123457'); assert.equal(encodeBarcode('5901234123450', 'ean13'), null); assert.equal(encodeBarcode('abc', 'ean13'), null)
  assert.equal(encodeBarcode('9638507', 'ean8').text, '96385074'); assert.equal(encodeBarcode('96385074', 'ean8').modules.length, 67); assert.equal(encodeBarcode('96385070', 'ean8'), null)
  assert.equal(eanCheckDigit('036000291452'.slice(0, 11)), '2')
  assert.equal(encodeBarcode('', 'code128'), null); assert.equal(encodeBarcode('中', 'code128'), null)
  const mixed = encodeBarcode('AB-007900712345', 'code128'); assert.ok(mixed && mixed.modules.length % 11 === 2 && mixed.modules[0] && mixed.modules[mixed.modules.length - 1])  // n×11 + 终止条 2
  assert.ok(encodeBarcode('A\u0007B', 'code128'))  // 控制字符走 A 表
})
check('内容模板：{value} {text} {name} {unit} {time} {status} {raw} 按数据点替换，未绑定为空', () => {
  const pt = { value: 1.23456, name: '外径', unit: 'mm', precision: 3, status: 'ok', time: new Date(2026, 8, 30, 12, 5, 9).getTime() }
  assert.equal(resolveTemplate('{name}={value}{unit} [{status}] {raw} {time} {text}', pt), '外径=1.235mm [ok] 1.23456 2026-09-30 12:05:09 1.235')
  assert.equal(resolveTemplate('{value}', pt, 1), '1.2'); assert.equal(resolveTemplate('ID-{value}-{name}', undefined), 'ID--')
  assert.equal(resolveTemplate('{value}|{text}', { value: null, text: 'N/A', status: 'offline' }), '|N/A'); assert.equal(resolveTemplate('固定文字', pt), '固定文字')
})
scada.setWidgetProp(byType('qrCode').id, 'content', 'https://example.com'); scada.setWidgetProp(byType('barcode').id, 'content', '5177'); await nextTick()
check('二维码 / 条形码组件：固定内容 → SVG 渲染（二维码正方形 viewBox 含静区、条形码横向铺满 + 下方文字）', () => {
  const qh = hostOf('qrCode'); const qe = qh.querySelector('[data-scada-qr]'); assert.equal(qe.dataset.qrContent, 'https://example.com'); assert.equal(qe.dataset.qrVersion, '2')
  const svg = qe.querySelector('svg'); assert.equal(svg.getAttribute('viewBox'), '-2 -2 29 29'); assert.ok(svg.querySelector('[data-qr-path]').getAttribute('d').startsWith('M')); assert.ok(!qh.querySelector('[data-qr-caption]'))
  const bh = hostOf('barcode'); const be = bh.querySelector('[data-scada-barcode]'); assert.equal(be.dataset.barcodeFormat, 'code128'); assert.equal(be.dataset.barcodeText, '5177')
  const bs = be.querySelector('svg'); assert.equal(bs.getAttribute('viewBox'), '0 0 77 100'); assert.equal(bs.getAttribute('preserveAspectRatio'), 'none')   // 57 模块 + 10 + 10 静区
  assert.equal(be.querySelector('[data-barcode-path]').getAttribute('transform'), 'translate(10 0)'); assert.equal(bh.querySelector('[data-barcode-caption]').textContent, '5177')
})
scada.setWidgetProp(byType('qrCode').id, 'caption', true); scada.setWidgetProp(byType('qrCode').id, 'quiet', 0)
scada.setWidgetProp(byType('barcode').id, 'format', 'ean13'); scada.setWidgetProp(byType('barcode').id, 'content', '590123412345'); scada.setWidgetProp(byType('barcode').id, 'quiet', false); await nextTick()
check('二维码显示内容文字、静区 0；条形码切 EAN-13：12 位自动补校验位显示 13 位、无静区', () => {
  assert.equal(hostOf('qrCode').querySelector('[data-qr-caption]').textContent, 'https://example.com'); assert.equal(hostOf('qrCode').querySelector('svg').getAttribute('viewBox'), '0 0 25 25')
  const be = hostOf('barcode').querySelector('[data-scada-barcode]'); assert.equal(be.dataset.barcodeText, '5901234123457'); assert.equal(be.querySelector('svg').getAttribute('viewBox'), '0 0 95 100')
  assert.equal(hostOf('barcode').querySelector('[data-barcode-caption]').textContent, '5901234123457')
})
scada.setWidgetProp(byType('barcode').id, 'content', 'abc'); scada.setWidgetProp(byType('barcode').id, 'showText', false); await nextTick()
check('EAN-13 内容不合法 → 显示格式提示', () => { assert.ok(hostOf('barcode').textContent.includes('内容不符合 EAN-13 / UPC-A 格式')); assert.ok(!hostOf('barcode').querySelector('svg')) })
// 绑定数据：内容模板取数据点（编辑模式下 var6 还没值 → 模板里的 {value} 为空）
scada.setBinding(byType('qrCode').id, { source: 'local', key: 'var6' }); scada.setWidgetProp(byType('qrCode').id, 'content', 'V={value}')
scada.setBinding(byType('barcode').id, { source: 'local', key: 'var6' }); scada.setWidgetProp(byType('barcode').id, 'format', 'code128'); scada.setWidgetProp(byType('barcode').id, 'content', '{value}'); scada.setWidgetProp(byType('barcode').id, 'showText', true); scada.setWidgetProp(byType('barcode').id, 'decimals', 0); await nextTick()
check('绑定内部变量 var6（无值）：二维码内容 "V="，条形码内容为空显示提示', () => {
  assert.equal(hostOf('qrCode').querySelector('[data-scada-qr]').dataset.qrContent, 'V='); assert.ok(hostOf('barcode').textContent.includes('在属性面板填写内容或绑定数据'))
})
// 自定义组件（HTML / CSS / JS）：属性面板三个代码按钮 → CodeDialog 弹窗；iframe srcdoc = 运行时 + 用户代码
scada.setBinding(byType('custom').id, { source: 'local', key: 'var5' })
scada.select(byType('custom').id); await nextTick()
const codeBtns = () => [...propsCol().querySelectorAll('[data-scada-code-field]')]
const customFrame = () => hostOf('custom').querySelector('[data-scada-custom] iframe')
const srcdocOf = f => f.getAttribute('srcdoc') || f.srcdoc || ''
check('自定义组件：默认带示例模板；属性面板「HTML / CSS」「JavaScript」两个按钮显示合计字符数；iframe 带 sandbox、编辑模式不响应指针，srcdoc = 运行时(head) + 用户 CSS + HTML + JS', () => {
  assert.deepEqual(codeBtns().map(b => b.dataset.scadaCodeField), ['html', 'js'])
  assert.ok(codeBtns().every(b => /编辑 · \d+ 字符/.test(b.textContent.trim())), codeBtns().map(b => b.textContent).join())
  assert.ok(codeBtns()[0].textContent.includes(`${CUSTOM_TEMPLATE.html.length + CUSTOM_TEMPLATE.css.length} 字符`), codeBtns()[0].textContent)
  const f = customFrame(); assert.ok(f); const d = srcdocOf(f)
  assert.ok(d.includes('window.scada = {') && d.includes('scada.onData(function (point)') && d.includes('.card { height: 100%') && d.includes('id="value"'))
  assert.ok(d.indexOf('window.scada = {') < d.indexOf('</head>') && d.indexOf('</head>') < d.indexOf('id="value"') && d.indexOf('id="value"') < d.indexOf('scada.onData(function (point)'))
  assert.equal(f.getAttribute('sandbox'), 'allow-scripts allow-same-origin allow-forms allow-modals'); assert.equal(f.style.pointerEvents, 'none')
  assert.ok(!hostOf('custom').textContent.includes('在属性面板编辑'))
})
window.dispatchEvent(new window.MessageEvent('message', { data: { type: 'scada:error', message: 'x is not defined' }, source: customFrame().contentWindow })); await nextTick()
check('iframe 报 scada:error → 编辑模式下组件左下角显示红色角标', () => {
  const e = hostOf('custom').querySelector('[data-custom-error]'); assert.ok(e); assert.ok(e.textContent.includes('脚本错误') && e.textContent.includes('x is not defined'), e.textContent)
})
// 语法高亮（highlight.ts）：纯函数，输出已转义、与原文等长
check('语法高亮：JS / CSS / HTML 分词（HTML 内嵌 <style> / <script> 分别按 CSS / JS），特殊字符转义，残缺代码不抛错', () => {
  const plain = h => h.replace(/<span class="tok-[a-z]+">|<\/span>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
  const js = 'var a = 1.5e3; // c\nscada.onData(function (p) { return p ? p.value : "--" })\nconst r = /ab+c/gi.test(x) && a / b'
  const hj = highlight(js, 'js'); assert.equal(plain(hj), js)
  for (const t of ['<span class="tok-keyword">var</span>', '<span class="tok-number">1.5e3</span>', '<span class="tok-comment">// c</span>', '<span class="tok-builtin">scada</span>', '<span class="tok-function">onData</span>', '<span class="tok-prop">value</span>', '<span class="tok-string">"--"</span>', '<span class="tok-regex">/ab+c/gi</span>', '<span class="tok-operator">&amp;&amp;</span>']) assert.ok(hj.includes(t), t)
  const css = '.card { height: 100%; color: #1f2937 !important; }\n@media (max-width: 600px) { .a:hover { margin: 0 auto } }'
  const hc = highlight(css, 'css'); assert.equal(plain(hc), css)
  for (const t of ['<span class="tok-selector">.card</span>', '<span class="tok-cssprop">height</span>', '<span class="tok-number">100%</span>', '<span class="tok-number">#1f2937</span>', '<span class="tok-keyword">!important</span>', '<span class="tok-atrule">@media</span>', '<span class="tok-selector">.a:hover</span>', '<span class="tok-value">auto</span>']) assert.ok(hc.includes(t), t)
  const html = '<!DOCTYPE html>\n<div class="card" id=x>&amp; a < b</div><!-- c --><style>.a{color:red}</style><script>var a = 1 // c</script><br/>'
  const hh = highlight(html, 'html'); assert.equal(plain(hh), html)
  for (const t of ['<span class="tok-doctype">&lt;!DOCTYPE html&gt;</span>', '<span class="tok-tag">div</span>', '<span class="tok-attr">class</span>', '<span class="tok-string">"card"</span>', '<span class="tok-string">x</span>', '<span class="tok-entity">&amp;amp;</span>', ' a &lt; b', '<span class="tok-comment">&lt;!-- c --&gt;</span>', '<span class="tok-selector">.a</span>', '<span class="tok-cssprop">color</span>', '<span class="tok-keyword">var</span>', '<span class="tok-comment">// c</span>', '<span class="tok-punct">/&gt;</span>']) assert.ok(hh.includes(t), t)
  assert.equal(highlight('<b>&"', 'js').includes('<b>'), false)
  for (const [c, l] of [['unterminated "string\n/* open', 'js'], ['<div class="a', 'html'], ['.a { color: ', 'css'], ['`tpl\n${x}', 'js'], ['', 'html']]) { const h = highlight(c, l); assert.equal(plain(h), c, l) }
  assert.ok(highlight('"s\nvar x', 'js').includes('<span class="tok-string">"s</span>\n<span class="tok-keyword">var</span>'), '字符串到行尾结束')
})
codeBtns()[1].click(); await nextTick(); await sleep(60)
const codeDialog = key => document.body.querySelector(`.n-modal-container [data-scada-code-dialog="${key}"]`)
const codeTa = () => document.body.querySelector('.n-modal-container [data-scada-code-dialog="js"] [data-code-editor="js"] textarea')
check('点「JavaScript」弹出代码编辑弹窗：高亮编辑器（透明 textarea 叠在高亮 pre 上）载入当前代码，pre 里有关键字 / 内置对象 / 注释 token；有“插入示例 / 清空 / 确定 / 取消”与 scada API 说明；样式只注入一次', () => {
  const ta = codeTa(); assert.ok(ta); assert.ok(ta.value.includes('scada.onData'))
  const ed = ta.closest('[data-code-editor]'); const pre = ed.querySelector('pre.scada-code-pre'); assert.ok(pre && ed.classList.contains('scada-code-editor'))
  assert.equal(pre.textContent, ta.value); assert.ok(pre.querySelector('.tok-keyword') && pre.querySelector('.tok-builtin') && pre.querySelector('.tok-comment') && pre.querySelector('.tok-function'))
  assert.equal(ta.getAttribute('spellcheck'), 'false'); assert.equal(codeDialog('js').dataset.codeLayout, 'column')
  const txt = ta.closest('.n-modal-container').textContent
  assert.ok(txt.includes('自定义组件 · JavaScript') && txt.includes('插入示例') && txt.includes('清空') && txt.includes('确定') && txt.includes('取消') && txt.includes('scada.write(value)'), txt)
  assert.equal(document.head.querySelectorAll('style[data-scada-code-style]').length, 1); assert.ok(document.head.querySelector('style[data-scada-code-style]').textContent.includes('.tok-keyword{color:#0000ff}'))
})
const NEW_JS = 'scada.onData(function (p) { document.body.textContent = p ? p.value : "--" })'
codeTa().value = NEW_JS; codeTa().dispatchEvent(new Event('input', { bubbles: true })); await nextTick()
check('弹窗里改代码只改草稿（高亮层同步重绘），组件属性未变', () => {
  assert.ok(byType('custom').props.js.includes('scada.onData(function (point)'))
  const pre = codeTa().closest('[data-code-editor]').querySelector('pre'); assert.equal(pre.textContent, NEW_JS); assert.ok(pre.innerHTML.includes('<span class="tok-string">"--"</span>'))
})
// Tab / Shift+Tab / Enter 缩进（jsdom 没有 execCommand → 走 setRangeText 兜底）
codeTa().setSelectionRange(0, 0); codeTa().dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })); await nextTick()
check('编辑器 Tab 插入两个空格（不切换焦点）', () => { assert.equal(codeTa().value, '  ' + NEW_JS); assert.equal(codeTa().selectionStart, 2) })
codeTa().dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true })); await nextTick()
check('Shift + Tab 退一级', () => { assert.equal(codeTa().value, NEW_JS); assert.equal(codeTa().selectionStart, 0) })
codeTa().value = '  if (a) {'; codeTa().dispatchEvent(new Event('input', { bubbles: true })); codeTa().setSelectionRange(10, 10)
const enterEv = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }); codeTa().dispatchEvent(enterEv); await nextTick()
check('Enter 保持缩进，{ 之后再多缩一级', () => { assert.ok(enterEv.defaultPrevented); assert.equal(codeTa().value, '  if (a) {\n    ') })
const tabEv2 = new KeyboardEvent('keydown', { key: 'Tab', ctrlKey: true, bubbles: true, cancelable: true }); codeTa().dispatchEvent(tabEv2)
check('Ctrl + Tab 不拦截', () => assert.ok(!tabEv2.defaultPrevented))
codeTa().scrollTop = 30; codeTa().scrollLeft = 12; codeTa().dispatchEvent(new Event('scroll'))
check('textarea 滚动时高亮层 pre 同步 scrollTop / scrollLeft', () => { const pre = codeTa().closest('[data-code-editor]').querySelector('pre'); assert.equal(pre.scrollTop, 30); assert.equal(pre.scrollLeft, 12) })
codeTa().value = NEW_JS; codeTa().dispatchEvent(new Event('input', { bubbles: true })); await nextTick()
okBtn().click(); await nextTick(); await sleep(60)
check('确定后写回 props.js、iframe srcdoc 更新（错误角标清掉）、弹窗关闭、按钮字符数刷新', () => {
  assert.equal(byType('custom').props.js, NEW_JS); assert.ok(srcdocOf(customFrame()).includes(NEW_JS)); assert.ok(!codeTa())
  assert.ok(!hostOf('custom').querySelector('[data-custom-error]'), '代码改动后 iframe 重载，错误角标清掉')
  assert.ok(codeBtns()[1].textContent.includes(`${NEW_JS.length} 字符`), codeBtns()[1].textContent)
})
// HTML 与 CSS 在同一个弹窗：横屏左右两栏
codeBtns()[0].click(); await nextTick(); await sleep(60)
const partTa = key => document.body.querySelector(`.n-modal-container [data-scada-code-dialog="html"] [data-code-part="${key}"] [data-code-editor="${key}"] textarea`)
check('点「HTML / CSS」弹出同一个弹窗：横屏左右两栏，HTML / CSS 各自的高亮编辑器、字符数、插入示例 / 清空与说明', () => {
  const dlg = codeDialog('html'); assert.ok(dlg); assert.equal(dlg.dataset.codeLayout, 'row'); assert.ok(dlg.classList.contains('flex-row'))
  assert.deepEqual([...dlg.querySelectorAll('[data-code-part]')].map(e => e.dataset.codePart), ['html', 'css'])
  assert.equal(partTa('html').value, CUSTOM_TEMPLATE.html); assert.equal(partTa('css').value, CUSTOM_TEMPLATE.css)
  const preH = partTa('html').closest('[data-code-editor]').querySelector('pre'); assert.ok(preH.querySelector('.tok-tag') && preH.querySelector('.tok-attr') && preH.querySelector('.tok-string'))
  const preC = partTa('css').closest('[data-code-editor]').querySelector('pre'); assert.ok(preC.querySelector('.tok-selector') && preC.querySelector('.tok-cssprop') && preC.querySelector('.tok-number'))
  const txt = dlg.textContent; assert.ok(txt.includes('HTML') && txt.includes('CSS') && txt.includes(`${CUSTOM_TEMPLATE.css.length} 字符`) && txt.includes('script 标签') && txt.includes('不影响页面'), txt)
  assert.equal([...dlg.querySelectorAll('button')].filter(b => b.textContent.trim() === '插入示例').length, 2)
  assert.equal(document.head.querySelectorAll('style[data-scada-code-style]').length, 1)
})
const NEW_CSS = '.card { color: #123456; }'
partTa('css').value = NEW_CSS; partTa('css').dispatchEvent(new Event('input', { bubbles: true })); await nextTick()
const htmlBefore = byType('custom').props.html
okBtn().click(); await nextTick(); await sleep(60)
check('只改 CSS 后确定：css 写回、html 原样不动、弹窗关闭、按钮合计字符数刷新', () => {
  assert.equal(byType('custom').props.css, NEW_CSS); assert.equal(byType('custom').props.html, htmlBefore); assert.ok(!codeDialog('html'))
  assert.ok(srcdocOf(customFrame()).includes(NEW_CSS)); assert.ok(codeBtns()[0].textContent.includes(`${htmlBefore.length + NEW_CSS.length} 字符`), codeBtns()[0].textContent)
})
main.isLandscape = false; await nextTick()
codeBtns()[0].click(); await nextTick(); await sleep(60)
check('竖屏时 HTML / CSS 弹窗改为上下两栏', () => { const dlg = codeDialog('html'); assert.ok(dlg); assert.equal(dlg.dataset.codeLayout, 'column'); assert.ok(dlg.classList.contains('flex-col')) })
;[...document.body.querySelectorAll('.n-modal-container button')].find(b => b.textContent.trim() === '取消').click(); await nextTick(); await sleep(60)
main.isLandscape = true; await nextTick()
check('取消：不写回', () => { assert.ok(!codeDialog('html')); assert.equal(byType('custom').props.css, NEW_CSS) })
scada.setWidgetProp(byType('custom').id, 'html', ''); scada.setWidgetProp(byType('custom').id, 'js', ''); await nextTick()
check('HTML / JS 都为空：编辑模式显示占位提示，JS 按钮不再显示字符数', () => {
  assert.ok(hostOf('custom').textContent.includes('在属性面板编辑 HTML / CSS / JS')); assert.equal(codeBtns()[1].textContent.trim(), '编辑'); assert.ok(codeBtns()[0].textContent.includes(`${NEW_CSS.length} 字符`))
})
scada.setWidgetProp(byType('custom').id, 'js', 'var s = "</script>"; var t = "</SCRIPT>"'); scada.setWidgetProp(byType('custom').id, 'css', 'p { color: red } /* </style> */'); await nextTick()
check('用户代码里的 </script> / </style> 被转义，不会提前结束标签', () => {
  const d = srcdocOf(customFrame()); assert.ok(d.includes('var s = "<\\/script>"; var t = "<\\/SCRIPT>"')); assert.ok(d.includes('/* <\\/style> */'))
  assert.equal((d.match(/<\/script>/g) || []).length, 2); assert.equal((d.match(/<\/style>/g) || []).length, 2)
})
scada.setWidgetProp(byType('custom').id, 'html', CUSTOM_TEMPLATE.html); scada.setWidgetProp(byType('custom').id, 'css', CUSTOM_TEMPLATE.css); scada.setWidgetProp(byType('custom').id, 'js', CUSTOM_TEMPLATE.js); await nextTick()
// iframe 内的运行时：jsdom 不会加载 srcdoc，用独立 JSDOM 跑一遍文档（伪造 parent 收消息）
const childMsgs = []
const child = new JSDOM(buildCustomDoc(CUSTOM_TEMPLATE.html, CUSTOM_TEMPLATE.css, CUSTOM_TEMPLATE.js), { runScripts: 'dangerously', virtualConsole: new VirtualConsole(), beforeParse(win) { Object.defineProperty(win, 'parent', { configurable: true, get: () => ({ postMessage: m => childMsgs.push(m) }) }) } })
for (let i = 0; i < 40 && !childMsgs.some(m => m.type === 'scada:ready'); i++) await sleep(25)
const cw = child.window
const sendData = point => cw.dispatchEvent(new cw.MessageEvent('message', { data: { type: 'scada:data', point, widget: { id: 'x', type: 'custom' }, history: [1, 2], editing: false } }))
sendData({ value: 3.14159, name: '温度', unit: '℃', precision: 1, status: 'high', upper: 5, lower: 1 })
check('iframe 运行时：DOMContentLoaded 后上报 ready；收到 scada:data 后示例模板渲染名称 / 数值（按精度、状态色）/ 单位 / 范围；scada.value / history / widget 可读', () => {
  assert.ok(childMsgs.some(m => m.type === 'scada:ready')); const $ = id => cw.document.getElementById(id)
  assert.equal($('name').textContent, '温度'); assert.equal($('value').textContent, '3.1'); assert.equal($('unit').textContent, '℃'); assert.equal($('range').textContent, '1.0 ~ 5.0')
  assert.ok(['#ff8d3f', 'rgb(255, 141, 63)'].includes($('value').style.color), $('value').style.color)
  assert.equal(cw.scada.value, 3.14159); assert.equal(JSON.stringify(cw.scada.history), '[1,2]'); assert.equal(cw.scada.editing, false); assert.equal(cw.scada.widget.type, 'custom')
})
sendData(undefined); cw.scada.write(7); cw.scada.onData(() => { throw new Error('boom') })
const childCm = new cw.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 12, clientY: 34 }); cw.document.body.dispatchEvent(childCm)
check('iframe 运行时：未绑定显示 --；scada.write / 回调抛错 / 右键分别向父页面 postMessage（write / error / contextmenu，右键默认行为被取消）；format / statusColor 工具', () => {
  assert.equal(cw.document.getElementById('value').textContent, '--'); assert.equal(cw.scada.value, null)
  assert.equal(JSON.stringify(childMsgs.find(m => m.type === 'scada:write')), JSON.stringify({ type: 'scada:write', value: 7 }))  // 跨 realm 对象只比较结构
  assert.ok(childMsgs.some(m => m.type === 'scada:error' && m.message === 'boom'), JSON.stringify(childMsgs))
  assert.equal(JSON.stringify(childMsgs.find(m => m.type === 'scada:contextmenu')), JSON.stringify({ type: 'scada:contextmenu', x: 12, y: 34 })); assert.ok(childCm.defaultPrevented)
  assert.equal(cw.scada.format(null), '--'); assert.equal(cw.scada.format('abc'), '--'); assert.equal(cw.scada.format(1.005, 0), '1'); assert.equal(cw.scada.format(2), '2.00')
  assert.equal(cw.scada.statusColor('ok'), '#22c55e'); assert.equal(cw.scada.statusColor('zzz'), '#64748b')
})
cw.close()
// 保存后进入展示模式，控制组件可操作
await scada.save(); await nextTick()
const hostL = t => canvasView.el.querySelector(`[data-widget-type="${t}"]`)
hostL('bitButton').querySelector('[data-scada-bit-button]').click(); await nextTick()
check('展示模式点击位按钮：内部变量置 1，绑定同一变量的数值 IO 域 / 位状态同步刷新并持久化', () => {
  assert.equal(local.read('var1').value, 1); assert.equal(local.read('var1').status, 'none')
  assert.ok(hostL('numericIO').textContent.includes('1.00'), hostL('numericIO').textContent)
  assert.equal(JSON.parse(localStorage.getItem('scadaLocalVars')).var1.value, 1)
})
hostL('bitButton').querySelector('[data-scada-bit-button]').click(); await nextTick()
check('再次点击切回 0', () => assert.equal(local.read('var1').value, 0))
hostL('numericIO').querySelector('[data-io-field]').lastElementChild.click(); await nextTick(); await sleep(10)
hostL('numericIO').querySelector('[data-io-field]').lastElementChild.click(); await nextTick(); await sleep(10)
check('数值 IO 域“＋”步进两次 → 2', () => assert.equal(local.read('var1').value, 2))
hostL('checkbox').querySelector('[data-scada-checkbox]').click(); await nextTick(); await sleep(10)
hostL('wordButton').querySelector('[data-scada-word-button]').click(); await nextTick(); await sleep(10)
check('复选框写开关量、字按钮写设定值', () => { assert.equal(local.read('var2').value, 1); assert.equal(local.read('var3').value, 42) })
const warnsBefore = warns.length
hostL('button').querySelector('[data-scada-button]').click(); await nextTick(); await sleep(10)
check('绑定只读数据源（产品分类）的按钮：提示不可写', () => { assert.equal(warns.length, warnsBefore + 1); assert.ok(warns[warns.length - 1].includes('只读') || warns[warns.length - 1].includes('不可写'), warns[warns.length - 1]) })
check('表格：列出内部变量前 3 行（含刚写入的值）', () => {
  const rows = [...hostL('table').querySelectorAll('tbody tr')]; assert.equal(rows.length, 3)
  assert.ok(rows[0].textContent.includes('变量 1') && rows[0].textContent.includes('2.00'), rows[0].textContent)
})
check('进度条 / 环形进度条 / 量表：var3 = 42 按默认量程 0~100 显示 42%', () => {
  assert.ok(hostL('progressBar').textContent.includes('42%'), hostL('progressBar').textContent)
  assert.equal(hostL('progressBar').querySelector('[data-progress-fill]').style.width, '42%')
  assert.equal(hostL('ringProgress').querySelector('[data-ring-value]').dataset.ringValue, '0.4200'); assert.ok(hostL('ringProgress').textContent.includes('42%'))
  assert.equal(hostL('meter').querySelector('[data-meter-needle]').dataset.meterNeedle, '0.4200'); assert.ok(hostL('meter').textContent.includes('42'))
})
scada.startEdit(); scada.setWidgetProp(byType('progressBar').id, 'textMode', 'value'); scada.setWidgetProp(byType('progressBar').id, 'max', 84); scada.setWidgetProp(byType('ringProgress').id, 'max', 21); await scada.save(); await nextTick()
check('进度条改量程 0~84 + 显示数值 → 50% 宽、文字为数值；环形量程 0~21 → 满环', () => {
  assert.equal(hostL('progressBar').querySelector('[data-progress-fill]').style.width, '50%'); assert.ok(hostL('progressBar').textContent.includes('42') && !hostL('progressBar').textContent.includes('%'))
  assert.equal(hostL('ringProgress').querySelector('[data-ring-value]').dataset.ringValue, '1.0000'); assert.ok(hostL('ringProgress').textContent.includes('100%'))
})
check('饼图：内部变量 var1 = 2、var3 = 42 → 两个扇区，图例显示 5% / 95%', () => {
  const slices = [...hostL('pie').querySelectorAll('[data-pie-slice]')]; assert.deepEqual(slices.map(e => e.dataset.pieSlice), ['var1', 'var3'])
  const legend = hostL('pie').querySelector('[data-pie-legend]').textContent; assert.ok(legend.includes('变量 1') && legend.includes('(5%)') && legend.includes('(95%)'), legend)
  assert.ok(hostL('pie').querySelector('svg text').textContent.includes('%'))
})
check('棒图绑定产品分类数据（有公差）：画出公差带与刻度', () => {
  const bar = hostL('barGauge'); assert.ok(bar.querySelectorAll('svg rect').length >= 3, 'rects'); assert.ok(bar.querySelectorAll('svg text').length >= 3, 'scale labels')
})
// 滑块：展示模式拖动写入内部变量 var4（轨道矩形需要 mock）
const sliderHost = hostL('slider'); const sliderTrack = sliderHost.querySelector('[data-slider-track]'); const sliderArea = sliderHost.querySelector('[data-slider-area]')
sliderTrack.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 8, right: 200, bottom: 8 })
sliderArea.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 50, clientY: 4, pointerId: 32, button: 0 })); await nextTick()
check('滑块按下：本地显示值跟随指针（25），尚未写入', () => { assert.ok(sliderHost.querySelector('[data-slider-value]').textContent.includes('25'), sliderHost.textContent); assert.equal(local.read('var4').value, null) })
sliderArea.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 150, clientY: 4, pointerId: 32, button: 0 })); await nextTick()
sliderArea.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: 150, clientY: 4, pointerId: 32, button: 0 })); await nextTick(); await sleep(20)
check('滑块拖到 75% 松手：写入 var4 = 75 并持久化，显示值 75', () => {
  assert.equal(local.read('var4').value, 75); assert.equal(JSON.parse(localStorage.getItem('scadaLocalVars')).var4.value, 75)
  assert.ok(sliderHost.querySelector('[data-slider-value]').textContent.includes('75'))
})
scada.startEdit(); scada.setWidgetProp(byType('slider').id, 'step', 0.5); scada.setWidgetProp(byType('slider').id, 'max', 10); scada.setWidgetProp(byType('slider').id, 'readOnly', true); await scada.save(); await nextTick()
const sliderHost2 = hostL('slider'); const sliderArea2 = sliderHost2.querySelector('[data-slider-area]'); sliderHost2.querySelector('[data-slider-track]').getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 8, right: 200, bottom: 8 })
sliderArea2.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 20, clientY: 4, pointerId: 33, button: 0 }))
sliderArea2.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: 20, clientY: 4, pointerId: 33, button: 0 })); await nextTick(); await sleep(20)
check('滑块只读属性：不响应拖动，var4 仍为 75；量程 0~10 时显示上限 10', () => { assert.equal(local.read('var4').value, 75); assert.ok(sliderHost2.textContent.includes('10')) })
scada.startEdit(); scada.setWidgetProp(byType('slider').id, 'readOnly', false); await scada.save(); await nextTick()
const sliderHost3 = hostL('slider'); const sliderArea3 = sliderHost3.querySelector('[data-slider-area]'); sliderHost3.querySelector('[data-slider-track]').getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 8, right: 200, bottom: 8 })
sliderArea3.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 27, clientY: 4, pointerId: 34, button: 0 }))
sliderArea3.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: 27, clientY: 4, pointerId: 34, button: 0 })); await nextTick(); await sleep(20)
check('滑块步长 0.5、量程 0~10：点在 13.5% 处 → 按步长取整写入 1.5', () => assert.equal(local.read('var4').value, 1.5))
// 二维码 / 条形码：展示模式下写 var6 = 12345 → 内容模板刷新
local.write('var6', 12345); await nextTick()
check('展示模式写入 var6 = 12345：二维码内容 V=12345.00（默认精度）、条形码按 decimals=0 编 "12345" 并显示文字', () => {
  assert.equal(hostL('qrCode').querySelector('[data-scada-qr]').dataset.qrContent, 'V=12345.00'); assert.equal(hostL('qrCode').querySelector('[data-scada-qr]').dataset.qrVersion, '1')
  assert.equal(hostL('barcode').querySelector('[data-scada-barcode]').dataset.barcodeText, '12345'); assert.equal(hostL('barcode').querySelector('[data-barcode-caption]').textContent, '12345')
  assert.ok(hostL('barcode').querySelector('[data-barcode-path]').getAttribute('d').startsWith('M0 0h2v100h-2z'))  // Start C 211232 → 前两个模块是条
})
// 自定义组件：展示模式下宿主 ⇄ iframe 的消息（jsdom 不加载 srcdoc，直接模拟 iframe 发来的消息；contentWindow.postMessage 打桩收宿主推送）
const customHostL = hostL('custom'); const customIframe = customHostL.querySelector('iframe'); const toChild = []
customIframe.contentWindow.postMessage = m => toChild.push(m)
const fromChild = data => window.dispatchEvent(new window.MessageEvent('message', { data, source: customIframe.contentWindow }))
window.dispatchEvent(new window.MessageEvent('message', { data: { type: 'scada:ready' } })); await nextTick()
check('自定义组件展示模式：iframe 可交互；来源不是本 iframe 的消息被忽略', () => { assert.equal(customIframe.style.pointerEvents, 'auto'); assert.equal(toChild.length, 0) })
fromChild({ type: 'scada:ready' }); await nextTick()
check('iframe 报 ready → 宿主推送 scada:data：绑定 var5 的数据点（未写过 → offline）+ 组件信息（不含三段代码）+ editing=false', () => {
  assert.equal(toChild.length, 1); const m = toChild[0]; assert.equal(m.type, 'scada:data'); assert.equal(m.editing, false)
  assert.equal(m.widget.type, 'custom'); assert.deepEqual(m.widget.binding, { source: 'local', key: 'var5' }); assert.ok(!('js' in m.widget.props) && 'radius' in m.widget.props)
  assert.equal(m.point.status, 'offline'); assert.equal(m.point.value, null)
})
window.dispatchEvent(new window.MessageEvent('message', { data: { type: 'scada:write', value: 99 } })); await nextTick()
fromChild({ type: 'scada:write', value: { evil: 1 } }); await nextTick()
check('scada:write：来源不对或值不是数字 / 文本 / 布尔 → 不写', () => assert.equal(local.read('var5').value, null))
fromChild({ type: 'scada:write', value: 8 }); await nextTick(); await sleep(20)
check('iframe 发 scada:write 8 → 写入内部变量 var5 并把新数据点推回 iframe', () => {
  assert.equal(local.read('var5').value, 8); const last = toChild[toChild.length - 1]; assert.equal(last.type, 'scada:data'); assert.equal(last.point.value, 8)
})
customIframe.getBoundingClientRect = () => ({ left: 100, top: 50, width: 120, height: 70, right: 220, bottom: 120 })
Object.defineProperty(customIframe, 'clientWidth', { value: 240, configurable: true }); Object.defineProperty(customIframe, 'clientHeight', { value: 140, configurable: true })
let forwarded = null; const onCm = e => { forwarded = e }; root.addEventListener('contextmenu', onCm)
fromChild({ type: 'scada:contextmenu', x: 20, y: 40 }); await nextTick(); await sleep(30); root.removeEventListener('contextmenu', onCm)
check('iframe 发 scada:contextmenu → 在 iframe 元素上派发 contextmenu（坐标按画布缩放换算）冒泡到页面根 → 弹出展示模式菜单', () => {
  assert.ok(forwarded); assert.equal(forwarded.clientX, 110); assert.equal(forwarded.clientY, 70); assert.ok(forwarded.defaultPrevented)
  assert.ok(menuItem('编辑') && menuItem('刷新数据源'))
})
menuItem('刷新数据源').click(); await nextTick()
for (let i = 0; i < 40 && menuItems().length; i++) await sleep(50)   // 菜单的关闭动画在 jsdom 里要几十到一百多毫秒（机器忙时更久），轮询等它结束
check('菜单关闭；仍是展示模式', () => { assert.equal(menuItems().length, 0); assert.ok(!scada.editing) })
// 恢复到 4 个组件的版面，继续后面的用例
scada.startEdit(); scada.draft.widgets = scada.draft.widgets.filter(e => keepIds.has(e.id)); await scada.save(); await nextTick()
check('清理：恢复 4 个组件并退出编辑', () => { assert.equal(scada.layout.widgets.length, 4); assert.ok(!scada.editing) })
await contextMenu(100, 100)
const beforeRefresh = calls.groups
menuItem('刷新数据源').click(); await nextTick(); await sleep(50)
check('展示模式右键菜单“刷新数据源”重新拉取数据项目录并关闭菜单', () => { assert.equal(calls.groups, beforeRefresh + 1); assert.equal(menuItems().length, 0) })

// ---------------- 任务 41：zip 读写 / 组态包导入导出 / 图片上传到宿主（SaveResourceFile → https://pic.nt.local/）----------------
import zlib from 'node:zlib'
const enc = new TextEncoder()
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
const PNG = new Uint8Array(Buffer.from(PNG_B64, 'base64'))
const PNG_DATA_URL = 'data:image/png;base64,' + PNG_B64
const blobBytes = blob => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(new Uint8Array(r.result)); r.onerror = () => rej(r.error); r.readAsArrayBuffer(blob) })
const bin = new Uint8Array(1500).map((_, i) => (i * 7919) & 0xff)
const zipBytes = createZip([{ name: 'manifest.json', data: enc.encode('{"a":1}') }, { name: 'resources/中文 图.png', data: bin }], new Date(2026, 8, 29, 12, 34, 56))
const zipEntries = readZip(zipBytes)
check('zip：STORE 写入 → 读回，名称（UTF-8）/ 内容 / CRC 一致', () => {
  assert.equal(zipBytes[0], 0x50); assert.equal(zipBytes[1], 0x4b)
  assert.deepEqual(zipEntries.map(e => e.name), ['manifest.json', 'resources/中文 图.png'])
  assert.equal(crc32(enc.encode('123456789')), 0xcbf43926) // CRC-32 标准校验值
})
{
  const t = await zipEntryText(zipEntries[0]); const d = await zipEntries[1].data()
  check('zip：读回的内容与写入一致', () => { assert.equal(t, '{"a":1}'); assert.deepEqual([...d], [...bin]) })
}
// 手工拼一个带 DEFLATE 条目（method 8）+ 目录项的 zip，覆盖第三方压缩工具产出的包
const deflatedZip = (() => {
  const name = enc.encode('layout.json'); const raw = enc.encode(JSON.stringify({ version: 1, canvas: { width: 800, height: 600 }, widgets: [] }))
  const comp = new Uint8Array(zlib.deflateRawSync(raw)); const crc = crc32(raw)
  const u16 = v => [v & 0xff, (v >> 8) & 0xff]; const u32 = v => [v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff]
  const local = [0x50, 0x4b, 3, 4, ...u16(20), ...u16(0x800), ...u16(8), ...u16(0), ...u16(0), ...u32(crc), ...u32(comp.length), ...u32(raw.length), ...u16(name.length), ...u16(0), ...name, ...comp]
  const dirName = enc.encode('resources/')
  const local2 = [0x50, 0x4b, 3, 4, ...u16(20), ...u16(0x800), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(0), ...u32(0), ...u16(dirName.length), ...u16(0), ...dirName]
  const cd = [0x50, 0x4b, 1, 2, ...u16(20), ...u16(20), ...u16(0x800), ...u16(8), ...u16(0), ...u16(0), ...u32(crc), ...u32(comp.length), ...u32(raw.length), ...u16(name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(0), ...name]
  const cd2 = [0x50, 0x4b, 1, 2, ...u16(20), ...u16(20), ...u16(0x800), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(0), ...u32(0), ...u16(dirName.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0x10), ...u32(local.length), ...dirName]
  const eocd = [0x50, 0x4b, 5, 6, ...u16(0), ...u16(0), ...u16(2), ...u16(2), ...u32(cd.length + cd2.length), ...u32(local.length + local2.length), ...u16(0)]
  return new Uint8Array([...local, ...local2, ...cd, ...cd2, ...eocd])
})()
{
  const es = readZip(deflatedZip); const txt = await zipEntryText(es[0])
  check('zip：DEFLATE 条目经 DecompressionStream 解压，目录项被过滤', () => { assert.deepEqual(es.map(e => e.name), ['layout.json']); assert.equal(JSON.parse(txt).canvas.width, 800) })
  const pkg = await parsePackage(deflatedZip)
  check('组态包：只含 layout.json 的 zip 也能解析（无清单 → 无资源）', () => { assert.equal(pkg.kind, 'zip'); assert.equal(pkg.manifest, null); assert.equal(pkg.resources.length, 0); assert.equal(pkg.layout.canvas.width, 800) })
}
check('zip：损坏 / 非 zip 输入抛错', () => {
  assert.throws(() => readZip(new Uint8Array([0x50, 0x4b, 3, 4, 1, 2, 3])))
  assert.throws(() => readZip(enc.encode('hello world, not a zip')))
})
// 导出：宿主 URL 图片（可读 / 读取失败）+ 旧版内嵌 data URL 图片 + 同一 URL 复用 + 无关字符串
hostFiles.set('exp1.png', PNG)
const srcLayout = {
  version: 1, canvas: { width: 1024, height: 600 },
  widgets: [
    { id: 'i1', type: 'image', x: 0, y: 0, w: 100, h: 80, props: { src: RESOURCE_BASE_URL + 'exp1.png', fit: 'contain' } },
    { id: 'i2', type: 'image', x: 120, y: 0, w: 100, h: 80, props: { src: PNG_DATA_URL } },
    { id: 'i3', type: 'image', x: 240, y: 0, w: 100, h: 80, props: { src: RESOURCE_BASE_URL + 'gone.png' } },
    { id: 'i4', type: 'image', x: 360, y: 0, w: 100, h: 80, props: { src: RESOURCE_BASE_URL + 'exp1.png' } },
    { id: 't1', type: 'textLabel', x: 0, y: 100, w: 100, h: 30, props: { text: 'https://example.com/not-a-resource.png' } }
  ]
}
check('资源引用收集：宿主 URL 与 data URL 去重，忽略其它字符串', () => assert.deepEqual(collectResourceRefs(srcLayout), [RESOURCE_BASE_URL + 'exp1.png', PNG_DATA_URL, RESOURCE_BASE_URL + 'gone.png']))
const exp = await buildPackage(srcLayout, { now: new Date(2026, 8, 29, 9, 5, 7) })
const expEntries = readZip(exp.bytes)
const expLayout = JSON.parse(await zipEntryText(expEntries.find(e => e.name === 'layout.json')))
check('导出：zip 含 manifest.json + layout.json + resources/（宿主文件按原名、内嵌图抽成 inline-1.png），读不到的资源记入 missing，文件名带时间戳', () => {
  assert.equal(exp.fileName, 'scada-layout-20260929-090507.zip')
  assert.deepEqual(expEntries.map(e => e.name).sort(), ['layout.json', 'manifest.json', 'resources/exp1.png', 'resources/inline-1.png'])
  assert.equal(exp.manifest.format, 'scada-layout-package'); assert.equal(exp.manifest.widgets, 5)
  assert.deepEqual(exp.manifest.resources, [{ file: 'resources/exp1.png', url: RESOURCE_BASE_URL + 'exp1.png' }, { file: 'resources/inline-1.png', url: PACKAGE_REF_PREFIX + 'resources/inline-1.png' }])
  assert.deepEqual(exp.missing, [RESOURCE_BASE_URL + 'gone.png'])
  assert.equal(expLayout.widgets[0].props.src, RESOURCE_BASE_URL + 'exp1.png') // 宿主 URL 原样保留
  assert.equal(expLayout.widgets[1].props.src, 'pkg:resources/inline-1.png') // data URL 换成包内占位
  assert.equal(expLayout.widgets[3].props.src, RESOURCE_BASE_URL + 'exp1.png')
  assert.ok(!JSON.stringify(expLayout).includes('base64'))
  assert.equal(exp.blob.type, 'application/zip')
})
{
  const png = await expEntries.find(e => e.name === 'resources/inline-1.png').data()
  check('导出：内嵌图片按原始字节写入 zip', () => assert.deepEqual([...png], [...PNG]))
}
const parsed = await parsePackage(exp.bytes)
const plan1 = await planImport(parsed)
check('导入清点：同名宿主文件已存在 → 复用；包内占位资源 → 需上传', () => {
  assert.equal(parsed.kind, 'zip'); assert.equal(parsed.layout.widgets.length, 5); assert.equal(parsed.resources.length, 2)
  assert.deepEqual(plan1.reusable.map(r => r.file), ['resources/exp1.png']); assert.deepEqual(plan1.toUpload.map(r => r.file), ['resources/inline-1.png']); assert.equal(plan1.missing.length, 0)
})
const plan2 = await planImport(parsed, async () => false)
check('导入清点：换一台机器（宿主文件不存在）→ 两个都要上传', () => { assert.equal(plan2.reusable.length, 0); assert.equal(plan2.toUpload.length, 2) })
const uploads = []
const res1 = await applyPackage(parsed, plan2, { bridge: true, upload: async (name, blob, bytes) => { uploads.push([name, blob.type, bytes.length]); return RESOURCE_BASE_URL + 'new-' + name } })
check('执行导入（有宿主）：逐个上传并把布局里的引用换成新地址，复用的保持原值', () => {
  assert.deepEqual(uploads, [['exp1.png', 'image/png', PNG.length], ['inline-1.png', 'image/png', PNG.length]])
  assert.equal(res1.uploaded, 2); assert.equal(res1.reused, 0); assert.equal(res1.inlined, 0); assert.equal(res1.failed.length, 0)
  const srcs = res1.layout.widgets.map(w => w.props.src)
  assert.equal(srcs[0], RESOURCE_BASE_URL + 'new-exp1.png'); assert.equal(srcs[1], RESOURCE_BASE_URL + 'new-inline-1.png'); assert.equal(srcs[3], RESOURCE_BASE_URL + 'new-exp1.png')
  assert.equal(srcs[2], RESOURCE_BASE_URL + 'gone.png') // 导出时就缺的宿主 URL 原样保留
  assert.ok(!JSON.stringify(res1.layout).includes('pkg:'))
})
const res2 = await applyPackage(parsed, plan1, { bridge: false })
check('执行导入（无宿主桥）：需上传的资源内嵌回 data URL，复用的保持宿主 URL', () => {
  assert.equal(res2.inlined, 1); assert.equal(res2.reused, 1); assert.equal(res2.uploaded, 0)
  assert.equal(res2.layout.widgets[1].props.src, PNG_DATA_URL); assert.equal(res2.layout.widgets[0].props.src, RESOURCE_BASE_URL + 'exp1.png')
})
const res3 = await applyPackage(parsed, plan2, { bridge: true, upload: async name => { if (name === 'inline-1.png') throw new Error('boom'); return RESOURCE_BASE_URL + 'ok-' + name } })
check('执行导入：某个资源上传失败 → 记入 failed，占位引用清空，其余照常', () => {
  assert.equal(res3.failed.length, 1); assert.equal(res3.failed[0].file, 'resources/inline-1.png'); assert.equal(res3.uploaded, 1)
  assert.equal(res3.layout.widgets[1].props.src, ''); assert.equal(res3.layout.widgets[0].props.src, RESOURCE_BASE_URL + 'ok-exp1.png')
})
{
  const j = await parsePackage(JSON.stringify(srcLayout))
  const j2 = await parsePackage(enc.encode(JSON.stringify(srcLayout)))
  check('导入：直接选择 JSON（文本或字节）也能解析', () => { assert.equal(j.kind, 'json'); assert.equal(j.layout.widgets.length, 5); assert.equal(j2.kind, 'json'); assert.equal(j2.resources.length, 0) })
  const errOf = async input => { try { await parsePackage(input); return 'no-error' } catch (e) { return e.message } }
  const noLayoutZip = createZip([{ name: 'readme.txt', data: enc.encode('x') }])
  const msgs = [await errOf('not json'), await errOf('{"foo":1}'), await errOf(new Uint8Array([0x50, 0x4b, 9, 9, 0, 0])), await errOf(noLayoutZip)]
  check('导入：非法输入分别报 invalid-json / invalid-layout / invalid-zip / invalid-package', () => assert.deepEqual(msgs, ['invalid-json', 'invalid-layout', 'invalid-zip', 'invalid-package']))
}

// ---- 页面流程：右键菜单“导出组态”→ 浏览器下载；“导入组态”→ 隐藏 file input → 导入弹窗 ----
scada.startEdit(); const imgW = scada.addWidget('image'); scada.setWidgetProp(imgW.id, 'src', RESOURCE_BASE_URL + 'exp1.png'); await scada.save(); await nextTick()
const downloads = []
URL.createObjectURL = blob => { downloads.push({ blob }); return 'blob:smoke' }
URL.revokeObjectURL = () => {}
window.HTMLAnchorElement.prototype.click = function () { downloads[downloads.length - 1].name = this.download; downloads[downloads.length - 1].href = this.href }
const msgs = []
const origSuccess = window.$message.success
window.$message.success = t => { msgs.push(t); origSuccess(t) }
await contextMenu(100, 100)
check('展示模式右键菜单含“导出组态 / 导入组态”', () => assert.ok(menuItem('导出组态') && menuItem('导入组态')))
menuItem('导出组态').click(); await nextTick(); await sleep(80)
check('导出组态：生成 zip 触发浏览器下载（a[download]），提示含文件名与资源数', () => {
  assert.equal(downloads.length, 1); assert.match(downloads[0].name, /^scada-layout-\d{8}-\d{6}\.zip$/); assert.equal(downloads[0].href, 'blob:smoke')
  assert.ok(msgs[msgs.length - 1].includes(downloads[0].name) && msgs[msgs.length - 1].includes('1 个资源'), msgs[msgs.length - 1])
  assert.equal(menuItems().length, 0)
})
const dlBytes = await blobBytes(downloads[0].blob)
const dlEntries = readZip(dlBytes)
{
  const l = JSON.parse(await zipEntryText(dlEntries.find(e => e.name === 'layout.json')))
  check('下载的 zip 包含当前布局（5 个组件）和 resources/exp1.png', () => { assert.equal(l.widgets.length, 5); assert.ok(dlEntries.some(e => e.name === 'resources/exp1.png')) })
}
// 准备一个"来自别的机器"的包：2 个组件，一张内嵌图（需上传）+ 一张本机已有的宿主图（复用）
const foreign = await buildPackage({ version: 1, canvas: { width: 640, height: 480 }, widgets: [
  { id: 'f1', type: 'image', x: 0, y: 0, w: 100, h: 80, props: { src: PNG_DATA_URL } },
  { id: 'f2', type: 'image', x: 0, y: 100, w: 100, h: 80, props: { src: RESOURCE_BASE_URL + 'exp1.png' } },
  { id: 'f3', type: 'textLabel', x: 0, y: 200, w: 100, h: 30, props: { text: 'imported' } }
] })
const fileInput = root.querySelector('input[type=file][data-scada-import]')
const dialog = () => document.body.querySelector('[data-scada-import-dialog]')
const phase = () => { const el = dialog() && dialog().querySelector('[data-import-phase]'); return el ? el.getAttribute('data-import-phase') : null }
const waitPhase = async (...pending) => { for (let i = 0; i < 40 && (phase() === null || pending.includes(phase())); i++) await sleep(50); await nextTick() }
const waitUntil = async fn => { for (let i = 0; i < 40 && !fn(); i++) await sleep(50); await nextTick() }
const feedFile = async file => {
  Object.defineProperty(fileInput, 'files', { value: [file], configurable: true })
  fileInput.dispatchEvent(new Event('change', { bubbles: true })); await nextTick(); await waitPhase('parsing')
}
const dialogButton = text => [...document.body.querySelectorAll('.n-modal button')].find(b => b.textContent.trim() === text)
menuItem('导入组态') || await contextMenu(100, 100)
const clickedInputs = []
fileInput.click = () => clickedInputs.push(fileInput)
menuItem('导入组态').click(); await nextTick(); await sleep(80)
check('导入组态：菜单项触发隐藏的 file input（接受 .zip / .json）', () => { assert.equal(clickedInputs.length, 1); assert.ok(fileInput.accept.includes('.zip') && fileInput.accept.includes('.json')); assert.equal(menuItems().length, 0) })
await feedFile(new File([foreign.bytes], 'foreign.zip', { type: 'application/zip' }))
check('选择文件后弹出导入弹窗并列出清单：文件名 / 组件数 / 画布 / 资源（需上传 1 · 可复用 1 · 缺失 0）+ 替换提示', () => {
  assert.equal(phase(), 'ready'); const txt = dialog().textContent
  for (const kw of ['foreign.zip', '3', '640 × 480', '需上传 1', '可复用 1', '缺失 0', '替换当前已保存的组态']) assert.ok(txt.includes(kw), kw)
  assert.ok(!txt.includes('没有宿主环境')); assert.ok(dialogButton('导入') && dialogButton('取消'))
  assert.ok(document.body.querySelector('.n-modal .n-card-header__close'))
})
const saveBefore = calls.save || 0
const layoutBefore = scada.layout
document.body.querySelector('[data-import-confirm]').click(); await nextTick(); await waitPhase('ready', 'importing')
check('确认导入：内嵌图经 SaveResourceFile 上传（原文件名 inline-1.png + data URL），布局替换并持久化，弹窗显示完成', () => {
  assert.equal(phase(), 'done'); assert.equal(calls.save, saveBefore + 1)
  assert.equal(calls.lastSave.fileName, 'inline-1.png'); assert.ok(calls.lastSave.base64Data.startsWith('data:image/png;base64,'))
  assert.notEqual(scada.layout, layoutBefore); assert.equal(scada.layout.widgets.length, 3); assert.ok(!scada.editing)
  const srcs = scada.layout.widgets.map(w => w.props.src)
  assert.match(srcs[0], /^https:\/\/pic\.nt\.local\/[0-9a-f-]+\.png$/); assert.equal(srcs[1], RESOURCE_BASE_URL + 'exp1.png')
  assert.equal(JSON.parse(localStorage.getItem('scadaLayout')).widgets.length, 3)
  assert.ok(dialog().textContent.includes('导入完成') && dialog().textContent.includes('资源上传 1 个、复用 1 个'))
  assert.ok(msgs[msgs.length - 1].includes('导入完成'), msgs[msgs.length - 1]); assert.ok(dialogButton('关闭'))
  assert.ok(canvasView.el.textContent.includes('imported'))
})
dialogButton('关闭').click(); await nextTick(); await sleep(100)
check('关闭导入弹窗', () => assert.ok(!dialog()))
await feedFile(new File([enc.encode('this is not a package')], 'bad.zip', { type: 'application/zip' }))
check('导入非法文件：弹窗显示“不是有效的组态包”，没有“导入”按钮', () => { assert.equal(phase(), 'error'); assert.ok(dialog().textContent.includes('不是有效的组态包')); assert.ok(!dialogButton('导入')) })
document.body.querySelector('.n-modal .n-card-header__close').click(); await nextTick(); await sleep(100)
check('右上角 × 关闭', () => assert.ok(!dialog()))
// 编辑模式导入：只替换草稿
scada.startEdit(); await nextTick()
await feedFile(new File([foreign.bytes], 'foreign.zip', { type: 'application/zip' }))
check('编辑模式导入：提示“替换当前草稿，保存后才生效”', () => { assert.equal(phase(), 'ready'); assert.ok(dialog().textContent.includes('替换当前草稿')) })
document.body.querySelector('[data-import-confirm]').click(); await nextTick(); await waitPhase('ready', 'importing')
check('编辑模式确认导入：草稿被替换（复用已上传的宿主文件不重复上传），已保存布局不变，提示记得保存', () => {
  assert.equal(phase(), 'done'); assert.equal(scada.draft.widgets.length, 3); assert.equal(scada.draft.widgets[2].props.text, 'imported'); assert.ok(scada.dirty)
  assert.equal(calls.save, saveBefore + 2) // 内嵌图仍需上传一次；宿主图复用
  assert.ok(dialog().textContent.includes('记得保存'))
})
dialogButton('关闭').click(); await nextTick(); await sleep(100)
// 属性面板“选择图片文件”：有宿主桥 → SaveResourceFile，布局里只存 https://pic.nt.local/ 地址
scada.select(scada.draft.widgets[0].id); await nextTick()
const captureInput = async () => {
  const orig = document.createElement.bind(document); let el = null
  document.createElement = (tag, ...a) => { const n = orig(tag, ...a); if (tag === 'input') el = n; return n }
  const btn = buttons().find(b => b.textContent.trim().includes('选择图片')); btn.click(); await nextTick()
  document.createElement = orig; return el
}
const picker = await captureInput()
const logo = new File([PNG], 'logo.png', { type: 'image/png' })
const srcBefore = scada.draft.widgets[0].props.src
Object.defineProperty(picker, 'files', { value: [logo] }); picker.onchange(); await waitUntil(() => scada.draft.widgets[0].props.src !== srcBefore)
check('选择本地图片：经 SaveResourceFile(logo.png, dataURL) 上传，src 变为宿主地址，面板显示宿主文件名', () => {
  assert.equal(calls.save, saveBefore + 3); assert.equal(calls.lastSave.fileName, 'logo.png')
  const src = scada.draft.widgets[0].props.src; assert.match(src, /^https:\/\/pic\.nt\.local\/[0-9a-f-]+\.png$/)
  assert.ok(propsCol().textContent.includes(src.slice(RESOURCE_BASE_URL.length)))
  assert.ok(!src.startsWith('data:'))
})
const picker2 = await captureInput()
const big = new File([PNG], 'big.png', { type: 'image/png' }); Object.defineProperty(big, 'size', { value: RESOURCE_MAX_BYTES + 1 })
Object.defineProperty(picker2, 'files', { value: [big] }); const warnsB = warns.length; picker2.onchange(); await waitUntil(() => warns.length > warnsB)
check('超过 20 MB 的图片：提示不上传', () => { assert.equal(warns.length, warnsB + 1); assert.ok(warns[warns.length - 1].includes('20 MB'), warns[warns.length - 1]); assert.equal(calls.save, saveBefore + 3) })
delete window.chrome.webview.hostObjects.JsBridge.SaveResourceFile
const picker3 = await captureInput()
Object.defineProperty(picker3, 'files', { value: [logo] }); const errs = []; const origErr = window.$message.error; window.$message.error = t => { errs.push(t); origErr(t) }
picker3.onchange(); await waitUntil(() => errs.length > 0); window.$message.error = origErr
check('宿主保存失败：提示“图片上传失败”，src 不变', () => { assert.equal(errs.length, 1); assert.ok(errs[0].includes('上传失败')); assert.match(scada.draft.widgets[0].props.src, /^https:\/\/pic\.nt\.local\//) })
scada.cancelEdit(); await nextTick()
check('取消编辑：丢弃导入的草稿，已保存布局仍是 3 个组件', () => { assert.ok(!scada.editing); assert.equal(scada.layout.widgets.length, 3) })
assert.ok(INLINE_MAX_BYTES < RESOURCE_MAX_BYTES)

// ---------------- 任务 42：宿主打包（SPC_M 91ebedd）+ 未引用资源清理（SPC_M b75fc6e）----------------
const { replaceResourceRefs, cleanupUnusedResources, listResourceFiles, deleteResourceFile, HOST_GENERATED_NAME, exportPackageViaHost, previewPackageViaHost, importPackageViaHost, layoutFromHostImport } = m
const G = n => `${String(n).padStart(32, '0')}` // 32 位 hex 的 GUID 文件名
const nestedLayout = { version: 2, canvas: { width: 800, height: 600 }, widgets: [
  { id: 'n1', type: 'image', x: 0, y: 0, w: 10, h: 10, props: { src: RESOURCE_BASE_URL + G(1) + '.png' } },
  { id: 'n2', type: 'table', x: 0, y: 0, w: 10, h: 10, props: { columns: [{ icon: RESOURCE_BASE_URL + G(2) + '.png' }, { icon: PNG_DATA_URL }], meta: { deep: { logo: RESOURCE_BASE_URL + G(1) + '.png' } }, text: 'plain' } }
] }
check('资源引用收集 / 替换：递归进入嵌套对象与数组，去重保序，不改原布局', () => {
  assert.deepEqual(collectResourceRefs(nestedLayout), [RESOURCE_BASE_URL + G(1) + '.png', RESOURCE_BASE_URL + G(2) + '.png', PNG_DATA_URL])
  const r = replaceResourceRefs(nestedLayout, { [RESOURCE_BASE_URL + G(2) + '.png']: 'X', [PNG_DATA_URL]: '' })
  assert.equal(r.widgets[1].props.columns[0].icon, 'X'); assert.equal(r.widgets[1].props.columns[1].icon, ''); assert.equal(r.widgets[1].props.meta.deep.logo, RESOURCE_BASE_URL + G(1) + '.png')
  assert.equal(nestedLayout.widgets[1].props.columns[0].icon, RESOURCE_BASE_URL + G(2) + '.png')
  assert.ok(HOST_GENERATED_NAME.test(G(7) + '.PNG') && !HOST_GENERATED_NAME.test('exp1.png') && !HOST_GENERATED_NAME.test(G(7)) && !HOST_GENERATED_NAME.test('.gitkeep'))
})
// 老宿主（没有这些接口）：列举返回 null、清理不删任何东西、宿主打包返回 undefined（页面退回前端流程，上面的用例已覆盖）
{
  const r = await cleanupUnusedResources(nestedLayout)
  const l = await listResourceFiles(); const e = await exportPackageViaHost(nestedLayout); const pv = await previewPackageViaHost('')
  check('老宿主没有 ListResourceFiles / ExportScadaPackage 等接口：清理跳过（total -1）、列举 null、宿主打包 undefined', () => {
    assert.deepEqual(r, { total: -1, deleted: [], failed: [] }); assert.equal(l, null); assert.equal(e, undefined); assert.equal(pv, undefined)
  })
  assert.throws(() => layoutFromHostImport({ Layout: { foo: 1 } }), /invalid-layout/)
  assert.throws(() => layoutFromHostImport({ Layout: [] }), /invalid-layout/)
}
// 给模拟宿主补上新接口（SPC_M b75fc6e / 91ebedd）
const bridge = window.chrome.webview.hostObjects.JsBridge
const fail = Message => Promise.resolve(JSON.stringify({ Code: 1, Message }))
const hostFlags = { exportCancel: false, previewCancel: false, importFail: false }
Object.assign(bridge, {
  ListResourceFiles: () => { calls.list = (calls.list || 0) + 1; return json([...hostFiles.keys()].map(name => ({ FileName: name, RelativePath: 'Resources/pic/' + name, Url: 'https://pic.nt.local/' + name, Size: hostFiles.get(name).length, LastModifiedUtc: '2026-09-29T00:00:00Z' }))) },
  DeleteResourceFile: name => {
    calls.deleted = (calls.deleted || []); calls.deleted.push(name)
    if (typeof name !== 'string' || /[\\/:*?"<>|]/.test(name) || name === '.gitkeep') return fail('删除资源失败：文件名不合法')
    const existed = hostFiles.delete(name); return json({ FileName: name, RelativePath: 'Resources/pic/' + name, Deleted: existed })
  },
  ExportScadaPackage: (layoutJson, targetPath) => {
    calls.export = { layoutJson, targetPath }
    if (typeof layoutJson !== 'string' || typeof targetPath !== 'string') return fail('导出组态失败：参数类型错误')
    if (hostFlags.exportCancel) return json({ Cancelled: true })
    const l = JSON.parse(layoutJson)
    return json({ Cancelled: false, Path: 'D:\\Export\\scada-layout-20260929-120000.zip', FileName: 'scada-layout-20260929-120000.zip', Size: 2048, Widgets: l.widgets.length, Resources: 1, Missing: ['https://pic.nt.local/gone.png'] })
  },
  PreviewScadaPackage: packagePath => {
    calls.preview = packagePath
    if (typeof packagePath !== 'string') return fail('读取组态包失败：参数类型错误')
    if (hostFlags.previewCancel) return json({ Cancelled: true })
    return json({ Cancelled: false, Path: 'D:\\pkg\\foreign.zip', FileName: 'foreign.zip', Size: 999, Widgets: 2, Canvas: { Width: 640, Height: 480 }, Resources: 3, ToCopy: 1, Reusable: 1, Missing: ['https://pic.nt.local/gone.png'],
      Files: [{ File: 'resources/' + G(9) + '.png', Url: 'https://pic.nt.local/' + G(9) + '.png', Size: PNG.length, InPackage: true, Exists: false }, { File: 'resources/exp1.png', Url: RESOURCE_BASE_URL + 'exp1.png', Size: PNG.length, InPackage: true, Exists: true }, { File: 'resources/gone.png', Url: 'https://pic.nt.local/gone.png', Size: 0, InPackage: false, Exists: false }] })
  },
  ImportScadaPackage: packagePath => {
    calls.import = packagePath
    if (hostFlags.importFail) return fail('导入组态失败：模拟失败')
    hostFiles.set(G(9) + '.png', PNG) // 宿主把包里的资源解压到 Resources/pic
    return json({ Path: packagePath, FileName: 'foreign.zip', Layout: { version: 2, canvas: { width: 640, height: 480, background: '#ffffff', grid: 10 }, widgets: [
      { id: 'h1', type: 'image', x: 0, y: 0, w: 100, h: 80, props: { src: 'https://pic.nt.local/' + G(9) + '.png' } },
      { id: 'h2', type: 'textLabel', x: 0, y: 100, w: 100, h: 30, props: { text: 'host imported' } }
    ] }, Widgets: 2, Copied: 1, Reused: 1, Missing: ['https://pic.nt.local/gone.png'], Failed: [] })
  }
})
// 清理：只删布局不再引用的 GUID 文件；非 GUID 文件（exp1.png 等）和引用中的文件不动
hostFiles.set(G(1) + '.png', PNG); hostFiles.set(G(2) + '.png', PNG); hostFiles.set(G(3) + '.jpg', PNG); hostFiles.set('manual-copy.png', PNG)
{
  const r = await cleanupUnusedResources(nestedLayout)
  check('cleanupUnusedResources：删除未引用的 GUID 文件（含大小写无关的扩展名），保留引用中的与非 GUID 文件', () => {
    assert.deepEqual(r.deleted, [G(3) + '.jpg']); assert.deepEqual(r.failed, [])
    assert.ok(hostFiles.has(G(1) + '.png') && hostFiles.has(G(2) + '.png') && hostFiles.has('manual-copy.png') && hostFiles.has('exp1.png') && !hostFiles.has(G(3) + '.jpg'))
    assert.ok(!calls.deleted.includes('manual-copy.png') && !calls.deleted.includes('exp1.png'))
  })
  const d1 = await deleteResourceFile('manual-copy.png'); const d2 = await deleteResourceFile('../x.png'); const d3 = await deleteResourceFile(G(2) + '.png')
  check('deleteResourceFile：只接受 GUID 文件名（非 GUID / 带路径的名字不会发给宿主）', () => { assert.equal(d1, false); assert.equal(d2, false); assert.equal(d3, true); assert.ok(!hostFiles.has(G(2) + '.png')); assert.ok(!calls.deleted.includes('../x.png')) })
  hostFiles.set(G(2) + '.png', PNG)
}
// 保存后自动清理：当前已保存布局是 3 个组件（f1 → 上传的宿主图、f2 → exp1.png、f3 文本），G(1)/G(2) 未被引用
const listBefore = calls.list || 0
scada.startEdit(); scada.addWidget('textLabel'); await scada.save(); await waitUntil(() => (calls.list || 0) > listBefore && !hostFiles.has(G(1) + '.png'))
check('保存组态后自动清理：未引用的 GUID 文件被删除，布局引用的上传图与非 GUID 文件保留', () => {
  assert.ok(!hostFiles.has(G(1) + '.png') && !hostFiles.has(G(2) + '.png'))
  const kept = scada.layout.widgets.map(w => w.props.src).filter(s => typeof s === 'string' && s.startsWith(RESOURCE_BASE_URL)).map(s => decodeURIComponent(s.slice(RESOURCE_BASE_URL.length)))
  assert.ok(kept.length >= 1 && kept.every(n => hostFiles.has(n)), kept); assert.ok(hostFiles.has('manual-copy.png'))
})
// 页面流程：右键菜单“导出组态”→ 宿主 ExportScadaPackage（另存为），不再走浏览器下载
const dlBefore = downloads.length; const msgBefore = msgs.length
await contextMenu(100, 100); menuItem('导出组态').click(); await nextTick(); await waitUntil(() => msgs.length > msgBefore)
check('导出组态（有宿主）：把当前布局 JSON 交给 ExportScadaPackage、路径留空（宿主弹另存为），提示导出路径，不触发浏览器下载', () => {
  assert.equal(calls.export.targetPath, ''); const l = JSON.parse(calls.export.layoutJson); assert.equal(l.widgets.length, scada.layout.widgets.length); assert.equal(l.canvas.width, scada.layout.canvas.width)
  assert.equal(downloads.length, dlBefore); assert.ok(msgs[msgs.length - 1].includes('D:\\Export\\scada-layout-20260929-120000.zip') && msgs[msgs.length - 1].includes('1 个资源'), msgs[msgs.length - 1])
  assert.ok(warns[warns.length - 1].includes('1 个资源文件'), warns[warns.length - 1]) // Missing → 警告
})
hostFlags.exportCancel = true; calls.export = null
await contextMenu(100, 100); menuItem('导出组态').click(); await nextTick(); await waitUntil(() => !!calls.export); await sleep(80)
check('导出组态：宿主另存为被取消 → 不提示、不下载', () => { assert.ok(calls.export); assert.equal(msgs.length, msgBefore + 1); assert.equal(downloads.length, dlBefore) })
hostFlags.exportCancel = false
// 页面流程：右键菜单“导入组态”→ 宿主 PreviewScadaPackage（打开对话框）→ 导入弹窗清单 → ImportScadaPackage
const inputsBefore = clickedInputs.length
calls.preview = undefined
await contextMenu(100, 100); menuItem('导入组态').click(); await nextTick(); await waitUntil(() => phase() === 'ready')
check('导入组态（有宿主）：PreviewScadaPackage(\'\') 由宿主选文件，不再点隐藏 file input；弹窗列出宿主清点结果（文件 / 组件数 / 画布 / 需复制 1 · 可复用 1 · 缺失 1）', () => {
  assert.equal(calls.preview, ''); assert.equal(clickedInputs.length, inputsBefore)
  assert.equal(phase(), 'ready'); assert.equal(dialog().querySelector('[data-import-phase]').getAttribute('data-import-source'), 'host')
  const txt = dialog().textContent
  for (const kw of ['foreign.zip', '640 × 480', '需复制 1', '可复用 1', '缺失 1', '本机都没有', '替换当前已保存的组态']) assert.ok(txt.includes(kw), kw)
  assert.ok(!txt.includes('需上传')); assert.ok(dialogButton('导入'))
})
const listBefore2 = calls.list || 0; const layoutBefore2 = scada.layout
hostFiles.set(G(5) + '.png', PNG) // 导入前的孤儿文件，导入后应被清理
document.body.querySelector('[data-import-confirm]').click(); await nextTick(); await waitPhase('ready', 'importing'); await waitUntil(() => (calls.list || 0) > listBefore2 && !hostFiles.has(G(5) + '.png'))
check('确认导入：ImportScadaPackage(Path) 解压资源并返回布局 → 规范化后替换并持久化，弹窗显示“复制 1 · 复用 1”，缺失提示；随后清理未引用文件', () => {
  assert.equal(phase(), 'done'); assert.equal(calls.import, 'D:\\pkg\\foreign.zip')
  assert.notEqual(scada.layout, layoutBefore2); assert.equal(scada.layout.widgets.length, 2); assert.equal(scada.layout.widgets[0].props.src, 'https://pic.nt.local/' + G(9) + '.png')
  assert.equal(JSON.parse(localStorage.getItem('scadaLayout')).widgets.length, 2); assert.ok(canvasView.el.textContent.includes('host imported'))
  const txt = dialog().textContent; assert.ok(txt.includes('导入完成') && txt.includes('资源复制 1 个、复用 1 个') && txt.includes('本机都没有'), txt)
  assert.ok(msgs[msgs.length - 1].includes('资源复制 1 个'), msgs[msgs.length - 1])
  assert.ok(hostFiles.has(G(9) + '.png') && !hostFiles.has(G(5) + '.png') && hostFiles.has('manual-copy.png'))
})
dialogButton('关闭').click(); await nextTick(); await sleep(100)
check('关闭宿主导入弹窗', () => assert.ok(!dialog()))
hostFlags.previewCancel = true; calls.preview = undefined
await contextMenu(100, 100); menuItem('导入组态').click(); await nextTick(); await waitUntil(() => calls.preview !== undefined); await sleep(80)
check('导入组态：宿主打开对话框被取消 → 不弹导入弹窗、不点 file input', () => { assert.equal(calls.preview, ''); assert.ok(!dialog()); assert.equal(clickedInputs.length, inputsBefore) })
hostFlags.previewCancel = false
// 宿主导入失败：弹窗显示错误，布局不变
hostFlags.importFail = true
await contextMenu(100, 100); menuItem('导入组态').click(); await nextTick(); await waitUntil(() => phase() === 'ready')
document.body.querySelector('[data-import-confirm]').click(); await nextTick(); await waitPhase('ready', 'importing')
check('宿主 ImportScadaPackage 返回失败：弹窗显示“导入失败”，已保存布局不变', () => { assert.equal(phase(), 'error'); assert.ok(dialog().textContent.includes('导入失败')); assert.equal(scada.layout.widgets.length, 2); assert.ok(!dialogButton('导入')) })
hostFlags.importFail = false
document.body.querySelector('.n-modal .n-card-header__close').click(); await nextTick(); await sleep(100)
// 编辑模式下宿主导入：只替换草稿，不持久化、不清理
scada.startEdit(); await nextTick()
const listBefore3 = calls.list || 0
await contextMenu(100, 100)
check('编辑模式没有右键菜单（用工具栏 ⋯）', () => assert.equal(menuItems().length, 0))
root.querySelector('[data-scada-more]').click(); await nextTick(); await sleep(80)
menuItem('导入组态').click(); await nextTick(); await waitUntil(() => phase() === 'ready')
check('编辑模式宿主导入：清单提示“替换当前草稿”', () => { assert.equal(phase(), 'ready'); assert.ok(dialog().textContent.includes('替换当前草稿')) })
document.body.querySelector('[data-import-confirm]').click(); await nextTick(); await waitPhase('ready', 'importing'); await sleep(80)
check('编辑模式确认宿主导入：草稿被替换（dirty），已保存布局与存储不变，不触发清理，提示记得保存', () => {
  assert.equal(phase(), 'done'); assert.equal(scada.draft.widgets.length, 2); assert.ok(scada.dirty); assert.ok(scada.editing)
  assert.equal(calls.list || 0, listBefore3); assert.ok(dialog().textContent.includes('记得保存'))
})
dialogButton('关闭').click(); await nextTick(); await sleep(100)
scada.cancelEdit(); await nextTick()

// ---------------- 任务 59（一）：排列运算 / 旋转翻转几何 / 八点缩放 / 图层顺序 / 布局反序列化（纯函数） ----------------
const P = (patches, id) => { const p = patches.find(e => e.id === id); assert.ok(p, `no patch for ${id}`); return { x: p.x, y: p.y, w: p.w, h: p.h } }
const mkItem = (id, x, y, w, h, extra = {}) => ({ id, x, y, w, h, min: { w: 20, h: 20 }, ...extra })
check('几何：旋转归一化 / 视觉外框（90° 宽高互换、中心不变）/ 视觉外框与布局外框互逆 / CSS transform 串', () => {
  assert.deepEqual([0, 90, 180, 270, 360, -90, 450, 45, 'x', undefined, NaN].map(normRotate), [0, 90, 180, 270, 0, 270, 90, 90, 0, 0, 0])
  assert.deepEqual(visualRect({ x: 400, y: 120, w: 60, h: 20, rotate: 90 }), { x: 420, y: 100, w: 20, h: 60 })
  assert.deepEqual(visualRect({ x: 400, y: 120, w: 60, h: 20, rotate: 180 }), { x: 400, y: 120, w: 60, h: 20 })
  assert.deepEqual(visualRect({ x: 400, y: 120, w: 60, h: 20, rotate: 270 }), { x: 420, y: 100, w: 20, h: 60 })
  for (const r of [0, 90, 180, 270]) { const it = { x: 37, y: 91, w: 70, h: 24, rotate: r }; const v = visualRect(it); assert.deepEqual({ ...layoutFromVisual(v, r), rotate: r }, it) }
  assert.deepEqual(unionRect([{ x: 10, y: 20, w: 5, h: 5 }, { x: 30, y: 0, w: 10, h: 10 }]), { x: 10, y: 0, w: 30, h: 25 }); assert.equal(unionRect([]), null)
  assert.equal(transformCss({}), ''); assert.equal(transformCss({ rotate: 90 }), 'rotate(90deg)'); assert.equal(transformCss({ flipX: true }), 'scale(-1, 1)'); assert.equal(transformCss({ rotate: 270, flipX: true, flipY: true }), 'rotate(270deg) scale(-1, -1)')
  // 画布夹紧按视觉外框：旋转 90° 后视觉外框是 20×60，夹进画布后视觉外框仍完整在画布内
  const c = clampLayoutRect({ x: 0, y: 0, w: 60, h: 20 }, 90, { width: 200, height: 200 }, { w: 20, h: 20 }); assert.deepEqual(visualRect({ ...c, rotate: 90 }), { x: 20, y: 0, w: 20, h: 60 }, JSON.stringify(c))
  const c2 = clampLayoutRect({ x: 190, y: 10, w: 60, h: 20 }, 90, { width: 200, height: 200 }, { w: 20, h: 20 }); const v2 = visualRect({ ...c2, rotate: 90 }); assert.ok(v2.x >= 0 && v2.x + v2.w <= 200 && v2.y >= 0 && v2.y + v2.h <= 200, JSON.stringify(v2))
})
const R = mkItem('r', 100, 50, 100, 40)
const B = mkItem('b', 10, 200, 50, 30)
const C = mkItem('c', 400, 120, 60, 20, { rotate: 90 })   // 视觉外框 (420, 100, 20, 60)
check('对齐（与参考对象）：左 / 右 / 上 / 下边缘，垂直中心轴 / 水平中心轴 / 中心点；参考对象与锁定的不动；旋转过的组件按视觉外框对齐', () => {
  const al = k => arrange.alignItems([R, B, C], 'r', k)
  assert.ok(!al('left').some(p => p.id === 'r'), '参考对象不动')
  assert.deepEqual(P(al('left'), 'b'), { x: 100, y: 200, w: 50, h: 30 }); assert.deepEqual(P(al('left'), 'c'), { x: 80, y: 120, w: 60, h: 20 })   // 视觉左边缘 80 + 20 = 100
  assert.deepEqual(P(al('right'), 'b'), { x: 150, y: 200, w: 50, h: 30 }); assert.deepEqual(P(al('right'), 'c'), { x: 160, y: 120, w: 60, h: 20 })
  assert.deepEqual(P(al('top'), 'b'), { x: 10, y: 50, w: 50, h: 30 }); assert.deepEqual(P(al('top'), 'c'), { x: 400, y: 70, w: 60, h: 20 })
  assert.deepEqual(P(al('bottom'), 'b'), { x: 10, y: 60, w: 50, h: 30 }); assert.deepEqual(P(al('bottom'), 'c'), { x: 400, y: 50, w: 60, h: 20 })
  assert.deepEqual(P(al('centerX'), 'b'), { x: 125, y: 200, w: 50, h: 30 }); assert.deepEqual(P(al('centerX'), 'c'), { x: 120, y: 120, w: 60, h: 20 })   // 中心 x 都是 150
  assert.deepEqual(P(al('centerY'), 'b'), { x: 10, y: 55, w: 50, h: 30 }); assert.deepEqual(P(al('centerY'), 'c'), { x: 400, y: 60, w: 60, h: 20 })   // 中心 y 都是 70
  assert.deepEqual(P(al('center'), 'b'), { x: 125, y: 55, w: 50, h: 30 })
  assert.deepEqual(arrange.alignItems([R, { ...B, locked: true }, C], 'r', 'left').map(p => p.id), ['c'], '锁定的不动'); assert.deepEqual(arrange.alignItems([B, C], 'nope', 'left'), [])
  const vc = patch => visualRect({ ...patch, rotate: 90 }); assert.equal(vc(P(al('left'), 'c')).x, 100); assert.equal(vc(P(al('right'), 'c')).x + 20, 200)
})
check('相对整个画面居中：水平（x 居中、y 不变）/ 垂直（y 居中、x 不变）/ 画面中心；每个对象各自居中；锁定的不动', () => {
  const cv = { width: 1000, height: 600 }
  assert.deepEqual(P(arrange.centerInCanvas([B, R], cv, 'x'), 'b'), { x: 475, y: 200, w: 50, h: 30 }); assert.deepEqual(P(arrange.centerInCanvas([B, R], cv, 'x'), 'r'), { x: 450, y: 50, w: 100, h: 40 })
  assert.deepEqual(P(arrange.centerInCanvas([B], cv, 'y'), 'b'), { x: 10, y: 285, w: 50, h: 30 }); assert.deepEqual(P(arrange.centerInCanvas([B], cv, 'both'), 'b'), { x: 475, y: 285, w: 50, h: 30 })
  assert.deepEqual(P(arrange.centerInCanvas([C], cv, 'both'), 'c'), { x: 470, y: 290, w: 60, h: 20 }, '旋转 90° 的横条：视觉 20×60 居中 → 布局外框中心也在画面中心')
  assert.deepEqual(arrange.centerInCanvas([{ ...B, locked: true }], cv, 'both'), [])
})
check('分布：等间距（两端不动，间隙相等）/ 中心等距；少于 3 个不动；锁定的不动', () => {
  const g = arrange.distributeItems([R, B, C], 'h', 'gap'); assert.equal(g.length, 1); assert.deepEqual(P(g, 'r'), { x: 190, y: 50, w: 100, h: 40 })   // 间隙 (430 - 170) / 2 = 130
  const c = arrange.distributeItems([R, B, C], 'h', 'center'); assert.deepEqual(P(c, 'r'), { x: 183, y: 50, w: 100, h: 40 })   // 中心 (35 + 430) / 2 = 232.5 → x 182.5 → 183
  const v = arrange.distributeItems([mkItem('a', 0, 0, 20, 20), mkItem('d', 0, 200, 20, 20), mkItem('c', 9, 70, 20, 40), mkItem('b', 5, 30, 20, 20)], 'v', 'gap')   // 乱序传入，按位置排序；间隙 (220 - 100) / 3 = 40
  assert.deepEqual(v.map(p => [p.id, p.y]).sort(), [['b', 60], ['c', 120]], '总高 100、跨度 220 → 每个间隙 40：b = 20 + 40，c = 60 + 20 + 40')
  assert.deepEqual(arrange.distributeItems([R, B], 'h', 'gap'), []); assert.deepEqual(arrange.distributeItems([B, { ...R, locked: true }, C], 'h', 'gap'), [], '唯一可动的中间项被锁定')
})
check('等宽 / 等高 / 等宽高：其它对象的视觉宽 / 高改成参考对象的（左上角不动），旋转过的按视觉尺寸', () => {
  const w = arrange.sizeItems([R, B, C], 'r', 'w'); assert.deepEqual(P(w, 'b'), { x: 10, y: 200, w: 100, h: 30 }); assert.deepEqual(P(w, 'c'), { x: 440, y: 80, w: 60, h: 100 })   // 视觉 100×60 → 布局 60×100
  assert.deepEqual(P(arrange.sizeItems([R, B], 'r', 'h'), 'b'), { x: 10, y: 200, w: 50, h: 40 }); assert.deepEqual(P(arrange.sizeItems([R, B], 'r', 'both'), 'b'), { x: 10, y: 200, w: 100, h: 40 })
  assert.deepEqual(arrange.sizeItems([R, { ...B, locked: true }], 'r', 'both'), [])
})
check('旋转 90°：整个选区绕外接框中心转（单个 = 绕自己的中心），rotate 累加 / 取模；翻转：中心镜像 + flip 取反 + rotate 取负（画面镜像在旋转之后）', () => {
  const cw = arrange.rotateItems([B, R], 1); assert.deepEqual(cw.find(p => p.id === 'b'), { id: 'b', x: 5, y: 55, w: 50, h: 30, rotate: 90 }); assert.deepEqual(cw.find(p => p.id === 'r'), { id: 'r', x: 125, y: 165, w: 100, h: 40, rotate: 90 })
  const ccw = arrange.rotateItems([B, R], -1); assert.deepEqual(ccw.find(p => p.id === 'b'), { id: 'b', x: 155, y: 195, w: 50, h: 30, rotate: 270 })   // 中心 (35, 215) 绕 (105, 140) 逆时针 → (180, 210)
  const one = arrange.rotateItems([R], 1)[0]; assert.deepEqual([one.x, one.y, one.w, one.h, one.rotate], [100, 50, 100, 40, 90], '单个组件中心不变')
  assert.equal(arrange.rotateItems([{ ...R, rotate: 270 }], 1)[0].rotate, 0); assert.equal(arrange.rotateItems([{ ...R, rotate: 0 }], -1)[0].rotate, 270)
  assert.deepEqual(arrange.rotateItems([{ ...B, locked: true }], 1), [])
  const fx = arrange.flipItems([B, R], 'x'); assert.deepEqual(fx.find(p => p.id === 'b'), { id: 'b', x: 150, y: 200, w: 50, h: 30, rotate: 0, flipX: true }); assert.deepEqual(fx.find(p => p.id === 'r'), { id: 'r', x: 10, y: 50, w: 100, h: 40, rotate: 0, flipX: true })
  const fy = arrange.flipItems([{ ...R, rotate: 90, flipY: true }], 'y')[0]; assert.equal(fy.rotate, 270); assert.equal(fy.flipY, false); assert.equal(fy.flipX, undefined)
  // 连续翻两次 = 原样
  const once = arrange.flipItems([{ ...R, rotate: 90 }], 'x')[0]; const twice = arrange.flipItems([{ ...R, rotate: once.rotate, flipX: once.flipX }], 'x')[0]; assert.deepEqual([twice.rotate, twice.flipX], [90, false])
  // 整体超出画布时平移回来
  const moved = arrange.fitPatchesInside([{ id: 'r', x: -30, y: 10, w: 100, h: 40, rotate: 0 }, { id: 'b', x: 50, y: 10, w: 50, h: 30, rotate: 0 }], [R, B], { width: 500, height: 300 }); assert.deepEqual(moved.map(p => p.x), [0, 80])
})
const BOUNDS = { x: 100, y: 100, w: 200, h: 100 }
const OPT = { grid: 10, canvas: { width: 1000, height: 600 }, minW: 20, minH: 20 }
check('八点缩放 resizeBounds：八个手柄只动被拖的边（吸附网格），对边不动；不越出画布、不小于最小尺寸', () => {
  const rb = (h, dx, dy, o = {}) => arrange.resizeBounds(BOUNDS, h, dx, dy, { ...OPT, ...o })
  assert.deepEqual(rb('se', 55, 33), { x: 100, y: 100, w: 260, h: 130 }); assert.deepEqual(rb('nw', -47, -33), { x: 50, y: 70, w: 250, h: 130 })
  assert.deepEqual(rb('ne', 30, -30), { x: 100, y: 70, w: 230, h: 130 }); assert.deepEqual(rb('sw', -30, 30), { x: 70, y: 100, w: 230, h: 130 })
  assert.deepEqual(rb('n', 999, -30), { x: 100, y: 70, w: 200, h: 130 }, '边中点手柄只改一个方向'); assert.deepEqual(rb('s', 999, 30), { x: 100, y: 100, w: 200, h: 130 })
  assert.deepEqual(rb('e', 30, 999), { x: 100, y: 100, w: 230, h: 100 }); assert.deepEqual(rb('w', -30, 999), { x: 70, y: 100, w: 230, h: 100 })
  assert.deepEqual(rb('n', 0, 200), { x: 100, y: 180, w: 200, h: 20 }, '拖过对边 = 停在最小尺寸'); assert.deepEqual(rb('s', 0, -500), { x: 100, y: 100, w: 200, h: 20 })
  assert.deepEqual(rb('w', 500, 0), { x: 280, y: 100, w: 20, h: 100 }); assert.deepEqual(rb('e', -500, 0), { x: 100, y: 100, w: 20, h: 100 })
  assert.deepEqual(rb('e', 2000, 0), { x: 100, y: 100, w: 900, h: 100 }, '右边缘停在画布边'); assert.deepEqual(rb('w', -500, 0), { x: 0, y: 100, w: 300, h: 100 })
  assert.deepEqual(rb('n', 0, -500), { x: 100, y: 0, w: 200, h: 200 }); assert.deepEqual(rb('s', 0, 2000), { x: 100, y: 100, w: 200, h: 500 })
  assert.deepEqual(rb('se', 4, 4, { grid: 1 }), { x: 100, y: 100, w: 204, h: 104 }, '网格关闭：只取整'); assert.deepEqual(rb('se', 4.6, 0, { grid: 1 }), { x: 100, y: 100, w: 205, h: 100 })
  assert.deepEqual(rb('se', -190, -90, { minW: 80, minH: 60 }), { x: 100, y: 100, w: 80, h: 60 }, '多选时按各组件最小尺寸折算的最小外接框')
})
check('Shift 等比缩放（仅四角，以对角为锚点）：取较大的缩放比，受画布边界与最小尺寸限制；边中点手柄忽略 Shift', () => {
  const rb = (h, dx, dy) => arrange.resizeBounds(BOUNDS, h, dx, dy, { ...OPT, keepAspect: true })
  assert.deepEqual(rb('se', 100, 10), { x: 100, y: 100, w: 300, h: 150 }); assert.deepEqual(rb('se', -100, -10), { x: 100, y: 100, w: 180, h: 90 })
  assert.deepEqual(rb('nw', -100, -10), { x: 0, y: 50, w: 300, h: 150 }, '锚点是右下角'); assert.deepEqual(rb('ne', 100, -50), { x: 100, y: 50, w: 300, h: 150 })
  assert.deepEqual(rb('se', 2000, 0), { x: 100, y: 100, w: 900, h: 450 }, '先碰到哪条画布边就停在哪'); assert.deepEqual(rb('se', -2000, -2000), { x: 100, y: 100, w: 40, h: 20 }, '最小尺寸 20×20 → 缩放比 0.2')
  assert.deepEqual(rb('e', 50, 50), { x: 100, y: 100, w: 250, h: 100 })
})
check('选区缩放 scaleItems / boundsMin：各组件按同一比例缩放 + 平移（边对边取整）；外接框最小值由各组件最小尺寸折算', () => {
  const items = [mkItem('a', 100, 100, 100, 100), mkItem('b', 250, 100, 50, 100)]
  const p = arrange.scaleItems(items, BOUNDS, { x: 100, y: 100, w: 400, h: 100 }); assert.deepEqual(P(p, 'a'), { x: 100, y: 100, w: 200, h: 100 }); assert.deepEqual(P(p, 'b'), { x: 400, y: 100, w: 100, h: 100 })
  const q = arrange.scaleItems(items, BOUNDS, { x: 0, y: 50, w: 100, h: 50 }); assert.deepEqual(P(q, 'a'), { x: 0, y: 50, w: 50, h: 50 }); assert.deepEqual(P(q, 'b'), { x: 75, y: 50, w: 25, h: 50 })
  assert.deepEqual(arrange.boundsMin(items, BOUNDS), { minW: 80, minH: 20 })   // b 宽 50 → 最小缩放 0.4
  assert.deepEqual(arrange.boundsMin([mkItem('s', 0, 0, 100, 50, { rotate: 90, min: { w: 40, h: 20 } })], { x: 25, y: -25, w: 50, h: 100 }), { minW: 20, minH: 40 }, '旋转 90° 的最小视觉尺寸宽高互换（布局最小 40×20 → 视觉最小 20×40）')
  const r90 = arrange.scaleItems([mkItem('t', 0, 0, 100, 50, { rotate: 90 })], { x: 25, y: -25, w: 50, h: 100 }, { x: 25, y: -25, w: 100, h: 200 }); assert.deepEqual(visualRect({ ...P(r90, 't'), rotate: 90 }), { x: 25, y: -25, w: 100, h: 200 })
})
check('图层顺序：置顶 / 置底 / 上移一层 / 下移一层（多选时彼此顺序不变、每个只动一格）/ 移到某组件上方 / 下方', () => {
  const L = ['a', 'b', 'c', 'd', 'e'].map(id => ({ id })); const ids = new Set(['b', 'd']); const o = l => l.map(w => w.id).join('')
  assert.equal(o(arrange.orderToFront(L, ids)), 'acebd'); assert.equal(o(arrange.orderToBack(L, ids)), 'bdace')
  assert.equal(o(arrange.orderForward(L, ids)), 'acbed'); assert.equal(o(arrange.orderBackward(L, ids)), 'badce')
  assert.equal(o(arrange.orderForward(L, new Set(['d', 'e']))), 'abcde', '已在最上面'); assert.equal(o(arrange.orderBackward(L, new Set(['a', 'b']))), 'abcde')
  assert.equal(o(arrange.orderForward(L, new Set(['a', 'b']))), 'cabde', '相邻的一组一起越过上面的一个'); assert.equal(o(arrange.orderRelative(L, ids, 'e', 'above')), 'acebd'); assert.equal(o(arrange.orderRelative(L, ids, 'a', 'below')), 'bdace')
  assert.equal(o(arrange.orderRelative(L, ids, 'c', 'below')), 'abdce'); assert.equal(o(arrange.orderRelative(L, ids, 'b', 'above')), 'abcde', '目标在选中里 = 不动')
})
check('布局反序列化：旋转 / 翻转 / 锁定 / 隐藏 / 组合都是可选字段（老布局照常读取），非法值丢弃，落单的组合 id 清掉', () => {
  const mk = (id, extra = {}) => ({ id, type: 'rect', x: 0, y: 0, w: 50, h: 50, props: {}, ...extra })
  const l = normalizeLayout({ widgets: [mk('a', { rotate: 450, flipX: true, flipY: 'yes', locked: true, hidden: true, groupId: 'g1' }), mk('b', { rotate: 'x', groupId: 'g1' }), mk('c', { groupId: 'lonely', flipY: true }), mk('d')] })
  const a = l.widgets[0]; assert.equal(a.rotate, 90); assert.equal(a.flipX, true); assert.ok(!('flipY' in a)); assert.equal(a.locked, true); assert.equal(a.hidden, true); assert.equal(a.groupId, 'g1')
  assert.ok(!('rotate' in l.widgets[1])); assert.equal(l.widgets[1].groupId, 'g1'); assert.ok(!('groupId' in l.widgets[2])); assert.equal(l.widgets[2].flipY, true)
  assert.deepEqual(Object.keys(l.widgets[3]).sort(), ['binding', 'h', 'id', 'props', 'title', 'type', 'w', 'x', 'y'], '没有新字段的老布局原样')
})
check('指针落点换算回组件自己的坐标（滑块被旋转 / 翻转后用）：画面上的 (u, v) → 组件坐标 (fx, fy)', () => {
  const rect = { left: 0, top: 0, width: 100, height: 200 }   // 画面上的外接框
  const lf = (x, y, w) => { const r = localFraction(rect, x, y, w); return [Math.round(r.fx * 100) / 100, Math.round(r.fy * 100) / 100] }
  assert.deepEqual(lf(25, 50, {}), [0.25, 0.25])
  assert.deepEqual(lf(50, 0, { rotate: 90 }), [0, 0.5], '顺时针 90°：组件的左端在画面上方'); assert.deepEqual(lf(50, 200, { rotate: 90 }), [1, 0.5]); assert.deepEqual(lf(0, 100, { rotate: 90 }), [0.5, 1])
  assert.deepEqual(lf(25, 50, { rotate: 180 }), [0.75, 0.75]); assert.deepEqual(lf(50, 200, { rotate: 270 }), [0, 0.5], '逆时针 90°：组件的左端在画面下方'); assert.deepEqual(lf(100, 100, { rotate: 270 }), [0.5, 1])
  assert.deepEqual(lf(100, 0, { flipX: true }), [0, 0]); assert.deepEqual(lf(100, 0, { flipY: true }), [1, 1]); assert.deepEqual(lf(100, 0, { rotate: 90, flipX: true }), [1, 0], '先撤销旋转、再撤销翻转')
  assert.deepEqual(Object.values(localFraction({ left: 0, top: 0, width: 0, height: 0 }, 5, 5, {})), [0, 0])
})


// ---------------- 任务 59（二）：多选 / 八点缩放 / 锁定 / 网格（画布交互） ----------------
{
scada.startEdit(); scada.clearWidgets(); await nextTick()
scada.setCanvas({ width: 1000, height: 600, grid: 10 })
const mkW = (type, x, y, w, h) => { const wd = scada.addWidget(type); scada.updateWidgetRect(wd.id, { x, y, w, h }); return wd }
const A = mkW('rect', 100, 100, 100, 60), B = mkW('rect', 300, 200, 80, 40), C = mkW('rect', 500, 300, 60, 60)
scada.select(null); await nextTick()
const hostEl = id => canvasView.el.querySelector(`[data-widget-id="${id}"]`)
const rectOf = id => { const e = scada.draft.widgets.find(v => v.id === id); return { x: e.x, y: e.y, w: e.w, h: e.h } }
const widgetOf = id => scada.draft.widgets.find(v => v.id === id)
let pid59 = 1000
const ptr = (el, type, x, y, init = {}) => el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, pointerId: 1, ...init }))
const clickW = (id, init = {}) => { const el = hostEl(id); const pointerId = ++pid59; ptr(el, 'pointerdown', 5, 5, { pointerId, ...init }); ptr(el, 'pointerup', 5, 5, { pointerId, ...init }) }
const dragEl = (el, dx, dy, init = {}) => { const pointerId = ++pid59; ptr(el, 'pointerdown', 0, 0, { pointerId, ...init }); ptr(el, 'pointermove', dx, dy, { pointerId, ...init }); ptr(el, 'pointerup', dx, dy, { pointerId, ...init }) }
const handleEl = h => canvasView.el.querySelector(`[data-handle="${h}"]`)
const sel = () => [...scada.selectedIds]
const ids3 = [A.id, B.id, C.id]
const INIT = { [A.id]: { x: 100, y: 100, w: 100, h: 60 }, [B.id]: { x: 300, y: 200, w: 80, h: 40 }, [C.id]: { x: 500, y: 300, w: 60, h: 60 } }
const resetAll = () => ids3.forEach(id => scada.updateWidgetRect(id, INIT[id]))
clickW(A.id); await nextTick()
check('点击组件选中单个：selectedId 有值、参考对象就是它、画布上有 8 个缩放手柄（没有多选的虚线外框 / 参考标记）', () => {
  assert.deepEqual(sel(), [A.id]); assert.equal(scada.selectedId, A.id); assert.equal(scada.referenceId, A.id)
  assert.deepEqual([...canvasView.el.querySelectorAll('[data-handle]')].map(e => e.dataset.handle), ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'])
  assert.ok(!canvasView.el.querySelector('[data-selection-frame]') && !canvasView.el.querySelector('[data-reference-badge]'))
  assert.match(hostEl(A.id).style.outline, /2px solid/); assert.ok(/2563eb|37, 99, 235/i.test(hostEl(A.id).style.outline), hostEl(A.id).style.outline)
})
clickW(B.id, { ctrlKey: true }); clickW(C.id, { metaKey: true }); await nextTick()
check('Ctrl（或 ⌘）+ 点击加选：选中顺序 A B C，第一个是参考对象（橙色外框 + 「基准」标记），其余蓝色；有虚线外接框；selectedId 为空（多选）', () => {
  assert.deepEqual(sel(), ids3); assert.equal(scada.selectedId, null); assert.equal(scada.selected, undefined); assert.equal(scada.referenceId, A.id)
  assert.ok(/f59e0b|245, 158, 11/i.test(hostEl(A.id).style.outline), hostEl(A.id).style.outline); assert.ok(/2563eb|37, 99, 235/i.test(hostEl(B.id).style.outline) && /2563eb|37, 99, 235/i.test(hostEl(C.id).style.outline))
  assert.equal(canvasView.el.querySelector('[data-reference-badge]').dataset.referenceBadge, A.id); assert.ok(canvasView.el.querySelector('[data-reference-badge]').textContent.includes('基准'))
  const f = canvasView.el.querySelector('[data-selection-frame]'); assert.ok(f); assert.equal(f.style.left, '100px'); assert.equal(f.style.top, '100px'); assert.equal(f.style.width, '460px'); assert.equal(f.style.height, '260px')   // A B C 的外接框
})
clickW(B.id, { shiftKey: true }); await nextTick()
check('Shift + 点击已选中的组件（没拖动）：取消它的选中；Shift 再点：又加回末尾', () => { assert.deepEqual(sel(), [A.id, C.id]) })
clickW(B.id, { shiftKey: true }); await nextTick()
assert.deepEqual(sel(), [A.id, C.id, B.id])
const cB = rectOf(C.id)
dragEl(hostEl(C.id), 40, 0, { ctrlKey: true }); await nextTick()
check('Ctrl + 按住已选中的组件拖动：不取消选中，整体移动（取消选中只发生在「按下没拖动就抬起」）', () => { assert.deepEqual(sel(), [A.id, C.id, B.id]); assert.equal(rectOf(C.id).x, cB.x + 40) })
resetAll()
clickW(A.id); await nextTick()
check('多选里不按修饰键点一个（没拖动）：选择收缩为它；点空白处取消选择；带 Ctrl 点空白处保持选择', () => {
  // 点空白处：pointerdown + pointerup 成对发（容器用 pointerup 清掉记录的指针，否则第二个指针会被当成双指捏合）
  const blank = init => { const pointerId = ++pid59; ptr(canvasView.el, 'pointerdown', 1, 1, { pointerId, ...init }); ptr(canvasView.el, 'pointerup', 1, 1, { pointerId, ...init }) }
  assert.deepEqual(sel(), [A.id]); scada.setSelection(ids3); blank({ ctrlKey: true }); assert.deepEqual(sel(), ids3)
  blank({ button: 1 }); assert.deepEqual(sel(), ids3, '中键（平移）点空白处不取消选择'); blank({ button: 2 }); assert.deepEqual(sel(), ids3, '右键也不取消选择')
  blank(); assert.deepEqual(sel(), [])
})
scada.setSelection(ids3); await nextTick()
const before3 = ids3.map(rectOf)
dragEl(hostEl(A.id), 53, 28); await nextTick()
check('多选后拖动其中一个：所有选中的组件整体平移，外接框左上角吸附网格（+50 / +30）；选择不变', () => {
  assert.deepEqual(ids3.map(rectOf), before3.map(r => ({ ...r, x: r.x + 50, y: r.y + 30 }))); assert.deepEqual(sel(), ids3)
})
dragEl(hostEl(B.id), -5000, -5000); await nextTick()
check('整体拖到画布边缘：外接框贴边停住，组件之间的相对位置不变', () => {
  const r = ids3.map(rectOf); assert.equal(Math.min(...r.map(e => e.x)), 0); assert.equal(Math.min(...r.map(e => e.y)), 0)
  assert.equal(r[1].x - r[0].x, before3[1].x - before3[0].x); assert.equal(r[2].y - r[0].y, before3[2].y - before3[0].y)
})
resetAll(); await nextTick()
key('ArrowRight'); key('ArrowDown', { shiftKey: true }); await nextTick()
check('方向键微调作用于所有选中的组件（1px / Shift 按网格）', () => { assert.deepEqual(ids3.map(rectOf), before3.map(r => ({ ...r, x: r.x + 1, y: r.y + 10 }))) })
resetAll()
scada.select(null); key('a', { ctrlKey: true }); await nextTick()
check('Ctrl + A 全选（选中顺序 = 图层顺序）', () => assert.deepEqual(sel(), ids3))
{
  const dummy = document.createElement('button'); document.body.appendChild(dummy); dummy.focus()
  key('Delete'); key('Backspace'); key('ArrowRight'); await nextTick()
  check('焦点在按钮 / 色块上时 Delete、Backspace、方向键都不作用于组件（选完颜色顺手按退格不会把组件删掉）', () => { assert.equal(scada.draft.widgets.length, 3); assert.deepEqual(ids3.map(rectOf), ids3.map(id => INIT[id])) })
  dummy.remove()
}

// ---- 八点缩放：单个组件 ----
scada.select(A.id); await nextTick()
const resetA = () => scada.updateWidgetRect(A.id, { x: 100, y: 100, w: 100, h: 60 })
const H = { nw: [-20, -10], n: [0, -30], ne: [30, -30], e: [40, 0], se: [30, 20], s: [0, 30], sw: [-30, 30], w: [-40, 0] }
const HX = { nw: { x: 80, y: 90, w: 120, h: 70 }, n: { x: 100, y: 70, w: 100, h: 90 }, ne: { x: 100, y: 70, w: 130, h: 90 }, e: { x: 100, y: 100, w: 140, h: 60 }, se: { x: 100, y: 100, w: 130, h: 80 }, s: { x: 100, y: 100, w: 100, h: 90 }, sw: { x: 70, y: 100, w: 130, h: 90 }, w: { x: 60, y: 100, w: 140, h: 60 } }
check('单个组件的 8 个手柄：四角 + 四边中点，光标依次为 nwse / ns / nesw / ew；每个手柄分别拖动，只改变被拖的边（吸附网格 10）', () => {
  assert.deepEqual(['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].map(h => handleEl(h).style.cursor), ['nwse-resize', 'ns-resize', 'nesw-resize', 'ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize', 'ew-resize'])
  for (const h of Object.keys(H)) { resetA(); dragEl(handleEl(h), H[h][0] + (h === 'n' || h === 's' ? 9 : 0), H[h][1] + (h === 'e' || h === 'w' ? 9 : 0)); assert.deepEqual(rectOf(A.id), HX[h], h) }
})
await nextTick()
const minRect = widgetDefinitions().find(d => d.type === 'rect').minSize
check('缩放到最小尺寸停住、拖过对边不翻转；不会越出画布；旋转前后手柄都围着画面上的外框', () => {
  resetA(); dragEl(handleEl('se'), -5000, -5000); assert.deepEqual(rectOf(A.id), { x: 100, y: 100, w: minRect.w, h: minRect.h })
  resetA(); dragEl(handleEl('nw'), 5000, 5000); assert.deepEqual(rectOf(A.id), { x: 200 - minRect.w, y: 160 - minRect.h, w: minRect.w, h: minRect.h })
  resetA(); dragEl(handleEl('se'), 5000, 5000); assert.deepEqual(rectOf(A.id), { x: 100, y: 100, w: 900, h: 500 })
  resetA(); dragEl(handleEl('nw'), -5000, -5000); assert.deepEqual(rectOf(A.id), { x: 0, y: 0, w: 200, h: 160 })
})
resetA(); await nextTick()
check('Shift + 拖角点：等比缩放（100×60 → dx=50 时 150×90）；边中点手柄不受 Shift 影响', () => {
  dragEl(handleEl('se'), 50, 0, { shiftKey: true }); assert.deepEqual(rectOf(A.id), { x: 100, y: 100, w: 150, h: 90 })
  resetA(); dragEl(handleEl('e'), 50, 0, { shiftKey: true }); assert.deepEqual(rectOf(A.id), { x: 100, y: 100, w: 150, h: 60 })
})
resetA(); await nextTick()
check('点按手柄不动（没超过阈值）不改变尺寸；按住空格时手柄不缩放（交给画布平移）', () => {
  const p = ++pid59; ptr(handleEl('se'), 'pointerdown', 0, 0, { pointerId: p }); ptr(handleEl('se'), 'pointermove', 1, 1, { pointerId: p }); ptr(handleEl('se'), 'pointerup', 1, 1, { pointerId: p }); assert.deepEqual(rectOf(A.id), { x: 100, y: 100, w: 100, h: 60 })
  canvasView.spaceDown = true; dragEl(handleEl('se'), 50, 50); canvasView.spaceDown = false; assert.deepEqual(rectOf(A.id), { x: 100, y: 100, w: 100, h: 60 })
})
// ---- 八点缩放：多选整体缩放（按外接框等比例） ----
resetAll(); scada.setSelection([A.id, B.id]); await nextTick()
const uB = rectOf(B.id)   // B (300,200,80,40)：A B 的外接框 x 100 ~ 380、y 100 ~ 240
dragEl(handleEl('e'), 280, 0); await nextTick()
check('多选时手柄围着外接框，拖右边中点 +280（外接框宽 280 → 560）：每个组件按同样的比例缩放 + 平移', () => {
  assert.deepEqual(rectOf(A.id), { x: 100, y: 100, w: 200, h: 60 }); assert.deepEqual(rectOf(B.id), { x: 500, y: 200, w: 160, h: 40 })
})
dragEl(handleEl('nw'), -5000, -5000); await nextTick()
check('多选缩放同样受画布边界限制', () => { const u = unionRect([A.id, B.id].map(rectOf)); assert.equal(u.x, 0); assert.equal(u.y, 0) })
resetAll()
// 最小尺寸：外接框缩到很小时，每个组件都不小于自己的最小尺寸
scada.setSelection([A.id, B.id]); await nextTick()
dragEl(handleEl('se'), -5000, -5000); await nextTick()
check('多选缩到极限：外接框的最小值按各组件最小尺寸折算，没有组件小于最小尺寸', () => { for (const id of [A.id, B.id]) { const r = rectOf(id); assert.ok(r.w >= minRect.w && r.h >= minRect.h, JSON.stringify(r)) } })
resetAll()

// ---- 网格开关 ----
scada.select(A.id); await nextTick()
const gridBtn = () => root.querySelector('[data-tool="grid"]')
check('网格按钮（默认开）：画布显示网格线；关闭后网格线消失、拖动 / 缩放只取整（不再吸附到 10）', () => {
  assert.equal(scada.gridOn, true); assert.equal(canvasView.el.style.backgroundSize, '10px 10px'); assert.ok(gridBtn().classList.contains('bg-blue-100'))
  gridBtn().click(); assert.equal(scada.gridOn, false)
})
await nextTick()
check('网格关闭后：无网格线、拖动精确到 1px、缩放精确到 1px', () => {
  assert.equal(canvasView.el.style.backgroundSize, ''); assert.ok(!gridBtn().classList.contains('bg-blue-100'))
  dragEl(hostEl(A.id), 53, 28); assert.deepEqual(rectOf(A.id), { x: 153, y: 128, w: 100, h: 60 }); dragEl(handleEl('se'), 4, 7); assert.deepEqual(rectOf(A.id), { x: 153, y: 128, w: 104, h: 67 })
})
gridBtn().click(); await nextTick(); resetA()
check('再点一次恢复网格', () => { assert.equal(scada.gridOn, true); assert.equal(canvasView.el.style.backgroundSize, '10px 10px') })
// ---- 排列工具栏（第二行）：对齐 / 画面居中 / 分布 / 等宽高 ----
resetAll(); scada.select(null); await nextTick()
const tool = k => root.querySelector(`[data-tool="${k}"]`)
const caret = k => root.querySelector(`[data-tool-caret="${k}"]`)
const status = () => root.querySelector('[data-tool-status]').textContent
/** 等上一个下拉菜单的关闭动画结束（jsdom 里要几十到一百多毫秒，机器忙时更久），否则 menuItems() 会混进残影 */
const menusGone = async () => { for (let i = 0; i < 60 && menuItems().length; i++) await sleep(50) }
const order59 = () => scada.draft.widgets.map(e => e.id).filter(id => ids3.includes(id))
const TOOLS = ['alignLeft', 'alignRight', 'alignTop', 'alignBottom', 'alignCenterX', 'alignCenterY', 'centerPoint', 'distributeH', 'distributeV', 'sameWidth', 'sameHeight', 'sameSize', 'rotateCw', 'rotateCcw', 'flipH', 'flipV', 'group', 'ungroup', 'lock', 'unlock', 'toFront', 'toBack', 'forward', 'backward', 'grid']
check('排列工具栏是编辑模式顶部的第二行（在第一行工具栏之下、画布之上）：按参考图的顺序排列 25 个按钮（中心点 / 两个分布带下拉小三角）；没选中时除网格外全部灰', () => {
  const bar = root.querySelector('[data-scada-arrange]'); assert.ok(bar); assert.ok(bar.className.includes('h-9')); assert.ok(bar.previousElementSibling.className.includes('h-11')); assert.equal(bar.parentElement, root.firstElementChild)
  assert.deepEqual([...bar.querySelectorAll('[data-tool]')].map(b => b.dataset.tool), TOOLS); assert.deepEqual([...bar.querySelectorAll('[data-tool-caret]')].map(b => b.dataset.toolCaret), ['centerPoint', 'distributeH', 'distributeV'])
  for (const k of TOOLS) assert.equal(tool(k).disabled, k !== 'grid', k)
  for (const k of ['centerPoint', 'distributeH', 'distributeV']) assert.ok(caret(k).disabled, k)
  assert.ok(status().includes('未选中')); assert.equal(bar.querySelectorAll('[data-tool] svg').length, 25, '每个按钮一个图标')
  assert.ok(tool('alignLeft').title.startsWith('左对齐：') && tool('alignLeft').title.includes('参考对象的左边缘')); assert.ok(tool('alignCenterX').title.includes('垂直中心坐标轴')); assert.ok(tool('alignCenterY').title.includes('水平中心坐标轴'))
  assert.ok(tool('centerPoint').title.startsWith('中心点对齐：')); assert.ok(tool('distributeH').title.startsWith('水平等间距：')); assert.ok(tool('rotateCw').title.includes('顺时针')); assert.ok(tool('flipH').title.startsWith('左右翻转'))
})
scada.select(A.id); await nextTick()
const enabledOf = () => TOOLS.filter(k => !tool(k).disabled)
check('选中 1 个：旋转 / 翻转 / 锁定 / 层次 / 网格可用；对齐、等宽高、分布、组合 / 取消组合 / 解锁灰；中心点图标本体灰（要参考对象）但下拉里的三个「相对画面居中」可用', () => {
  assert.deepEqual(enabledOf(), ['rotateCw', 'rotateCcw', 'flipH', 'flipV', 'lock', 'toFront', 'toBack', 'forward', 'backward', 'grid'])
  assert.ok(caret('centerPoint') && !caret('centerPoint').disabled); assert.ok(caret('distributeH').disabled); assert.ok(status().includes('已选 1 个'))
})
scada.setSelection([A.id, B.id]); await nextTick()
check('选中 2 个：对齐 / 等宽高 / 组合 / 中心点可用，分布仍灰（至少 3 个）；状态栏显示数量和参考对象', () => {
  assert.deepEqual(enabledOf(), ['alignLeft', 'alignRight', 'alignTop', 'alignBottom', 'alignCenterX', 'alignCenterY', 'centerPoint', 'sameWidth', 'sameHeight', 'sameSize', 'rotateCw', 'rotateCcw', 'flipH', 'flipV', 'group', 'lock', 'toFront', 'toBack', 'forward', 'backward', 'grid'])
  assert.ok(status().includes('已选 2 个') && status().includes('基准') && status().includes('矩形'), status())
})
scada.setSelection(ids3); await nextTick()
check('选中 3 个：分布也可用', () => { assert.ok(!tool('distributeH').disabled && !tool('distributeV').disabled && !caret('distributeH').disabled); assert.ok(status().includes('已选 3 个')) })
const al = async (k, exp) => { resetAll(); tool(k).click(); await nextTick(); assert.deepEqual([rectOf(B.id), rectOf(C.id)], exp, k); assert.deepEqual(rectOf(A.id), INIT[A.id], k + '：参考对象不动') }
const rb = INIT[B.id], rc = INIT[C.id]
await al('alignLeft', [{ ...rb, x: 100 }, { ...rc, x: 100 }]); await al('alignRight', [{ ...rb, x: 120 }, { ...rc, x: 140 }])
await al('alignTop', [{ ...rb, y: 100 }, { ...rc, y: 100 }]); await al('alignBottom', [{ ...rb, y: 120 }, { ...rc, y: 100 }])
await al('alignCenterX', [{ ...rb, x: 110 }, { ...rc, x: 120 }]); await al('alignCenterY', [{ ...rb, y: 110 }, { ...rc, y: 100 }])
await al('sameWidth', [{ ...rb, w: 100 }, { ...rc, w: 100 }]); await al('sameHeight', [{ ...rb, h: 60 }, { ...rc, h: 60 }]); await al('sameSize', [{ ...rb, w: 100, h: 60 }, { ...rc, w: 100, h: 60 }])
check('点击对齐 / 等宽高按钮：以参考对象（最先选中的 A）为准：左 / 右 / 上 / 下边缘、垂直 / 水平中心轴、等宽 / 等高 / 等宽高；参考对象不动', () => { assert.ok(true) })
resetAll(); await nextTick()
await menusGone(); caret('centerPoint').click(); await nextTick(); await sleep(80)
check('「中心点」下拉：中心点对齐 + 三个相对整个画面居中的功能（水平 / 垂直 / 画面中心），带图标', () => {
  assert.deepEqual(menuItems().map(o => o.textContent.trim()), ['中心点对齐', '水平居中于画面', '垂直居中于画面', '画面中心']); assert.ok(menuItems().every(o => o.querySelector('svg')))
})
menuItem('水平居中于画面').click(); await nextTick(); await sleep(60)
check('选「水平居中于画面」：每个选中对象的中心落在画面水平中线上（x = 画布宽 / 2），纵向位置不变；图标本体记住这一项并可直接重复', () => {
  assert.deepEqual(ids3.map(id => rectOf(id).x + rectOf(id).w / 2), [500, 500, 500]); assert.deepEqual(ids3.map(id => rectOf(id).y), [100, 200, 300])
  assert.ok(tool('centerPoint').title.startsWith('水平居中于画面：')); assert.equal(tool('centerPoint').disabled, false)
})
resetAll(); await nextTick(); tool('centerPoint').click(); await nextTick()
check('再点图标本体 = 重复执行上次选的项', () => assert.deepEqual(ids3.map(id => rectOf(id).x + rectOf(id).w / 2), [500, 500, 500]))
resetAll(); await nextTick(); await menusGone(); caret('centerPoint').click(); await nextTick(); await sleep(80); menuItem('画面中心').click(); await nextTick(); await sleep(60)
check('选「画面中心」：中心都落在画面中心点（500, 300）', () => { assert.deepEqual(ids3.map(id => [rectOf(id).x + rectOf(id).w / 2, rectOf(id).y + rectOf(id).h / 2]), [[500, 300], [500, 300], [500, 300]]) })
resetAll(); await nextTick(); await menusGone(); caret('centerPoint').click(); await nextTick(); await sleep(80); menuItem('垂直居中于画面').click(); await nextTick(); await sleep(60)
check('选「垂直居中于画面」：y 居中、x 不变', () => { assert.deepEqual(ids3.map(id => rectOf(id).y + rectOf(id).h / 2), [300, 300, 300]); assert.deepEqual(ids3.map(id => rectOf(id).x), [100, 300, 500]) })
resetAll(); await nextTick(); await menusGone(); caret('centerPoint').click(); await nextTick(); await sleep(80); menuItem('中心点对齐').click(); await nextTick(); await sleep(60)
check('选「中心点对齐」：其它对象的中心与参考对象 A 的中心（150, 130）重合', () => { assert.deepEqual([B.id, C.id].map(id => [rectOf(id).x + rectOf(id).w / 2, rectOf(id).y + rectOf(id).h / 2]), [[150, 130], [150, 130]]) })
resetAll(); scada.select(B.id); await nextTick(); await menusGone(); caret('centerPoint').click(); await nextTick(); await sleep(80)
check('只选中 1 个时：「中心点对齐」项灰，画面居中项可用', () => { assert.equal(menuItem('中心点对齐').closest('.n-dropdown-option').querySelector('.n-dropdown-option-body--disabled') !== null, true); assert.equal(menuItem('画面中心').classList.contains('n-dropdown-option-body--disabled'), false) })
// 点下拉菜单外面关掉它（naive 的 clickoutside 监听 mousedown / mouseup）
document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); document.body.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })); await sleep(120)
scada.setSelection(ids3); resetAll(); await nextTick()
tool('distributeH').click(); await nextTick()
check('水平分布（默认等间距）：最靠两端的 A、C 不动，B 移到间隙相等的位置（A 右边缘 200 → B 起点 310 → B 右边缘 390 → C 起点 500，间隙都是 110）', () => {
  assert.equal(rectOf(B.id).x, 310); assert.deepEqual([rectOf(A.id).x, rectOf(C.id).x], [100, 500]); assert.equal(rectOf(B.id).y, 200)
})
resetAll(); await menusGone(); caret('distributeH').click(); await nextTick(); await sleep(80)
check('分布下拉：等间距 / 中心等距；选中心等距：B 的中心落在 A、C 中心的正中（340）', () => { assert.deepEqual(menuItems().map(o => o.textContent.trim()), ['水平等间距', '水平中心等距']); menuItem('水平中心等距').click() })
await nextTick(); await sleep(60)
check('中心等距执行后 B.x = 300（中心 340）；图标本体标题换成「水平中心等距」', () => { assert.equal(rectOf(B.id).x, 300); assert.ok(tool('distributeH').title.startsWith('水平中心等距：')) })
resetAll(); tool('distributeV').click(); await nextTick()
check('垂直分布（等间距）：A 下边缘 160 → B 起点 210 → B 下边缘 250 → C 起点 300，间隙 50', () => { assert.equal(rectOf(B.id).y, 210); assert.deepEqual([rectOf(A.id).y, rectOf(C.id).y], [100, 300]) })
resetAll(); await nextTick()
// ---- 旋转 / 翻转 ----
const wrapTransform = id => hostEl(id).style.transform || (hostEl(id).getAttribute('style') || '').match(/transform:\s*([^;]+)/)?.[1] || ''
const geoInputs = () => [...propsCol().querySelectorAll('.n-input-number')].filter(el => !el.querySelector('.n-input-number-suffix, .n-button') && !el.hasAttribute('data-multi-bounds')).map(el => el.querySelector('input').value)
scada.select(B.id); resetAll(); await nextTick()
tool('rotateCw').click(); await nextTick()
check('顺时针旋转 90°：组件 rotate = 90，x / y / w / h 不变（中心不变）；wrapper 带 CSS rotate(90deg)；手柄围着画面上的外框（宽高互换）；位置尺寸输入框显示画面上的 x / y / w / h', () => {
  assert.equal(widgetOf(B.id).rotate, 90); assert.deepEqual(rectOf(B.id), INIT[B.id]); assert.equal(wrapTransform(B.id), 'rotate(90deg)')
  const se = handleEl('se'); assert.ok(Math.abs(parseFloat(se.style.left) + parseFloat(se.style.width) / 2 - 360) < 0.01, se.style.left); assert.ok(Math.abs(parseFloat(se.style.top) + parseFloat(se.style.height) / 2 - 260) < 0.01, se.style.top)   // 视觉外框 (320, 180, 40, 80)
  assert.deepEqual(geoInputs(), ['320', '180', '40', '80']); assert.ok(propsCol().querySelector('[data-scada-rotate]').textContent.includes('90°'))
})
dragEl(handleEl('se'), 30, 20); await nextTick()
check('旋转后拖右下角手柄：改的是画面上的宽高（视觉 40×80 → 70×100），换算回布局外框 100×70（w = 视觉高，h = 视觉宽）；视觉左上角不动', () => {
  assert.deepEqual(visualRect(widgetOf(B.id)), { x: 320, y: 180, w: 70, h: 100 }); assert.deepEqual([widgetOf(B.id).w, widgetOf(B.id).h], [100, 70])
})
scada.updateWidgetRect(B.id, INIT[B.id]); await nextTick()
tool('rotateCw').click(); tool('rotateCw').click(); tool('rotateCw').click(); await nextTick()
check('转满 4 次回到 0°：rotate 字段被移除，没有 transform', () => { assert.ok(!('rotate' in widgetOf(B.id))); assert.equal(wrapTransform(B.id), ''); assert.deepEqual(rectOf(B.id), INIT[B.id]) })
tool('rotateCcw').click(); await nextTick()
check('逆时针旋转 90°：0° → 270°', () => { assert.equal(widgetOf(B.id).rotate, 270); assert.equal(wrapTransform(B.id), 'rotate(270deg)') })
tool('rotateCw').click(); await nextTick()
scada.updateWidgetRect(B.id, { x: 0, y: 0, w: 200, h: 20 }); tool('rotateCw').click(); await nextTick()
check('旋转后视觉外框超出画布时被夹回画布内（200×20 的横条在左上角转 90° → 视觉 20×200，夹紧后完整在画布内）', () => { const v = visualRect(widgetOf(B.id)); assert.deepEqual([v.x >= 0, v.y >= 0, v.x + v.w <= 1000, v.y + v.h <= 600], [true, true, true, true], JSON.stringify(v)) })
scada.updateWidgetRect(B.id, INIT[B.id]); scada.setRotation(B.id, 0); await nextTick()
tool('flipH').click(); await nextTick()
check('左右翻转：flipX = true，wrapper 带 scale(-1, 1)，位置不变；再翻一次恢复（字段被移除）', () => {
  assert.equal(widgetOf(B.id).flipX, true); assert.equal(wrapTransform(B.id), 'scale(-1, 1)'); assert.deepEqual(rectOf(B.id), INIT[B.id])
  tool('flipH').click()
})
await nextTick()
check('翻两次 = 原样', () => { assert.ok(!('flipX' in widgetOf(B.id))); assert.equal(wrapTransform(B.id), '') })
tool('flipV').click(); await nextTick()
assert.equal(widgetOf(B.id).flipY, true); assert.equal(wrapTransform(B.id), 'scale(1, -1)'); tool('flipV').click(); await nextTick()
tool('rotateCw').click(); tool('flipH').click(); await nextTick()
check('先转 90° 再左右翻转：画面镜像在旋转之后 → rotate 变 270、flipX = true；CSS 先翻转再旋转', () => { assert.equal(widgetOf(B.id).rotate, 270); assert.equal(widgetOf(B.id).flipX, true); assert.equal(wrapTransform(B.id), 'rotate(270deg) scale(-1, 1)') })
tool('flipH').click(); tool('rotateCcw').click(); await nextTick()
check('反向操作后回到原样', () => { assert.ok(!('rotate' in widgetOf(B.id)) && !('flipX' in widgetOf(B.id))); assert.equal(wrapTransform(B.id), '') })
resetAll(); scada.setSelection(ids3); await nextTick()
const u0 = unionRect(ids3.map(rectOf)); tool('rotateCw').click(); await nextTick()
check('多选旋转：整个选区绕外接框中心转 90°（像 PPT），每个组件的 rotate 都 +90；外接框宽高互换且中心不变', () => {
  assert.deepEqual(ids3.map(id => widgetOf(id).rotate), [90, 90, 90])
  const u1 = unionRect(ids3.map(id => visualRect(widgetOf(id)))); assert.deepEqual([u1.w, u1.h], [u0.h, u0.w], JSON.stringify(u1)); assert.ok(Math.abs(u1.x + u1.w / 2 - (u0.x + u0.w / 2)) <= 1 && Math.abs(u1.y + u1.h / 2 - (u0.y + u0.h / 2)) <= 1)
})
tool('rotateCcw').click(); await nextTick()
check('再逆时针转回：各组件 rotate 清掉、位置回到原处（±1px 取整误差）', () => { assert.ok(ids3.every(id => !('rotate' in widgetOf(id)))); ids3.forEach(id => { const r = rectOf(id), i = INIT[id]; assert.ok(Math.abs(r.x - i.x) <= 1 && Math.abs(r.y - i.y) <= 1 && r.w === i.w && r.h === i.h, id + JSON.stringify(r)) }) })
resetAll(); tool('flipH').click(); await nextTick()
check('多选左右翻转：中心按外接框中心线镜像（A 在最左 → 到最右），flipX 各自取反', () => {
  assert.deepEqual(ids3.map(id => widgetOf(id).flipX), [true, true, true]); assert.deepEqual(ids3.map(id => rectOf(id).x), [460, 280, 100])   // 外接框 100 ~ 560，中心线 x = 330
})
resetAll(); ids3.forEach(id => { delete widgetOf(id).flipX }); await nextTick()

// ---- 组合 / 取消组合 ----
scada.setSelection([A.id, B.id]); await nextTick()
tool('group').click(); await nextTick()
check('组合：选中的组件得到同一个 groupId（C 没有）；取消组合按钮变可用；图层栏里同组的行左边有同色竖条', () => {
  const g = widgetOf(A.id).groupId; assert.ok(g && widgetOf(B.id).groupId === g && !widgetOf(C.id).groupId); assert.ok(!tool('ungroup').disabled)
  const rows = id => root.querySelector(`[data-layer-id="${id}"]`); assert.ok(rows(A.id).style.borderLeft.includes('3px') && !/transparent/.test(rows(A.id).style.borderLeft), rows(A.id).style.borderLeft); assert.equal(rows(A.id).style.borderLeft, rows(B.id).style.borderLeft); assert.ok(/transparent/.test(rows(C.id).style.borderLeft))
})
scada.select(null); await nextTick(); clickW(B.id); await nextTick()
check('点组合里的任意一个：整个组合一起选中（被点的排第一 = 参考对象）；Alt + 点击只选这一个', () => {
  assert.deepEqual(sel(), [B.id, A.id]); clickW(A.id, { altKey: true }); assert.deepEqual(sel(), [A.id])
})
clickW(B.id); await nextTick()
dragEl(hostEl(B.id), 30, 20); await nextTick()
check('拖动组合里的一个：整个组合一起移动（+30 / +20）', () => { assert.deepEqual([rectOf(A.id), rectOf(B.id)], [{ ...INIT[A.id], x: 130, y: 120 }, { ...INIT[B.id], x: 330, y: 220 }]) })
resetAll(); clickW(C.id, { ctrlKey: true }); await nextTick()
check('Ctrl + 点击别的组件：把它加进选择；Ctrl + 点击已选中的组合成员：整个组合一起取消选中', () => {
  assert.deepEqual(sel(), [B.id, A.id, C.id]); clickW(A.id, { ctrlKey: true }); assert.deepEqual(sel(), [C.id])
})
scada.setSelection([A.id, B.id]); await nextTick(); tool('ungroup').click(); await nextTick()
check('取消组合：groupId 移除，取消组合按钮变灰；再点击一个只选中它自己', () => {
  assert.ok(!widgetOf(A.id).groupId && !widgetOf(B.id).groupId); assert.ok(tool('ungroup').disabled); scada.select(null); clickW(A.id); assert.deepEqual(sel(), [A.id])
})
// 合并：组合里只选了一部分 + 另一个组件再组合 → 旧组合整个并入
scada.setSelection([A.id, B.id]); scada.groupSelection(); scada.setSelection([C.id, A.id]); scada.groupSelection(); await nextTick()
check('再组合时涉及的旧组合整体并入新组合（A B 已成组，再把 C 和 A 组合 → A B C 同组）；只选一个时不能组合', () => {
  const g = widgetOf(A.id).groupId; assert.ok(g && ids3.every(id => widgetOf(id).groupId === g)); assert.deepEqual(sel().sort(), ids3.slice().sort())
  scada.select(A.id); assert.equal(scada.groupSelection(), true, '选中 A 时 groupSelection 会把它所在组合的成员并入（整体仍是一组）'); scada.ungroupSelection()
  scada.select(A.id); assert.equal(scada.groupSelection(), false); assert.ok(!widgetOf(A.id).groupId)
})
resetAll(); await nextTick()

// ---- 锁定 / 解锁 ----
scada.setSelection([A.id, B.id]); await nextTick()
tool('lock').click(); await nextTick()
check('锁定：选中的组件 locked = true；每个锁定组件角上有小锁标记；锁定按钮灰、解锁可用；对齐 / 旋转 / 翻转灰（没有可动的组件）；没有缩放手柄，光标不是 move', () => {
  assert.deepEqual([A.id, B.id].map(id => widgetOf(id).locked), [true, true]); assert.deepEqual([...canvasView.el.querySelectorAll('[data-lock-badge]')].map(e => e.dataset.lockBadge).sort(), [A.id, B.id].sort())
  assert.ok(tool('lock').disabled && !tool('unlock').disabled && tool('alignLeft').disabled && tool('rotateCw').disabled && tool('flipH').disabled && tool('sameSize').disabled)
  assert.equal(canvasView.el.querySelectorAll('[data-handle]').length, 0); assert.equal(hostEl(A.id).style.cursor, 'default')
  assert.ok(root.querySelector(`[data-layer-lock="${A.id}"]`).className.includes('text-gray-800'), '图层栏里挂锁高亮')
})
warns.length = 0
dragEl(hostEl(A.id), 50, 50); await nextTick()
check('拖动被锁定的组件：不动并提示「已锁定」（每次拖动只提示一次）；方向键 / Delete 同样被拦下并提示', () => {
  assert.deepEqual([rectOf(A.id), rectOf(B.id)], [INIT[A.id], INIT[B.id]]); assert.equal(warns.length, 1); assert.ok(warns[0].includes('锁定'), warns[0])
  key('ArrowRight'); assert.deepEqual(rectOf(A.id), INIT[A.id]); assert.equal(warns.length, 2)
  key('Delete'); assert.ok(widgetOf(A.id) && widgetOf(B.id)); assert.equal(warns.length, 3)
})
scada.select(A.id); await nextTick()
check('属性面板：锁定的组件位置 / 尺寸 / 旋转 / 翻转输入框全部禁用，显示锁定提示，删除按钮禁用，锁定开关为开', () => {
  const inputs = [...propsCol().querySelectorAll('.n-input-number')].filter(el => !el.querySelector('.n-input-number-suffix, .n-button')); assert.equal(inputs.length, 4); assert.ok(inputs.every(el => el.classList.contains('n-input-number--disabled') || el.querySelector('input').disabled), 'geometry disabled')
  assert.ok(propsCol().textContent.includes('已锁定：不能移动、缩放或删除')); assert.ok(propsCol().querySelector('[data-scada-rotate]').classList.contains('n-select--disabled') || propsCol().querySelector('[data-scada-rotate] .n-base-selection--disabled'))
  assert.ok([...propsCol().querySelectorAll('button')].find(b => b.textContent.trim() === '删除').disabled); assert.ok(propsCol().querySelector('[data-scada-lock-switch]').classList.contains('n-switch--active'))
})
scada.setLocked([B.id], false); scada.setSelection([A.id, B.id]); await nextTick()
const bBefore = rectOf(B.id)
dragEl(hostEl(B.id), 30, 20); await nextTick()
check('选中里有锁定的：拖动只移动没锁的（A 锁定不动，B +30 / +20）；缩放手柄围着可动的那部分（只有 B）', () => {
  assert.deepEqual(rectOf(A.id), INIT[A.id]); assert.deepEqual(rectOf(B.id), { ...bBefore, x: bBefore.x + 30, y: bBefore.y + 20 })
  const se = handleEl('se'); assert.ok(Math.abs(parseFloat(se.style.left) + parseFloat(se.style.width) / 2 - (rectOf(B.id).x + rectOf(B.id).w)) < 0.01)
  assert.ok(!tool('lock').disabled && !tool('unlock').disabled, '锁定 / 解锁都可用'); assert.ok(!tool('alignLeft').disabled, '参考对象 A 锁定也能当基准，B 是可动的')
})
tool('alignLeft').click(); await nextTick()
const dW = scada.addWidget('rect'); scada.updateWidgetRect(dW.id, { x: 700, y: 400, w: 60, h: 60 }); scada.setSelection([A.id, dW.id]); warns.length = 0; await nextTick()
key('Delete'); await nextTick()
check('对齐以锁定的 A 为参考对象：B 对齐过去、A 不动；Delete 只删没锁的（D 被删，锁定的 A 留下）并提示', () => {
  assert.equal(rectOf(B.id).x, INIT[A.id].x); assert.deepEqual(rectOf(A.id), INIT[A.id]); assert.ok(!widgetOf(dW.id) && widgetOf(A.id)); assert.equal(warns.length, 1)
})
scada.setSelection([A.id]); await nextTick(); tool('unlock').click(); await nextTick()
check('解锁：locked 字段移除，小锁标记消失，手柄回来，又能拖动', () => {
  assert.ok(!('locked' in widgetOf(A.id))); assert.equal(canvasView.el.querySelectorAll('[data-lock-badge]').length, 0); assert.equal(canvasView.el.querySelectorAll('[data-handle]').length, 8)
  dragEl(hostEl(A.id), 20, 0); assert.equal(rectOf(A.id).x, INIT[A.id].x + 20)
})
resetAll(); await nextTick()

// ---- 层次：置顶 / 置底 / 上移一层 / 下移一层 ----
const domOrder = () => [...canvasView.el.querySelectorAll('[data-widget-id]')].map(e => e.dataset.widgetId).filter(id => ids3.includes(id))
check('图层顺序初始为 A B C（数组顺序 = 层级，DOM 顺序一致）', () => { assert.deepEqual(order59(), ids3); assert.deepEqual(domOrder(), ids3) })
scada.select(A.id); await nextTick(); tool('toFront').click(); await nextTick()
check('置于顶层：A 移到最后（最上面），DOM 顺序同步', () => { assert.deepEqual(order59(), [B.id, C.id, A.id]); assert.deepEqual(domOrder(), [B.id, C.id, A.id]) })
tool('toBack').click(); await nextTick()
check('置于底层：A 回到最前（最下面）', () => assert.deepEqual(order59(), ids3))
scada.setSelection([A.id, B.id]); await nextTick(); tool('forward').click(); await nextTick()
check('上移一层（多选）：A B 各越过上面紧邻的一个未选中的（C）→ C A B；彼此顺序不变', () => assert.deepEqual(order59(), [C.id, A.id, B.id]))
tool('backward').click(); await nextTick()
check('下移一层（多选）：回到 A B C；已在最底层的再下移不变', () => { assert.deepEqual(order59(), ids3); scada.setSelection([A.id]); tool('backward').click(); assert.deepEqual(order59(), ids3) })
// ---- 图层栏（左侧）：上下层关系 ----
resetAll(); scada.select(null); await nextTick()
const layers = () => root.querySelector('[data-scada-layers]')
const layerRows = () => [...root.querySelectorAll('[data-layer-id]')]
const layerIds = () => layerRows().map(e => e.dataset.layerId).filter(id => ids3.includes(id))
const rowOf = id => root.querySelector(`[data-layer-id="${id}"]`)
const clickRow = (id, init = {}) => rowOf(id).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ...init }))
const layerAct = k => layers().querySelector(`[data-layer-action="${k}"]`)
check('图层栏在左栏里、组件库之下：标题「图层」+ 数量 + 四个层次按钮（没选中时灰）；列表从上到下 = 画布上层到下层（C B A）；每行有拖动手柄 / 图标 / 名称 / 眼睛 / 挂锁', () => {
  const left = paletteCol(); assert.ok(left.className.includes('flex-col')); assert.ok(left.children[0].querySelector('[data-palette-item]')); assert.ok(left.children[1].contains(layers()))
  assert.ok(layers().textContent.includes('图层') && layers().querySelector('.n-scrollbar')); assert.equal(layerRows().length, 3); assert.deepEqual(layerIds(), [C.id, B.id, A.id])
  assert.deepEqual([...layers().querySelectorAll('[data-layer-action]')].map(b => b.dataset.layerAction), ['front', 'forward', 'backward', 'back']); assert.ok([...layers().querySelectorAll('[data-layer-action]')].every(b => b.disabled))
  for (const row of layerRows()) { assert.ok(row.querySelector('[data-layer-grip]') && row.querySelector('[data-layer-hide]') && row.querySelector('[data-layer-lock]') && row.querySelector('svg')); assert.ok(row.textContent.includes('矩形')) }
  assert.ok(layers().querySelector('.n-scrollbar') && !layers().querySelector('.overflow-y-auto'), '悬浮滚动条 NScrollbar')
})
clickRow(B.id); await nextTick()
check('点击图层行选中该组件（与画布选中同步）；选中的行高亮；层次按钮可用', () => {
  assert.deepEqual(sel(), [B.id]); assert.equal(rowOf(B.id).dataset.layerSelected, '1'); assert.ok(!rowOf(A.id).dataset.layerSelected); assert.ok(layerAct('front') && !layerAct('front').disabled)
  assert.match(hostEl(B.id).style.outline, /2px solid/)
})
clickRow(A.id, { ctrlKey: true }); await nextTick()
check('Ctrl + 点击行加减多选；多选时已选中的行出现「参考对象」旗标（第一个选中的高亮）', () => {
  assert.deepEqual(sel(), [B.id, A.id]); assert.deepEqual([...layers().querySelectorAll('[data-layer-ref]')].map(b => b.dataset.layerRef), [A.id, B.id].sort((x, y) => layerIds().indexOf(x) - layerIds().indexOf(y)))
  assert.ok(layers().querySelector(`[data-layer-ref="${B.id}"]`).classList.contains('text-amber-500')); assert.ok(!layers().querySelector(`[data-layer-ref="${A.id}"]`).classList.contains('text-amber-500'))
})
clickRow(C.id, { shiftKey: true }); await nextTick()
check('Shift + 点击行：选中从上次点击的行（A）到这一行（C）的一段；起点排第一 = 参考对象', () => assert.deepEqual(sel(), [A.id, C.id, B.id]))
layers().querySelector(`[data-layer-ref="${C.id}"]`).click(); await nextTick()
check('点行上的旗标：把它设为参考对象（移到选择的最前）；画布上「基准」标记和橙色外框跟着换；点旗标不会改变选择内容', () => {
  assert.deepEqual(sel(), [C.id, A.id, B.id]); assert.equal(scada.referenceId, C.id); assert.equal(canvasView.el.querySelector('[data-reference-badge]').dataset.referenceBadge, C.id); assert.ok(/f59e0b|245, 158, 11/i.test(hostEl(C.id).style.outline))
  assert.ok(status().includes('基准') && status().includes('矩形'))
})
clickW(A.id); await nextTick()
check('画布上选中 → 图层栏同步（只有 A 那一行高亮）', () => { assert.deepEqual(layerRows().filter(r => r.dataset.layerSelected).map(r => r.dataset.layerId), [A.id]) })
scada.select(B.id); await nextTick()
layerAct('front').click(); await nextTick()
check('标题栏「置顶」：B 移到最上；图层栏列表与画布 DOM 顺序同步', () => { assert.deepEqual(order59(), [A.id, C.id, B.id]); assert.deepEqual(layerIds(), [B.id, C.id, A.id]); assert.deepEqual(domOrder(), [A.id, C.id, B.id]) })
layerAct('back').click(); await nextTick(); layerAct('forward').click(); await nextTick()
check('「置底」→「上移」：B 到最下，再上移一层', () => assert.deepEqual(order59(), [A.id, B.id, C.id]))
layerAct('backward').click(); await nextTick(); scada.sendToBack(A.id); await nextTick()
check('「下移」一层；排回 A B C', () => assert.deepEqual(order59(), ids3))
// 拖动排序：手柄按下 → 移动 → 松手；jsdom 没有布局，给每行一个屏幕位置（自上而下每行 30px）
const mockRows = () => layerRows().forEach((el, i) => { el.getBoundingClientRect = () => ({ left: 0, top: i * 30, width: 200, height: 30, right: 200, bottom: i * 30 + 30 }) })
const gripOf = id => rowOf(id).querySelector('[data-layer-grip]')
const dragRow = (id, y0, y1, hold) => { const pointerId = ++pid59; ptr(gripOf(id), 'pointerdown', 10, y0, { pointerId }); ptr(gripOf(id), 'pointermove', 10, y1, { pointerId }); if (hold) hold(); ptr(gripOf(id), 'pointerup', 10, y1, { pointerId }) }
mockRows(); scada.select(null); await nextTick()
dragRow(A.id, 75, 5); await nextTick()
check('图层栏拖动排序：拖最下面的 A（手柄）到最上面一行 C 的上半部分 → A 成为最上层；按下手柄会先选中该行；松手后插入指示线消失', () => {
  assert.deepEqual(order59(), [B.id, C.id, A.id]); assert.deepEqual(layerIds(), [A.id, C.id, B.id]); assert.deepEqual(sel(), [A.id]); assert.equal(root.querySelectorAll('[data-layer-drop]').length, 0)
})
mockRows()
{
  const pointerId = ++pid59; ptr(gripOf(B.id), 'pointerdown', 10, 75, { pointerId }); ptr(gripOf(B.id), 'pointermove', 10, 20, { pointerId }); await nextTick()
  check('拖动过程中：指针在最上面一行（A）的下半部分 → 那一行底部出现蓝色「下方」插入指示线', () => { const d = root.querySelectorAll('[data-layer-drop]'); assert.equal(d.length, 1); assert.equal(d[0].dataset.layerDrop, 'below'); assert.equal(d[0].parentElement.dataset.layerId, A.id) })
  ptr(gripOf(B.id), 'pointerup', 10, 20, { pointerId }); await nextTick()
}
check('松手：B 放到 A 的下方（自上而下 A B C）', () => assert.deepEqual(layerIds(), [A.id, B.id, C.id]))
mockRows(); scada.setSelection([A.id, B.id]); await nextTick()
dragRow(B.id, 45, 85); await nextTick()
check('选中多个时拖其中一行：整批一起移动、保持彼此顺序——A B 一起放到最下面一行 C 的下方', () => { assert.deepEqual(order59(), [B.id, A.id, C.id]); assert.deepEqual(sel(), [A.id, B.id]) })
mockRows(); dragRow(A.id, 15, 15); await nextTick()
check('没拖动（位移不足阈值）不改变顺序', () => assert.deepEqual(order59(), [B.id, A.id, C.id]))
scada.sendToBack(A.id); scada.select(null); await nextTick()
const hideBtn = id => root.querySelector(`[data-layer-hide="${id}"]`), lockBtn = id => root.querySelector(`[data-layer-lock="${id}"]`)
hideBtn(B.id).click(); await nextTick()
check('眼睛：隐藏组件（hidden = true）——编辑模式下半透明仍可见 / 可选，行变淡、图标换成划线眼睛；点眼睛不会选中该行；再点恢复（字段移除）', () => {
  assert.equal(widgetOf(B.id).hidden, true); assert.equal(hostEl(B.id).style.opacity, '0.35'); assert.notEqual(hostEl(B.id).style.display, 'none'); assert.ok(rowOf(B.id).className.includes('opacity-60')); assert.deepEqual(sel(), [])
  assert.ok(hideBtn(B.id).title.includes('显示')); hideBtn(B.id).click()
})
await nextTick()
check('再点眼睛恢复显示', () => { assert.ok(!('hidden' in widgetOf(B.id))); assert.equal(hostEl(B.id).style.opacity, '') })
lockBtn(C.id).click(); await nextTick()
check('挂锁：锁定 / 解锁该组件（与工具栏的锁定同一个字段），画布上出现小锁标记', () => {
  assert.equal(widgetOf(C.id).locked, true); assert.ok(canvasView.el.querySelector(`[data-lock-badge="${C.id}"]`)); assert.ok(lockBtn(C.id).title.includes('解锁')); lockBtn(C.id).click()
})
await nextTick()
check('再点解锁', () => { assert.ok(!('locked' in widgetOf(C.id))); assert.ok(!canvasView.el.querySelector('[data-lock-badge]')) })
const layersToggle = () => root.querySelector('[data-scada-layers-toggle]')
check('第一行工具栏有「图层」开关：关掉后图层栏消失（组件库仍在，占满左栏）；再开回来', () => {
  assert.ok(layersToggle().textContent.includes('图层')); layersToggle().click()
})
await nextTick()
check('图层栏关闭后左栏只剩组件库', () => { assert.ok(!layers()); assert.ok(paletteCol().querySelector('[data-palette-item]')); layersToggle().click() })
await nextTick()
const paletteToggle = () => [...root.querySelectorAll('button')].find(b => b.textContent.trim() === '组件库')
paletteToggle().click(); await nextTick()
check('再打开；把组件库关掉则图层栏占满整个左栏', () => {
  assert.ok(layers()); assert.ok(!paletteCol().querySelector('[data-palette-item]')); assert.ok(layers().parentElement.className.includes('flex-1')); assert.ok(paletteCol().className.includes('w-[200px]')); paletteToggle().click()
})
await nextTick()
main.isLandscape = false; await nextTick()
check('竖屏：图层栏在画布下方一行的左侧（组件库条带在上、属性面板在右，分两栏）', () => {
  const body = bodyRow(); const first = body.children[0], last = body.children[body.children.length - 1]
  assert.ok(first.className.includes('h-[92px]') && first.querySelector('[data-palette-item]')); assert.ok(last.className.includes('flex-row')); assert.ok(last.children[0].contains(layers()) && last.children[0].className.includes('w-[30%]')); assert.ok(last.children[1].querySelector('.columns-2'))
  assert.ok(!paletteCol().querySelector('[data-scada-layers]') || paletteCol() === first)
})
main.isLandscape = true; await nextTick()
check('回到横屏：图层栏回到左栏', () => { assert.ok(bodyRow().className.includes('flex-row')); assert.ok(bodyRow().children[0].contains(layers())) })

// ---- 全屏 ----
const scadaRoot = root.firstElementChild
const fsBtn = () => root.querySelector('[data-scada-fullscreen]')
const setSize = (w, h) => { Object.defineProperty(scadaRoot, 'clientWidth', { value: w, configurable: true }); Object.defineProperty(scadaRoot, 'clientHeight', { value: h, configurable: true }) }
const fireResize = () => globalThis.__resizeCallbacks.forEach(cb => { try { cb([]) } catch { /* 已卸载的 observer */ } })
const fitBtn = () => [...propsCol().querySelectorAll('button')].find(b => b.textContent.includes('适配当前屏幕'))
scada.select(null); setSize(800, 600); fireResize(); await nextTick()
check('全屏按钮在第一行工具栏（取消 / 保存之前）：默认「全屏」，根元素是页面里的 w-full h-full；「适配当前屏幕」按整页尺寸 800×600', () => {
  assert.ok(fsBtn()); assert.equal(fsBtn().textContent.trim(), '全屏'); assert.ok(fsBtn().title === '全屏'); assert.ok(fsBtn().parentElement.className.includes('h-11')); assert.ok(scadaRoot.className.includes('w-full') && scadaRoot.className.includes('h-full') && !scadaRoot.className.includes('fixed'))
  assert.ok(fitBtn().textContent.includes('(800×600)'), fitBtn().textContent); assert.equal(scada.fullscreen, false)
})
fsBtn().click(); await nextTick()
check('点全屏：编辑器根元素变成 fixed inset-0 铺满整个窗口（z-index 1990，低于 naive 弹窗层的 2000，这样下拉 / 弹窗 / 颜色浮层仍在它上面）；按钮变「退出全屏」；工具栏 / 图层 / 画布都还在', () => {
  assert.equal(scada.fullscreen, true); assert.ok(scadaRoot.classList.contains('fixed') && scadaRoot.classList.contains('inset-0')); assert.ok(scadaRoot.className.includes('z-[1990]')); assert.equal(scadaRoot.dataset.fullscreen, '1')
  assert.equal(fsBtn().textContent.trim(), '退出全屏'); assert.ok(fsBtn().className.includes('bg-blue-100')); assert.ok(root.querySelector('[data-scada-arrange]') && layers() && canvasView.el)
})
setSize(1920, 1080); fireResize(); await nextTick()
check('全屏期间不重新量「整页尺寸」：「适配当前屏幕」仍然是没全屏时的 800×600（否则会把画布适配成整个窗口）', () => assert.ok(fitBtn().textContent.includes('(800×600)'), fitBtn().textContent))
fsBtn().click(); await nextTick(); await nextTick()
check('再点一次退出全屏：恢复页面里的布局，并重新量整页尺寸（现在 1920×1080）', () => {
  assert.equal(scada.fullscreen, false); assert.ok(!scadaRoot.classList.contains('fixed')); assert.equal(fsBtn().textContent.trim(), '全屏'); assert.ok(fitBtn().textContent.includes('(1920×1080)'), fitBtn().textContent)
})
delete scadaRoot.clientWidth; delete scadaRoot.clientHeight
fsBtn().click(); await nextTick(); window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await nextTick()
check('Esc 退出全屏（没有弹窗时；关闭后留下的空 .n-modal-container 壳、正在播放关闭动画的下拉菜单都不算弹窗）', () => assert.equal(scada.fullscreen, false))
fsBtn().click(); await nextTick(); root.querySelector('[data-scada-help]').click(); await nextTick(); await sleep(60)
window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await nextTick()
check('操作说明弹窗打开时 Esc 先留给弹窗：不退出全屏；弹窗关掉后再按 Esc 才退出', () => {
  assert.equal(scada.fullscreen, true); assert.ok(document.body.querySelector('.n-modal-container [data-scada-help-content]'))
})
document.body.querySelector('.n-modal-container .n-card-header__close').click(); await nextTick(); await sleep(80)
window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await nextTick()
check('弹窗关闭后 Esc 退出全屏', () => assert.equal(scada.fullscreen, false))
// 浏览器 Fullscreen API（jsdom 没有，这里桩一个）：请求整页（documentElement）真全屏；用户在真全屏里按 Esc → fullscreenchange → 编辑器同步退出
let fsEl = null, fsReq = 0, fsExit = 0
Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => fsEl })
document.documentElement.requestFullscreen = () => { fsReq++; fsEl = document.documentElement; document.dispatchEvent(new window.Event('fullscreenchange')); return Promise.resolve() }
document.exitFullscreen = () => { fsExit++; fsEl = null; document.dispatchEvent(new window.Event('fullscreenchange')); return Promise.resolve() }
fsBtn().click(); await sleep(30)
check('有 Fullscreen API 时：对整页（documentElement）请求真全屏，编辑器同时进入全屏', () => { assert.equal(fsReq, 1); assert.equal(scada.fullscreen, true); assert.equal(fsEl, document.documentElement) })
fsBtn().click(); await sleep(30)
check('再点退出：调用 document.exitFullscreen，编辑器退出全屏', () => { assert.equal(fsExit, 1); assert.equal(scada.fullscreen, false); assert.equal(fsEl, null) })
fsBtn().click(); await sleep(30); fsEl = null; document.dispatchEvent(new window.Event('fullscreenchange')); await nextTick()
check('用户在真全屏里按 Esc（浏览器退出全屏并触发 fullscreenchange）：编辑器同步退出，不会卡在全屏样式', () => { assert.equal(fsReq, 2); assert.equal(scada.fullscreen, false); assert.ok(!scadaRoot.classList.contains('fixed')) })
document.documentElement.requestFullscreen = () => Promise.reject(new Error('denied'))
fsBtn().click(); await sleep(30)
check('真全屏被浏览器 / 宿主拒绝：保留「编辑器盖住整个窗口」的效果，不报错', () => assert.equal(scada.fullscreen, true))
fsBtn().click(); await nextTick()
document.documentElement.requestFullscreen = () => { fsReq++; fsEl = document.documentElement; document.dispatchEvent(new window.Event('fullscreenchange')); return Promise.resolve() }

// ---- 属性面板：多选面板 / 单个组件的锁定 · 旋转 · 翻转 ----
resetAll(); scada.setSelection(ids3); await nextTick()
const multiInfo = () => propsCol().querySelector('[data-multi-info]')
const boundsVals = () => [...propsCol().querySelectorAll('[data-multi-bounds]')].map(el => el.querySelector('input').value)
const typeInto = async (input, v) => { input.value = String(v); input.dispatchEvent(new InputEvent('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); input.dispatchEvent(new Event('blur')); await nextTick() }
check('多选面板：「多选」标题、已选中 3 个组件、参考对象名称、选区位置 / 尺寸 = 外接框 (100, 100, 460, 260)、操作按钮 置顶 / 置底 / 复制 / 删除；不显示单个组件的数据绑定 / 属性', () => {
  assert.ok(multiInfo()); assert.ok(multiInfo().textContent.includes('已选中 3 个组件') && multiInfo().textContent.includes('参考对象：矩形'), multiInfo().textContent)
  assert.ok(propsCol().textContent.includes('多选') && propsCol().textContent.includes('选区位置 / 尺寸') && propsCol().textContent.includes('Ctrl 或 Shift'))
  assert.deepEqual(boundsVals(), ['100', '100', '460', '260'])
  const names = [...propsCol().querySelectorAll('button')].map(b => b.textContent.trim()); for (const n of ['置顶', '置底', '复制', '删除']) assert.ok(names.includes(n), n)
  assert.ok(!propsCol().textContent.includes('数据绑定') && !propsCol().textContent.includes('数据处理函数'))
})
await typeInto(propsCol().querySelector('[data-multi-bounds="w"] input'), 690)
check('多选面板改选区宽度 460 → 690（×1.5）：每个组件按同样的比例缩放 + 平移（A 150 宽 / B 移到 400 宽 120 / C 移到 700 宽 90）', () => {
  assert.deepEqual([A.id, B.id, C.id].map(rectOf), [{ x: 100, y: 100, w: 150, h: 60 }, { x: 400, y: 200, w: 120, h: 40 }, { x: 700, y: 300, w: 90, h: 60 }])
})
resetAll(); await nextTick()
await typeInto(propsCol().querySelector('[data-multi-bounds="x"] input'), 200)
check('改选区 x = 200：整体右移 100，相对位置不变', () => assert.deepEqual(ids3.map(id => rectOf(id).x), [200, 400, 600]))
resetAll(); scada.setLocked([C.id], true); await nextTick()
check('选中里有锁定的：多选面板提示「其中 1 个已锁定」，选区外接框只算没锁的（A B：100, 100, 280, 140）', () => { assert.ok(multiInfo().textContent.includes('其中 1 个已锁定')); assert.deepEqual(boundsVals(), ['100', '100', '280', '140']) })
scada.setLocked([C.id], false); scada.setSelection(ids3); scada.groupSelection(); const g0 = widgetOf(A.id).groupId; await nextTick()
const btnByText = t => [...propsCol().querySelectorAll('button')].find(b => b.textContent.trim() === t)
propsCol().querySelector('[data-multi-duplicate]').click(); await nextTick()
const copies = sel()
check('多选面板「复制」：三个副本整体偏移两格（+20 / +20）、追加到最上层并成为新的选中（参考对象的副本仍排第一）；副本自成一个新组合，不和原组合混在一起', () => {
  assert.equal(scada.draft.widgets.length, 6); assert.equal(copies.length, 3); assert.ok(copies.every(id => !ids3.includes(id)))
  assert.deepEqual(copies.map(rectOf), ids3.map(id => ({ ...INIT[id], x: INIT[id].x + 20, y: INIT[id].y + 20 })))
  const gc = widgetOf(copies[0]).groupId; assert.ok(gc && gc !== g0 && copies.every(id => widgetOf(id).groupId === gc)); assert.ok(ids3.every(id => widgetOf(id).groupId === g0))
  assert.deepEqual(scada.draft.widgets.slice(-3).map(e => e.id), copies); assert.equal(scada.referenceId, copies[0])
})
scada.removeWidgets(copies); await nextTick()
check('删掉副本：回到三个组件，选中里已经不存在的 id 被清掉', () => { assert.equal(scada.draft.widgets.length, 3); assert.deepEqual(sel(), []) })
scada.setSelection(ids3); scada.ungroupSelection(); await nextTick()
const dW2 = scada.addWidget('rect'); scada.setSelection([A.id, dW2.id]); scada.groupSelection(); assert.ok(widgetOf(A.id).groupId)
scada.removeWidgets([dW2.id]); await nextTick()
check('组合里的成员被删到只剩一个：落单的 groupId 自动清掉（取消组合按钮不会误亮）', () => { assert.ok(!('groupId' in widgetOf(A.id))); scada.select(A.id); assert.ok(tool('ungroup').disabled) })
scada.select(A.id); await nextTick()
check('单个组件面板：有「锁定」开关、旋转下拉（0°）、左右 / 上下翻转开关；位置 / 尺寸四个输入框', () => {
  assert.ok(propsCol().querySelector('[data-scada-lock-switch]') && propsCol().querySelector('[data-scada-rotate]') && propsCol().querySelector('[data-scada-flip-x]') && propsCol().querySelector('[data-scada-flip-y]'))
  assert.ok(propsCol().querySelector('[data-scada-rotate]').textContent.includes('0°')); assert.deepEqual(geoInputs(), ['100', '100', '100', '60'])
  assert.ok(propsCol().textContent.includes('旋转') && propsCol().textContent.includes('翻转') && propsCol().textContent.includes('锁定'))
})
propsCol().querySelector('[data-scada-lock-switch]').click(); await nextTick()
check('锁定开关：打开 → 组件 locked、位置输入框禁用；关闭 → 解除', () => {
  assert.equal(widgetOf(A.id).locked, true); assert.ok(propsCol().querySelector('[data-scada-lock-switch]').classList.contains('n-switch--active')); propsCol().querySelector('[data-scada-lock-switch]').click()
})
await nextTick()
propsCol().querySelector('[data-scada-flip-x]').click(); propsCol().querySelector('[data-scada-flip-y]').click(); await nextTick()
check('翻转开关：flipX / flipY 直接写进组件（位置不变），wrapper 带 scale(-1, -1)；关掉后移除', () => {
  assert.ok(!('locked' in widgetOf(A.id))); assert.equal(widgetOf(A.id).flipX, true); assert.equal(widgetOf(A.id).flipY, true); assert.equal(wrapTransform(A.id), 'scale(-1, -1)'); assert.deepEqual(rectOf(A.id), INIT[A.id])
  propsCol().querySelector('[data-scada-flip-x]').click(); propsCol().querySelector('[data-scada-flip-y]').click()
})
await nextTick()
scada.setRotation(A.id, 90); await nextTick()
check('旋转 90° 后面板显示画面上的外框：x / y / w / h = 120 / 80 / 60 / 100（布局外框 100×60 → 视觉 60×100）；下拉显示 90°', () => {
  assert.ok(!('flipX' in widgetOf(A.id)) && !('flipY' in widgetOf(A.id))); assert.deepEqual(geoInputs(), ['120', '80', '60', '100']); assert.ok(propsCol().querySelector('[data-scada-rotate]').textContent.includes('90°'))
})
await typeInto([...propsCol().querySelectorAll('.n-input-number')].filter(el => !el.querySelector('.n-input-number-suffix, .n-button'))[2].querySelector('input'), 80)
check('在面板里改画面宽度 60 → 80：按视觉外框换算回布局外框（100 × 80），视觉左上角 (120, 80) 不动', () => {
  assert.deepEqual(visualRect(widgetOf(A.id)), { x: 120, y: 80, w: 80, h: 100 }); assert.deepEqual([widgetOf(A.id).w, widgetOf(A.id).h], [100, 80])
})
scada.setRotation(A.id, 0); resetAll(); await nextTick()

// ---- 保存：字段落地、展示模式隐藏 / 旋转 / 翻转；再次编辑读回 ----
scada.setRotation(A.id, 90); scada.setFlip(A.id, 'x', true); scada.setLocked([B.id], true); scada.setHidden([C.id], true); scada.setSelection([A.id, B.id]); scada.groupSelection(); await nextTick()
fsBtn().click(); await sleep(30); assert.equal(scada.fullscreen, true)
await scada.save(); await nextTick(); await sleep(30)
check('保存退出编辑：自动退出全屏（含真全屏），展示模式没有顶栏 / 排列工具栏 / 图层栏', () => {
  assert.equal(scada.fullscreen, false); assert.equal(fsEl, null); assert.ok(!scadaRoot.classList.contains('fixed')); assert.ok(!root.querySelector('[data-scada-arrange]') && !root.querySelector('[data-scada-fullscreen]') && !layers())
})
check('保存到 localStorage 带上 rotate / flipX / locked / hidden / groupId（没用到的字段不写）；展示模式：隐藏的组件 display:none，旋转 / 翻转照常显示，没有手柄 / 小锁 / 选中框', () => {
  const saved = JSON.parse(localStorage.getItem('scadaLayout')); const by = id => saved.widgets.find(w => w.id === id)
  assert.equal(by(A.id).rotate, 90); assert.equal(by(A.id).flipX, true); assert.equal(by(B.id).locked, true); assert.equal(by(C.id).hidden, true); assert.ok(by(A.id).groupId && by(A.id).groupId === by(B.id).groupId)
  assert.ok(!('groupId' in by(C.id)) && !('rotate' in by(B.id)) && !('flipY' in by(A.id)) && !('hidden' in by(A.id)) && !('locked' in by(A.id)))
  assert.equal(hostEl(C.id).style.display, 'none'); assert.notEqual(hostEl(A.id).style.display, 'none'); assert.equal(wrapTransform(A.id), 'rotate(90deg) scale(-1, 1)')
  assert.equal(canvasView.el.querySelectorAll('[data-handle], [data-lock-badge], [data-selection-frame]').length, 0); assert.ok(!/outline: [^;]*solid/.test(hostEl(A.id).getAttribute('style') || ''), '展示模式没有选中 / 虚线外框')
})
scada.startEdit(); await nextTick()
check('再次编辑：字段原样读回——隐藏的组件半透明（0.35）但仍可见 / 可选，锁定的带小锁标记，A B 仍是一个组合；图层栏里隐藏 / 锁定的图标高亮', () => {
  assert.equal(hostEl(C.id).style.opacity, '0.35'); assert.notEqual(hostEl(C.id).style.display, 'none'); assert.ok(canvasView.el.querySelector(`[data-lock-badge="${B.id}"]`))
  assert.equal(widgetOf(A.id).rotate, 90); assert.equal(widgetOf(A.id).groupId, widgetOf(B.id).groupId); clickW(A.id); assert.deepEqual(sel(), [A.id, B.id])
  assert.ok(root.querySelector(`[data-layer-hide="${C.id}"]`).className.includes('text-red-400')); assert.ok(root.querySelector(`[data-layer-lock="${B.id}"]`).className.includes('text-gray-800'))
})
scada.cancelEdit(); await nextTick()
delete document.documentElement.requestFullscreen; delete document.exitFullscreen; delete document.fullscreenElement
// <<< 任务 59 画布交互测试结束（后面的用例追加在这一行之前的块里）
}

app.unmount()
check('卸载后恢复虚拟键盘', () => assert.equal(main.globalKeyBoardBlocked, false))
const before = calls.realtime; await sleep(400)
check('卸载后停止轮询', () => assert.equal(calls.realtime, before))
console.log(`scada smoke tests passed (${step} steps, realtime calls = ${calls.realtime})`)
fs.rmSync(outdir, { recursive: true, force: true })
setTimeout(() => { console.error('process did not exit: dangling timers'); process.exit(1) }, 3000).unref()
