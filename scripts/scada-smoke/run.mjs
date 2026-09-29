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
 *       工具箱式组件库（分类折叠 / 网格列表切换 / NScrollbar）、操作说明弹窗、全部图素 / 控制组件渲染、内部变量数据源写入（位按钮 / IO 域步进 / 复选框 / 字按钮 / 只读提示）、表格、多行文本与图片字段。
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
for (const k of ['window', 'document', 'navigator', 'HTMLElement', 'Element', 'Node', 'SVGElement', 'getComputedStyle', 'localStorage', 'Event', 'InputEvent', 'MouseEvent', 'KeyboardEvent', 'WheelEvent', 'requestAnimationFrame', 'cancelAnimationFrame', 'CSS', 'MutationObserver', 'Text', 'Comment', 'DocumentFragment', 'HTMLInputElement']) {
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
const calls = { realtime: 0, groups: 0 }
const json = Data => Promise.resolve(JSON.stringify({ Code: 0, Data }))
window.chrome = { webview: { hostObjects: { JsBridge: {
  GetDeviceGroups: gid => { calls.groups++; return json(gid === 'g1' ? [{ GId: 'dev1', DeviceName: '测径仪A' }, { GId: 'dev2', DeviceName: '测温仪B' }] : []) },
  GetShowDataGroups: did => json(did === 'dev1' ? [{ GId: 'd_od', DataName: '外径', Unit: 'mm', Precision: 3 }] : [{ GId: 'd_temp', DataName: '温度', Unit: '℃', Precision: 1 }]),
  GetChartDataGroups: did => json(did === 'dev1' ? [{ GId: 'd_od', DataName: '外径', Unit: 'mm', Precision: 3 }, { GId: 'd_ov', DataName: '椭圆度', Unit: 'mm', Precision: 4 }] : []),
  GetRealtimeData: gid => { calls.realtime++; return json({ GId: gid, Value: gid === 'd_od' ? 1.523 : 88.4, StringValue: '', DataType: 0, Intime: '', Index: 0 }) }
} } } }
globalThis.chrome = window.chrome

const m = await import(pathToFileURL(bundle).href)
const { createApp, nextTick, createPinia, i18n, Scada, useScadaStore, useConfigStore, useMain, getDataSource, dataSourceList, widgetDefinitions } = m
const { canvasView, zoomCanvas, resetCanvasView, compileTransform, runTransform, mergeTransformResult, transformErrors, transformDebug } = m
const { normalizeHex, hexToHsv, hsvToHex, isLightColor, useColorPresets, DEFAULT_COLOR_PRESETS, COLOR_PRESETS_KEY } = m
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
check('注册表：三类共 29 个组件，全部带图标与分类', () => {
  assert.deepEqual(widgetDefinitions().map(d => d.type), [...SHAPES, ...CONTROLS, ...DATA])
  widgetDefinitions().forEach(d => { assert.equal(typeof d.icon, 'function', d.type); assert.ok(['shape', 'control', 'data'].includes(d.category), d.type) })
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
check('组件库：按“基础图素 / 控制与显示 / 数据看板”分组的小图标网格，共 29 项；容器为 NScrollbar 悬浮轨道；顶栏无说明文字', () => {
  assert.deepEqual(inPalette('[data-palette-group]').map(g => g.dataset.paletteGroup), ['shape', 'control', 'data'])
  assert.equal(inPalette('[data-palette-item]').length, 29); assert.equal(inPalette('[data-palette-item] svg').length, 29)
  assert.equal(inPalette('[data-palette-group="shape"] [data-palette-item]').length, 12)
  assert.equal(inPalette('[data-palette-group="control"] [data-palette-item]').length, 13)
  const hdr = paletteCol().querySelector('[data-palette-category="shape"]'); assert.ok(hdr.textContent.includes('基础图素') && hdr.textContent.includes('12'))
  assert.ok(paletteCol().querySelector('.n-scrollbar')); assert.ok(!paletteCol().querySelector('.overflow-y-auto'))
  assert.ok(propsCol().querySelector('.n-scrollbar'), 'property panel should use NScrollbar too')
  assert.ok(paletteCol().querySelector('[data-palette-view="grid"]').className.includes('bg-blue-100'))
  assert.ok(paletteCol().querySelector('[data-palette-item="line"]').className.includes('flex-col'))
  assert.ok(!root.textContent.includes('滚轮缩放') && !root.textContent.includes('放到画布')); assert.ok(root.querySelector('[data-scada-help]'))
})
paletteCol().querySelector('[data-palette-category="shape"]').click(); await nextTick()
check('点击分类标题折叠该组', () => { assert.equal(inPalette('[data-palette-group="shape"] [data-palette-item]').length, 0); assert.equal(inPalette('[data-palette-item]').length, 17) })
paletteCol().querySelector('[data-palette-category="shape"]').click(); await nextTick()
check('再次点击展开', () => assert.equal(inPalette('[data-palette-item]').length, 29))
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
const NEW_TYPES = [...SHAPES, ...CONTROLS].filter(t => t !== 'textLabel')
for (const type of NEW_TYPES) scada.addWidget(type)
await nextTick()
const byType = t => scada.draft.widgets.find(e => e.type === t && !keepIds.has(e.id))
const hostOf = t => canvasView.el.querySelector(`[data-widget-id="${byType(t).id}"]`)
check('新增 24 个组件全部渲染：图形为 SVG，控制组件各有标记，图片显示占位提示，日期时间域走时', () => {
  assert.equal(scada.draft.widgets.length, 4 + NEW_TYPES.length); assert.ok(!root.textContent.includes('未知组件')); assert.ok(!root.textContent.includes('false'), 'literal false in: ' + [...canvasView.el.querySelectorAll('[data-widget-type]')].filter(h => h.textContent.includes('false')).map(h => h.dataset.widgetType + '=' + h.innerHTML.slice(0, 300)).join(' | '))
  for (const t of ['line', 'polyline', 'arc', 'rect', 'circle', 'ellipse', 'sector', 'segment', 'polygon', 'pipe']) assert.ok(hostOf(t).querySelector('svg'), t)
  assert.ok(hostOf('polygon').querySelector('svg polygon')); assert.ok(hostOf('circle').querySelector('svg circle, svg ellipse')); assert.ok(hostOf('rect').querySelector('svg rect'))
  assert.equal(canvasView.el.querySelectorAll('[data-io-field]').length, 2)
  for (const sel of ['[data-scada-button]', '[data-scada-bit-button]', '[data-scada-word-button]', '[data-scada-text-list]', '[data-scada-text-switch]', '[data-scada-radio]', '[data-scada-checkbox]', '[data-scada-table]']) assert.ok(canvasView.el.querySelector(sel), sel)
  assert.ok(hostOf('image').textContent.includes('在属性面板设置图片'))
  assert.match(hostOf('datetime').textContent, /\d{2}:\d{2}:\d{2}/)
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
await nextTick()
hostOf('bitButton').querySelector('[data-scada-bit-button]').click(); await nextTick()
check('编辑模式下点击位按钮不写值', () => assert.equal(local.read('var1').value, null))
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
// 恢复到 4 个组件的版面，继续后面的用例
scada.startEdit(); scada.draft.widgets = scada.draft.widgets.filter(e => keepIds.has(e.id)); await scada.save(); await nextTick()
check('清理：恢复 4 个组件并退出编辑', () => { assert.equal(scada.layout.widgets.length, 4); assert.ok(!scada.editing) })
await contextMenu(100, 100)
const beforeRefresh = calls.groups
menuItem('刷新数据源').click(); await nextTick(); await sleep(50)
check('展示模式右键菜单“刷新数据源”重新拉取数据项目录并关闭菜单', () => { assert.equal(calls.groups, beforeRefresh + 1); assert.equal(menuItems().length, 0) })
app.unmount()
check('卸载后恢复虚拟键盘', () => assert.equal(main.globalKeyBoardBlocked, false))
const before = calls.realtime; await sleep(400)
check('卸载后停止轮询', () => assert.equal(calls.realtime, before))
console.log(`scada smoke tests passed (${step} steps, realtime calls = ${calls.realtime})`)
fs.rmSync(outdir, { recursive: true, force: true })
setTimeout(() => { console.error('process did not exit: dangling timers'); process.exit(1) }, 3000).unref()
