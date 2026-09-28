/**
 * 数据组态页（src/views/Home/scada）的无浏览器冒烟测试：esbuild 打包 + jsdom 挂载，不依赖 WebView2 宿主。
 *
 * 运行（仓库根目录）：
 *   npm i --no-save esbuild@0.21 jsdom@22      # 或 pnpm add -D，二者都不需要进入 package.json
 *   node scripts/scada-smoke/run.mjs
 *
 * 覆盖：组件 / 数据源注册表、产品分类数据源加载去重与按需轮询、编辑模式、组件库点按添加、
 *       拖动 / 缩放的网格吸附与最小尺寸、各示例组件渲染、Delete 删除、保存到 localStorage、取消丢弃草稿、卸载后停止轮询。
 * 说明：@/store/config 与 @/utils/callm 被 stubs/ 里的桩替换（真实模块会把 echarts 等整套依赖拉进来）。
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
import { getDataSource, dataSourceList } from '@/views/Home/scada/dataSource'
import { widgetDefinitions } from '@/views/Home/scada/registry'
export { createApp, nextTick, createPinia, i18n, Scada, useScadaStore, useConfigStore, getDataSource, dataSourceList, widgetDefinitions }
`)
const stubs = {
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
      b.onResolve({ filter: /^@\/(store\/config|utils\/callm)$/ }, args => ({ path: stubs[args.path] }))
    }
  }]
})

// ---------------- jsdom 环境 ----------------
const dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>', { pretendToBeVisual: true, url: 'http://localhost/' })
const { window } = dom
for (const k of ['window', 'document', 'navigator', 'HTMLElement', 'Element', 'Node', 'SVGElement', 'getComputedStyle', 'localStorage', 'Event', 'MouseEvent', 'KeyboardEvent', 'requestAnimationFrame', 'cancelAnimationFrame', 'CSS', 'MutationObserver', 'Text', 'Comment', 'DocumentFragment', 'HTMLInputElement']) {
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
const { createApp, nextTick, createPinia, i18n, Scada, useScadaStore, useConfigStore, getDataSource, dataSourceList, widgetDefinitions } = m
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
scada.select(null); window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' })); await nextTick()
check('未选中时 Delete 无效果', () => assert.equal(scada.draft.widgets.length, 5))
scada.select(w.id); scada.sendToBack(w.id)
window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true })); await nextTick()
check('置底 + Delete 删除选中', () => { assert.ok(!scada.draft.widgets.find(e => e.id === w.id)); assert.equal(scada.draft.widgets.length, 4) })
await scada.save()
check('保存到 localStorage', () => {
  assert.ok(!scada.editing); const saved = JSON.parse(localStorage.getItem('scadaLayout'))
  assert.equal(saved.widgets.length, 4); assert.equal(saved.version, 1); assert.ok(root.textContent.includes('数据组态'))
})
scada.startEdit(); scada.addWidget('textLabel'); scada.cancelEdit()
check('取消编辑丢弃草稿', () => assert.equal(scada.layout.widgets.length, 4))
app.unmount()
const before = calls.realtime; await sleep(400)
check('卸载后停止轮询', () => assert.equal(calls.realtime, before))
console.log(`scada smoke tests passed (${step} steps, realtime calls = ${calls.realtime})`)
fs.rmSync(outdir, { recursive: true, force: true })
setTimeout(() => { console.error('process did not exit: dangling timers'); process.exit(1) }, 3000).unref()
