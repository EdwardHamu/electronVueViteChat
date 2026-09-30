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
 *       任务 43：颜色字段自动收起（打开另一个颜色字段 / 焦点或点按落到别的输入框时收起；面板内操作与面板外空白处不收起）。
 * 说明：@/store、@/store/config 与 @/utils/callm 被 stubs/ 里的桩替换（真实模块会把 echarts 等整套依赖拉进来）。
 */
import { build } from 'esbuild'
import { JSDOM } from 'jsdom'
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
globalThis.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} }
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

const SHAPES = ['line', 'polyline', 'arc', 'rect', 'circle', 'ellipse', 'sector', 'segment', 'polygon', 'textLabel', 'image', 'pipe']
const CONTROLS = ['numericIO', 'stringIO', 'datetime', 'button', 'bitButton', 'wordButton', 'bitStatus', 'wordStatus', 'textList', 'textSwitch', 'radio', 'checkbox', 'table']
const DATA = ['valueCard', 'gauge', 'sparkline', 'statusLamp']
const VISUAL = ['barGauge', 'slider', 'progressBar', 'ringProgress', 'pie', 'meter']
check('注册表：四类共 35 个组件，全部带图标与分类', () => {
  assert.deepEqual(widgetDefinitions().map(d => d.type), [...SHAPES, ...CONTROLS, ...DATA, ...VISUAL])
  widgetDefinitions().forEach(d => { assert.equal(typeof d.icon, 'function', d.type); assert.ok(['shape', 'control', 'data', 'visual'].includes(d.category), d.type) })
  assert.ok(VISUAL.every(t => widgetDefinitions().find(d => d.type === t).category === 'visual'))
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
const handle = [...root.querySelectorAll('div')].find(d => d.style.cursor === 'nwse-resize')
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
check('属性面板颜色字段改为行内色块按钮（不再用 NColorPicker 弹层）', () => { assert.equal(fields().length, 2); assert.ok(!root.querySelector('.n-color-picker')); assert.ok(!root.querySelector('[data-color-panel]')) })
const bgField = fields()[0]
bgField.querySelector('[data-color-trigger]').click(); await nextTick()
const panel = () => bgField.querySelector('[data-color-panel]')
check('点开后第一界面是预设颜色表（默认 24 色），此时没有调色盘', () => {
  assert.ok(panel()); assert.equal(panel().querySelectorAll('[data-color]').length, DEFAULT_COLOR_PRESETS.length)
  assert.ok(!panel().querySelector('[data-color-sv]')); assert.ok(panel().textContent.includes('预设颜色')); assert.ok(!panel().textContent.includes('false'))
})
panel().querySelector('[data-color="#ff8d3f"]').click(); await nextTick()
check('点预设色块 → 写入组件属性并高亮选中', () => {
  assert.equal(wA().props.bg, '#ff8d3f'); assert.ok(panel().querySelector('[data-color="#ff8d3f"]').textContent.includes('✓'))
  assert.ok(bgField.querySelector('[data-color-trigger]').textContent.includes('#ff8d3f'))
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
check('在 SV 面板上点按 → 按当前色相取纯色写回', () => assert.equal(wA().props.bg, hsvToHex({ ...hexToHsv('#ff8d3f'), s: 1, v: 1 })))
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
check('“清除”恢复为组件默认色（空值）', () => { assert.equal(wA().props.bg, ''); assert.ok(bgField.querySelector('[data-color-trigger]').textContent.includes('默认')) })
bgField.querySelector('[data-color-trigger]').click(); await nextTick()
check('再次点击色块按钮收起面板', () => assert.ok(!panel()))
// ---- 自动收起：打开另一个颜色字段 / 焦点或点按落到别的输入框；面板内操作、面板外空白处不收起 ----
const fgField = fields()[1]
const trig = f => f.querySelector('[data-color-trigger]')
const panelOf = f => f.querySelector('[data-color-panel]')
trig(bgField).click(); await nextTick(); trig(fgField).click(); await nextTick()
check('打开另一个颜色字段：先前展开的自动收起，同一时间只有一个面板', () => { assert.ok(!panelOf(bgField)); assert.ok(panelOf(fgField)); assert.equal(root.querySelectorAll('[data-color-panel]').length, 1) })
const otherInput = [...root.querySelectorAll('input')].find(i => !i.closest('[data-color-field]'))
assert.ok(otherInput, '属性面板里应有别的输入框')
otherInput.focus(); await nextTick()
check('焦点移到别的输入框（focusin）：颜色面板收起', () => { assert.equal(document.activeElement, otherInput); assert.ok(!panelOf(fgField)) })
otherInput.blur(); await nextTick()
trig(fgField).click(); await nextTick(); assert.ok(panelOf(fgField))
otherInput.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 31, button: 0 })); await nextTick()
check('在别的输入框上按下（触摸等拿不到焦点的场景）：颜色面板收起', () => assert.ok(!panelOf(fgField)))
trig(fgField).click(); await nextTick(); panelOf(fgField).querySelector('[data-color-switch]').click(); await nextTick()
const ownHex = panelOf(fgField).querySelector('input'); ownHex.focus(); await nextTick()
ownHex.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 32, button: 0 })); await nextTick()
root.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 33, button: 0 })); await nextTick()
check('面板内自己的 hex 输入框获得焦点 / 点按，以及点面板外的空白处：都不收起', () => { assert.ok(panelOf(fgField)); assert.ok(panelOf(fgField).querySelector('[data-color-sv]')) })
ownHex.blur(); await nextTick()
trig(bgField).dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 34, button: 0 })); trig(bgField).click(); await nextTick()
check('按下另一个颜色字段的按钮：旧面板先收起、新面板打开且回到预设表', () => { assert.ok(!panelOf(fgField)); assert.ok(panelOf(bgField)); assert.ok(panelOf(bgField).querySelector('[data-color-presets]')) })
trig(bgField).click(); await nextTick()
check('收起后没有任何颜色面板残留', () => assert.equal(root.querySelectorAll('[data-color-panel]').length, 0))

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
check('组件库：按“基础图素 / 控制与显示 / 数据看板 / 数据可视化”分组的小图标网格，共 35 项；容器为 NScrollbar 悬浮轨道；顶栏无说明文字', () => {
  assert.deepEqual(inPalette('[data-palette-group]').map(g => g.dataset.paletteGroup), ['shape', 'control', 'data', 'visual'])
  assert.equal(inPalette('[data-palette-item]').length, 35); assert.equal(inPalette('[data-palette-item] svg').length, 35)
  assert.equal(inPalette('[data-palette-group="shape"] [data-palette-item]').length, 12)
  assert.equal(inPalette('[data-palette-group="control"] [data-palette-item]').length, 13)
  assert.deepEqual(inPalette('[data-palette-group="visual"] [data-palette-item]').map(e => e.dataset.paletteItem), VISUAL)
  const vh = paletteCol().querySelector('[data-palette-category="visual"]'); assert.ok(vh.textContent.includes('数据可视化') && vh.textContent.includes('6'), vh.textContent)
  assert.ok(inPalette('[data-palette-item="slider"]')[0].textContent.includes('滑块'))
  const hdr = paletteCol().querySelector('[data-palette-category="shape"]'); assert.ok(hdr.textContent.includes('基础图素') && hdr.textContent.includes('12'))
  assert.ok(paletteCol().querySelector('.n-scrollbar')); assert.ok(!paletteCol().querySelector('.overflow-y-auto'))
  assert.ok(propsCol().querySelector('.n-scrollbar'), 'property panel should use NScrollbar too')
  assert.ok(paletteCol().querySelector('[data-palette-view="grid"]').className.includes('bg-blue-100'))
  assert.ok(paletteCol().querySelector('[data-palette-item="line"]').className.includes('flex-col'))
  assert.ok(!root.textContent.includes('滚轮缩放') && !root.textContent.includes('放到画布')); assert.ok(root.querySelector('[data-scada-help]'))
})
paletteCol().querySelector('[data-palette-category="shape"]').click(); await nextTick()
check('点击分类标题折叠该组', () => { assert.equal(inPalette('[data-palette-group="shape"] [data-palette-item]').length, 0); assert.equal(inPalette('[data-palette-item]').length, 23) })
paletteCol().querySelector('[data-palette-category="shape"]').click(); await nextTick()
check('再次点击展开', () => assert.equal(inPalette('[data-palette-item]').length, 35))
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
check('顶栏“?”按钮打开操作说明弹窗：5 节（组件库 / 画布 / 组件 / 展示模式 / 控制组件），含缩放 / 平移 / 微调说明', () => {
  const c = document.body.querySelector('.n-modal-container [data-scada-help-content]'); assert.ok(c)
  assert.equal(c.children.length, 5); assert.ok(c.querySelectorAll('li').length >= 10)
  for (const kw of ['滚轮', '空格', '方向键', '右键', '内部变量']) assert.ok(c.textContent.includes(kw), kw)
  assert.ok(document.body.querySelector('.n-modal-container').textContent.includes('操作说明'))
})
document.body.querySelector('.n-modal-container .n-card-header__close').click(); await nextTick(); await sleep(60)
check('关闭操作说明弹窗', () => assert.ok(!document.body.querySelector('[data-scada-help-content]')))

const keepIds = new Set(scada.draft.widgets.map(e => e.id))
const NEW_TYPES = [...SHAPES, ...CONTROLS, ...VISUAL].filter(t => t !== 'textLabel')
for (const type of NEW_TYPES) scada.addWidget(type)
await nextTick()
const byType = t => scada.draft.widgets.find(e => e.type === t && !keepIds.has(e.id))
const hostOf = t => canvasView.el.querySelector(`[data-widget-id="${byType(t).id}"]`)
check('新增 30 个组件全部渲染：图形为 SVG，控制 / 可视化组件各有标记，图片显示占位提示，日期时间域走时', () => {
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

app.unmount()
check('卸载后恢复虚拟键盘', () => assert.equal(main.globalKeyBoardBlocked, false))
const before = calls.realtime; await sleep(400)
check('卸载后停止轮询', () => assert.equal(calls.realtime, before))
console.log(`scada smoke tests passed (${step} steps, realtime calls = ${calls.realtime})`)
fs.rmSync(outdir, { recursive: true, force: true })
setTimeout(() => { console.error('process did not exit: dangling timers'); process.exit(1) }, 3000).unref()
