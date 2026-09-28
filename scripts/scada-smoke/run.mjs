/**
 * 数据组态页（src/views/Home/scada）的无浏览器冒烟测试：esbuild 打包 + jsdom 挂载，不依赖 WebView2 宿主。
 *
 * 运行（仓库根目录）：
 *   npm i --no-save esbuild@0.21 jsdom@22      # 或 pnpm add -D，二者都不需要进入 package.json
 *   node scripts/scada-smoke/run.mjs
 *
 * 覆盖：组件 / 数据源注册表、产品分类数据源加载去重与按需轮询、编辑模式、组件库点按添加、
 *       拖动 / 缩放的网格吸附与最小尺寸、各示例组件渲染、数据处理函数（数字 / 对象 / 文本 / 出错 / 三种写法 / 持久状态）、
 *       画布视图缩放（滚轮 / 键盘 / 双指）与长按平移、竖屏上下布局、Delete 删除、保存到 localStorage、取消丢弃草稿、卸载后停止轮询。
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
import { canvasView, zoomCanvas, resetCanvasView, LONG_PRESS_MS } from '@/views/Home/scada/Canvas'
import { compileTransform, runTransform, mergeTransformResult, transformErrors, transformDebug } from '@/views/Home/scada/transform'
export { createApp, nextTick, createPinia, i18n, Scada, useScadaStore, useConfigStore, useMain, getDataSource, dataSourceList, widgetDefinitions }
export { canvasView, zoomCanvas, resetCanvasView, LONG_PRESS_MS, compileTransform, runTransform, mergeTransformResult, transformErrors, transformDebug }
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
for (const k of ['window', 'document', 'navigator', 'HTMLElement', 'Element', 'Node', 'SVGElement', 'getComputedStyle', 'localStorage', 'Event', 'MouseEvent', 'KeyboardEvent', 'WheelEvent', 'requestAnimationFrame', 'cancelAnimationFrame', 'CSS', 'MutationObserver', 'Text', 'Comment', 'DocumentFragment', 'HTMLInputElement']) {
  if (window[k] !== undefined) globalThis[k] = window[k]
}
globalThis.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} }
globalThis.PointerEvent = window.PointerEvent || class PointerEvent extends window.MouseEvent {
  constructor(type, init = {}) { super(type, init); this.pointerId = init.pointerId ?? 1; this.pointerType = init.pointerType ?? 'mouse' }
}
window.PointerEvent = globalThis.PointerEvent
globalThis.fetch = async () => ({ ok: false }) // i18n 初始化的语言包请求直接失败，随后手动注入 zh-CN
const origError = console.error
console.error = (...args) => { if (!String(args[0]).includes('Failed to load locale')) origError(...args) }

// ---------------- 模拟 C# 宿主桥 ----------------
const calls = { realtime: 0 }
const json = Data => Promise.resolve(JSON.stringify({ Code: 0, Data }))
window.chrome = { webview: { hostObjects: { JsBridge: {
  GetDeviceGroups: gid => json(gid === 'g1' ? [{ GId: 'dev1', DeviceName: '测径仪A' }, { GId: 'dev2', DeviceName: '测温仪B' }] : []),
  GetShowDataGroups: did => json(did === 'dev1' ? [{ GId: 'd_od', DataName: '外径', Unit: 'mm', Precision: 3 }] : [{ GId: 'd_temp', DataName: '温度', Unit: '℃', Precision: 1 }]),
  GetChartDataGroups: did => json(did === 'dev1' ? [{ GId: 'd_od', DataName: '外径', Unit: 'mm', Precision: 3 }, { GId: 'd_ov', DataName: '椭圆度', Unit: 'mm', Precision: 4 }] : []),
  GetRealtimeData: gid => { calls.realtime++; return json({ GId: gid, Value: gid === 'd_od' ? 1.523 : 88.4, StringValue: '', DataType: 0, Intime: '', Index: 0 }) }
} } } }
globalThis.chrome = window.chrome

const m = await import(pathToFileURL(bundle).href)
const { createApp, nextTick, createPinia, i18n, Scada, useScadaStore, useConfigStore, useMain, getDataSource, dataSourceList, widgetDefinitions } = m
const { canvasView, zoomCanvas, resetCanvasView, LONG_PRESS_MS, compileTransform, runTransform, mergeTransformResult, transformErrors, transformDebug } = m
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

check('注册表', () => {
  assert.deepEqual(widgetDefinitions().map(d => d.type), ['valueCard', 'gauge', 'sparkline', 'statusLamp', 'textLabel'])
  assert.deepEqual(dataSourceList().map(p => p.id), ['product', 'sim'])
})
check('展示模式空状态', () => { assert.ok(root.textContent.includes('尚未配置组态组件')); assert.ok(root.textContent.includes('编辑')) })
const product = getDataSource('product')
check('产品分类数据源按 CurrentGroupId 加载并去重', () => {
  assert.deepEqual(product.options().map(o => `${o.group}/${o.label}`), ['测径仪A/外径', '测径仪A/椭圆度', '测温仪B/温度'])
})
const scada = useScadaStore(pinia)
;[...root.querySelectorAll('button')].find(b => b.textContent.trim() === '编辑').click(); await nextTick()
check('进入编辑模式', () => { assert.ok(scada.editing); assert.ok(root.textContent.includes('组件库') && root.textContent.includes('数值卡片') && root.textContent.includes('画布')) })
const item = [...root.querySelectorAll('div')].find(d => d.textContent.trim().startsWith('数值卡片') && d.style.touchAction === 'none')
item.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 10, clientY: 10, pointerId: 7 }))
item.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: 11, clientY: 11, pointerId: 7 }))
await nextTick()
check('组件库点按添加', () => { assert.equal(scada.draft.widgets.length, 1); assert.equal(scada.draft.widgets[0].type, 'valueCard'); assert.equal(scada.selectedId, scada.draft.widgets[0].id) })
const w = scada.draft.widgets[0]
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
scada.select(w.id); scada.updateWidget(w.id, { transform: 'return value * 1000' }); await nextTick()
check('组件处理函数：数字 → 新值（属性面板显示输入 / 输出）', () => {
  assert.ok(root.textContent.includes('输出: 1523.000'), root.textContent.slice(-600))
  assert.ok(root.textContent.includes('1523.000'), root.textContent.slice(0, 200)); assert.equal(transformErrors[w.id], undefined)
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
check('组件处理函数：出错时保持原值并反馈错误', () => {
  assert.ok(root.textContent.includes('1.523')); assert.match(transformErrors[w.id], /ReferenceError/); assert.ok(root.textContent.includes('函数错误'))
})
scada.updateWidget(w.id, { transform: '' }); await nextTick()
check('清空处理函数后错误消失', () => assert.equal(transformErrors[w.id], undefined))
const label = scada.draft.widgets.find(e => e.type === 'textLabel')
scada.setBinding(label.id, { source: 'product', key: 'd_od' }); scada.updateWidget(label.id, { transform: "return '外径 ' + value.toFixed(2) + ' mm'" }); await sleep(250); await nextTick()
check('文本标签绑定数据 + 处理函数拼动态文字', () => assert.ok(root.textContent.includes('外径 1.52 mm'), root.textContent.slice(0, 300)))

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
container.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 200, clientY: 200, pointerId: 9, button: 0 }))
container.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 203, clientY: 202, pointerId: 9 }))
await sleep(LONG_PRESS_MS + 80)
container.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 263, clientY: 232, pointerId: 9 })); await nextTick()
check('长按空白处后拖动 → 平移', () => { assert.equal(canvasView.panning, true); assert.equal(canvasView.panX, 60); assert.equal(canvasView.panY, 30) })
container.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: 263, clientY: 232, pointerId: 9 })); await nextTick()
check('松开后结束平移并保留位置', () => { assert.equal(canvasView.panning, false); assert.equal(canvasView.panX, 60) })
container.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 0, clientY: 0, pointerId: 10, button: 0 }))
container.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 100, clientY: 100, pointerId: 10 }))
await sleep(LONG_PRESS_MS + 80)
container.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 150, clientY: 150, pointerId: 10 }))
container.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: 150, clientY: 150, pointerId: 10 })); await nextTick()
check('未长按就拖动 → 不平移', () => { assert.equal(canvasView.panX, 60); assert.equal(canvasView.panY, 30) })
container.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 0, clientY: 0, pointerId: 11, button: 1 }))
container.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: -10, clientY: -20, pointerId: 11 }))
container.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: -10, clientY: -20, pointerId: 11 })); await nextTick()
check('鼠标中键立即平移', () => { assert.equal(canvasView.panX, 50); assert.equal(canvasView.panY, 10) })
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
const main = useMain(pinia)
main.isLandscape = false; await nextTick()
check('竖屏：组件库在上（横向条带）、属性面板在下（两栏）', () => {
  const body = canvasView.el.parentElement.parentElement.parentElement
  assert.ok(body.className.includes('flex-col'), body.className)
  const first = body.children[0], last = body.children[body.children.length - 1]
  assert.ok(first.textContent.includes('组件库') && first.className.includes('h-[92px]'))
  assert.ok(last.textContent.includes('属性') && last.querySelector('.columns-2'))
  const pitem = [...root.querySelectorAll('div')].find(d => d.textContent.trim().startsWith('数值卡片') && d.style.touchAction === 'pan-x')
  assert.ok(pitem, 'palette item should allow pan-x in portrait')
})
main.isLandscape = true; await nextTick()
check('横屏：恢复左右三栏', () => {
  const body = canvasView.el.parentElement.parentElement.parentElement
  assert.ok(body.className.includes('flex-row')); assert.ok(body.children[0].className.includes('w-[190px]')); assert.ok(!root.querySelector('.columns-2'))
})

scada.select(null); window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' })); await nextTick()
check('未选中时 Delete 无效果', () => assert.equal(scada.draft.widgets.length, 5))
scada.select(w.id); scada.sendToBack(w.id)
window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true })); await nextTick()
check('置底 + Delete 删除选中', () => { assert.ok(!scada.draft.widgets.find(e => e.id === w.id)); assert.equal(scada.draft.widgets.length, 4) })
await scada.save()
check('保存到 localStorage（含处理函数）；退出编辑视图复位', () => {
  assert.ok(!scada.editing); const saved = JSON.parse(localStorage.getItem('scadaLayout'))
  assert.equal(saved.widgets.length, 4); assert.equal(saved.version, 1); assert.ok(root.textContent.includes('数据组态'))
  assert.equal(saved.widgets.find(e => e.type === 'textLabel').transform, "return '外径 ' + value.toFixed(2) + ' mm'")
  assert.equal(canvasView.zoom, 1); assert.equal(canvasView.panX, 0)
  container.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true })); assert.equal(canvasView.zoom, 1)
})
scada.startEdit(); scada.addWidget('textLabel'); scada.cancelEdit()
check('取消编辑丢弃草稿', () => assert.equal(scada.layout.widgets.length, 4))
app.unmount()
const before = calls.realtime; await sleep(400)
check('卸载后停止轮询', () => assert.equal(calls.realtime, before))
console.log(`scada smoke tests passed (${step} steps, realtime calls = ${calls.realtime})`)
fs.rmSync(outdir, { recursive: true, force: true })
setTimeout(() => { console.error('process did not exit: dangling timers'); process.exit(1) }, 3000).unref()
