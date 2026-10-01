/**
 * 虚拟键盘冒烟测试（任务 62）：jsdom 里挂载真实的 GlobalKeyBoard + @/store + utils.listenAllInputFocus + utils/virtualKeyboard
 * + MyFormWrap（numInput），只把 @/store/config 换成桩（stubs/config.ts）。
 *
 * 运行（仓库根目录）：NODE_PATH=<装了 esbuild@0.21 与 jsdom@22 的 node_modules> node scripts/keyboard-smoke/run.mjs
 *
 * 说明：
 *  - .tsx 用 Babel + @vue/babel-plugin-jsx 转换（与 vite 的 @vitejs/plugin-vue-jsx 一致；esbuild 自带的 JSX 不认 v-show / v-slots / 自定义指令）；
 *  - jsdom 不支持 onpointerdown 这类事件处理属性（simple-keyboard 用它绑定按键），这里补一个 shim；
 *  - 本测试不替代 WebView2 实机验证（docs/webview2-testing.md）。
 */
import { build } from 'esbuild'
import { JSDOM } from 'jsdom'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '..', '..')
const outdir = fs.mkdtempSync(path.join(os.tmpdir(), 'keyboard-smoke-'))
// Babel 与 JSX 插件从 @vitejs/plugin-vue-jsx 的依赖里找（pnpm 不把它们提升到顶层）
const reqJsx = createRequire(createRequire(path.join(repo, 'package.json')).resolve('@vitejs/plugin-vue-jsx'))
const babel = reqJsx('@babel/core')
const vueJsx = reqJsx.resolve('@vue/babel-plugin-jsx')
const tsPlugin = reqJsx.resolve('@babel/plugin-transform-typescript')

const harness = path.join(outdir, 'harness.ts')
fs.writeFileSync(harness, `
import { createApp, nextTick, h, reactive, defineComponent } from 'vue'
import { createPinia } from 'pinia'
import { NInput, NInputNumber, NDialogProvider } from 'naive-ui'
import DeviceGroupAddForm from '@/views/Home/config/devConfigNew/dataGroup/DeviceGroup/DeviceGroupAddForm'
import GlobalKeyBoard from '@/views/Home/GlobalKeyBoard'
import { useMain } from '@/store'
import { useConfigStore } from '@/store/config'
import { listenAllInputFocus, isKeyboardSuppressed } from '@/utils/utils'
import { useFormulaStore } from '@/store/formula'
import * as vk from '@/utils/virtualKeyboard'
import { MyFormWrap } from '@/components/MyFormWrap/MyFormWrap'
import { noKeyBoardInputClass } from '@/views/Home/config/sysConfig/enum'
import i18n from '@/i18n'
import { useDialog } from 'naive-ui'
import { installDialogNoAutoFocus } from '@/utils/dialogDefaults'
import FormulaParam from '@/views/Home/config/formulaConfigNew/FormulaParam'
export { NDialogProvider, DeviceGroupAddForm, i18n, useDialog, installDialogNoAutoFocus, FormulaParam }
export { createApp, nextTick, h, reactive, defineComponent, createPinia, NInput, NInputNumber, GlobalKeyBoard, useMain, useConfigStore, listenAllInputFocus, isKeyboardSuppressed, useFormulaStore, vk, MyFormWrap, noKeyBoardInputClass }
`)
const bundle = path.join(outdir, 'bundle.mjs')
await build({
  entryPoints: [harness],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  outfile: bundle,
  tsconfig: path.join(repo, 'tsconfig.json'),
  absWorkingDir: repo,
  nodePaths: [path.join(repo, 'node_modules'), ...(process.env.NODE_PATH || '').split(path.delimiter).filter(Boolean)],
  define: { 'import.meta.env.BASE_URL': '"/"', 'import.meta.env.DEV': 'false', 'import.meta.env.MODE': '"test"', 'process.env.NODE_ENV': '"development"', __VUE_OPTIONS_API__: 'true', __VUE_PROD_DEVTOOLS__: 'false', __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false' },
  loader: { '.png': 'dataurl', '.jpg': 'dataurl', '.svg': 'dataurl', '.woff': 'dataurl', '.woff2': 'dataurl', '.ttf': 'dataurl' },
  logLevel: 'error',
  plugins: [{
    name: 'keyboard-smoke',
    setup(b) {
      b.onResolve({ filter: /^@\/store\/config$/ }, () => ({ path: path.join(here, 'stubs', 'config.ts') }))
      // 宿主调用（callBrige）交给测试脚本模拟（utils.ts 里是相对路径 ./callm）
      b.onResolve({ filter: /^(@\/utils\/callm|\.\/callm)$/ }, args => (args.path.startsWith('@') || /[\\/]src[\\/]utils$/.test(args.resolveDir)) ? { path: path.join(here, 'stubs', 'callm.ts') } : undefined)
      b.onLoad({ filter: /\.(css|scss|less)$/ }, () => ({ contents: '', loader: 'js' }))
      b.onLoad({ filter: /[\\/]src[\\/].*\.tsx$/ }, async args => {
        const src = await fs.promises.readFile(args.path, 'utf8')
        const out = await babel.transformAsync(src, { filename: args.path, babelrc: false, configFile: false, sourceMaps: false, plugins: [[tsPlugin, { isTSX: true, allExtensions: true }], vueJsx] })
        return { contents: out.code, loader: 'js', resolveDir: path.dirname(args.path) }
      })
    }
  }]
})

// ---------------- jsdom 环境 ----------------
const dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>', { pretendToBeVisual: true, url: 'http://localhost/' })
const { window } = dom
for (const k of ['window', 'document', 'navigator', 'HTMLElement', 'Element', 'Node', 'SVGElement', 'getComputedStyle', 'localStorage', 'Event', 'InputEvent', 'MouseEvent', 'KeyboardEvent', 'FocusEvent', 'requestAnimationFrame', 'cancelAnimationFrame', 'CSS', 'MutationObserver', 'Text', 'Comment', 'DocumentFragment', 'HTMLInputElement', 'HTMLTextAreaElement', 'HTMLDivElement', 'HTMLButtonElement', 'Blob', 'File', 'FileReader', 'HTMLAnchorElement', 'HTMLCanvasElement', 'Image', 'matchMedia']) {
  if (window[k] !== undefined) globalThis[k] = window[k]
}
globalThis.ResizeObserver = window.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} }
globalThis.PointerEvent = window.PointerEvent = window.PointerEvent || class PointerEvent extends window.MouseEvent {
  constructor(type, init = {}) { super(type, init); this.pointerId = init.pointerId ?? 1; this.pointerType = init.pointerType ?? 'mouse' }
}
window.matchMedia = globalThis.matchMedia = window.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }))
window.HTMLCanvasElement.prototype.getContext = () => null
if (!window.Element.prototype.scrollTo) window.Element.prototype.scrollTo = function () {}
// jsdom 不支持 onpointerdown / onpointerup / onpointercancel 处理属性：改成 addEventListener
for (const t of ['pointerdown', 'pointerup', 'pointercancel']) {
  const key = '__on' + t
  Object.defineProperty(window.HTMLElement.prototype, 'on' + t, {
    configurable: true,
    get() { return this[key] || null },
    set(fn) { if (this[key]) this.removeEventListener(t, this[key]); this[key] = fn; if (fn) this.addEventListener(t, fn) }
  })
}
// i18n 初始化会请求 /locales/*.json：这里返回空语言包（键盘不依赖文案）
globalThis.fetch = window.fetch = async () => ({ ok: true, status: 200, json: async () => ({}), text: async () => '{}' })
window.chrome = { webview: { hostObjects: { sync: {} }, addEventListener() {}, postMessage() {} } }
window.$message = { success() {}, error() {}, warning() {}, info() {} }

// 真实模块加载时的调试输出 / 空语言包的缺词提示与本测试无关，过滤掉
const rawLog = console.log, rawWarn = console.warn
console.log = (...a) => { if (!(typeof a[0] === 'string' && a[0].startsWith('🪵'))) rawLog(...a) }
console.warn = (...a) => { if (!(typeof a[0] === 'string' && a[0].startsWith('[intlify]'))) rawWarn(...a) }
const m = await import(pathToFileURL(bundle).href)
const { NDialogProvider, DeviceGroupAddForm, i18n, useDialog, installDialogNoAutoFocus, FormulaParam } = m
const { createApp, nextTick, h, reactive, defineComponent, createPinia, NInput, NInputNumber, GlobalKeyBoard, useMain, useConfigStore, listenAllInputFocus, isKeyboardSuppressed, useFormulaStore, vk, MyFormWrap, noKeyBoardInputClass } = m

const sleep = ms => new Promise(r => setTimeout(r, ms))
let step = 0
const check = (name, fn) => { step++; fn(); console.log(`  ✓ ${step}. ${name}`) }

vk.installNumberInputMark()
installDialogNoAutoFocus()
const model = reactive({ text: 'hello', num: 3, pwd: 'secret', note: 'line1', short: 'ab', ro: 'fixed', form: { n: '502', m: 7 } })
const pinia = createPinia()
/** 拿到 useDialog() 的 api，测试里直接 create 弹窗 */
let dialogApi = null
const DialogGrab = defineComponent({ setup() { dialogApi = useDialog(); return () => null } })
// 配方参数（FormulaParam）用到的宿主调用
const formulaHost = { fields: [], params: [] }
globalThis.__callBrige = (name, data) => {
  if (name === 'GetFormulaFields') return formulaHost.fields
  if (name === 'GetFormulaParams') return formulaHost.params
  return []
}
const App = defineComponent({
  setup() {
    return () => h('div', [
      h(GlobalKeyBoard),
      h(NDialogProvider, null, { default: () => [h(DeviceGroupAddForm), h(DialogGrab)] }),
      h('div', { id: 'f-formula', style: 'height:600px' }, [h(FormulaParam)]),
      h('div', { id: 'f-text' }, [h(NInput, { value: model.text, 'onUpdate:value': v => (model.text = v) })]),
      h('div', { id: 'f-num' }, [h(NInputNumber, { value: model.num, 'onUpdate:value': v => (model.num = v) })]),
      h('div', { id: 'f-pwd' }, [h(NInput, { type: 'password', value: model.pwd, 'onUpdate:value': v => (model.pwd = v) })]),
      h('div', { id: 'f-note' }, [h(NInput, { type: 'textarea', value: model.note, 'onUpdate:value': v => (model.note = v) })]),
      h('input', { id: 'f-short', maxlength: 5, value: model.short, onInput: e => (model.short = e.target.value) }),
      h('input', { id: 'f-ro', readonly: true, value: model.ro }),
      h('input', { id: 'f-check', type: 'checkbox' }),
      h('div', { class: noKeyBoardInputClass }, [h('input', { id: 'f-nokb', value: 'x' })]),
      h('div', { id: 'f-form' }, [h(MyFormWrap, { hideBtn: true, needBtmSpace: false, form: model.form, itemList: [
        { type: 'numInput', label: '数值（字符串）', prop: 'n', numAsString: true },
        { type: 'numInput', label: '数值', prop: 'm' }
      ] })])
    ])
  }
})
const app = createApp(App).use(pinia).use(i18n)
app.directive('drag', {})
app.config.warnHandler = msg => { if (!/Extraneous non-props|Non-function value encountered/.test(msg)) console.warn('[vue warn]', msg) }
const root = document.getElementById('app')
app.mount(root)
const store = useMain(pinia)
const configStore = useConfigStore(pinia)
listenAllInputFocus(store, configStore)
await nextTick(); await sleep(30)

const $ = sel => root.querySelector(sel)
const kb = () => root.querySelector('.' + vk.KEYBOARD_ROOT_CLASS)
const area = () => kb().querySelector('[data-keyboard-area]')
const inputOf = id => root.querySelector(`#${id} input, #${id} textarea, input#${id}`)
const visible = () => store.globalKeyBoardShow && kb().style.display !== 'none'
const btn = name => kb().querySelector(`[data-skbtn="${name}"]`)
const press = async name => {
  const b = btn(name); assert.ok(b, 'key ' + name)
  b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 }))
  b.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, button: 0 }))
  document.dispatchEvent(new window.MouseEvent('mouseup', { bubbles: true }))
  await nextTick()
}
const blurAll = () => { if (document.activeElement && document.activeElement.blur) document.activeElement.blur() }
const open = async id => { blurAll(); if (store.globalKeyBoardShow) { store.setGlobalKeyBoardShow(false); await nextTick() } inputOf(id).focus(); await nextTick(); await nextTick(); await sleep(10) }
const areaKey = async (key, opt = {}) => { area().dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...opt })); await nextTick(); await sleep(40) }
const typeArea = async v => { area().value = v; area().dispatchEvent(new Event('input', { bubbles: true })); await nextTick() }

check('初始：键盘已挂载但隐藏；NInputNumber 内部 <input> 带数字标记 data-num-input="true"，普通 NInput 没有', () => {
  assert.ok(kb()); assert.equal(store.globalKeyBoardShow, false)
  assert.equal(inputOf('f-num').getAttribute(vk.NUM_INPUT_ATTR), 'true'); assert.equal(inputOf('f-text').hasAttribute(vk.NUM_INPUT_ATTR), false)
  assert.ok(vk.isNumberInput(inputOf('f-num'))); assert.ok(!vk.isNumberInput(inputOf('f-text')))
})
check('isTouchKeyboardEnabled：1 / true / "1" / "True" 开启；0 / undefined / "0" 关闭', () => {
  for (const v of [1, true, '1', 'True', 'true']) assert.equal(vk.isTouchKeyboardEnabled(v), true, String(v))
  for (const v of [0, false, '0', undefined, null, '', 'no']) assert.equal(vk.isTouchKeyboardEnabled(v), false, String(v))
})
await open('f-text')
check('系统配置 InputType = 0（触摸键盘输入关闭）：点输入框不弹键盘', () => assert.equal(store.globalKeyBoardShow, false))
configStore.sysConfig.InputType = 1
await open('f-text')
check('InputType = 1：点输入框弹出键盘；顶部输入区带入输入框现有内容 "hello" 并获得焦点；文字键盘模式', () => {
  assert.ok(visible()); assert.equal(area().value, 'hello'); assert.equal(document.activeElement, area()); assert.equal(kb().dataset.numMode, 'false')
  assert.equal(store.keyboardTarget, inputOf('f-text')); assert.ok(btn('q')); assert.equal(area().type, 'text'); assert.equal(area().hasAttribute('maxlength'), false)
})
await press('a'); await press('b')
check('按键只改输入区（"helloab"），真正的输入框和 v-model 不变', () => { assert.equal(area().value, 'helloab'); assert.equal(model.text, 'hello'); assert.equal(inputOf('f-text').value, 'hello') })
await press('{bksp2}')
check('退格：删光标前一个字符', () => assert.equal(area().value, 'helloa'))
area().setSelectionRange(0, 2); await press('{bksp2}')
check('有选区时退格删选区', () => assert.equal(area().value, 'lloa'))
area().setSelectionRange(4, 4); await press('{shift}'); await press('Q'); await press('w')
check('Shift 只对下一个字符生效（Q 大写，随后 w 小写）', () => assert.equal(area().value, 'lloaQw'))
await press('{enter}'); await sleep(40)
check('回车：输入区内容覆盖写入真正的输入框（v-model 更新），键盘收起', () => { assert.equal(model.text, 'lloaQw'); assert.equal(inputOf('f-text').value, 'lloaQw'); assert.equal(store.globalKeyBoardShow, false); assert.equal(store.keyboardTarget, null) })
await open('f-text'); await press('z'); kb().querySelector('[data-keyboard-close]').click(); await nextTick(); await sleep(40)
check('✕ 关闭：放弃修改，输入框不变', () => { assert.equal(store.globalKeyBoardShow, false); assert.equal(model.text, 'lloaQw') })
await open('f-text'); await press('z'); await areaKey('Escape')
check('Esc：同样放弃修改', () => { assert.equal(store.globalKeyBoardShow, false); assert.equal(model.text, 'lloaQw') })
{
  blurAll(); configStore.sysConfig.InputType = 0; await nextTick()
  inputOf('f-text').focus(); await nextTick()
  configStore.sysConfig.InputType = 1; await nextTick()
  inputOf('f-text').click(); await nextTick(); await nextTick(); await sleep(10)
  check('输入框已有焦点时再点一下（没有 focusin）：也会弹出，并重新带入内容', () => { assert.ok(visible()); assert.equal(area().value, 'lloaQw') })
}
await typeArea('typed by hand'); await areaKey('Enter')
check('实体键盘直接在输入区打字 + 回车：写回', () => { assert.equal(model.text, 'typed by hand'); assert.equal(store.globalKeyBoardShow, false) })
await open('f-num')
check('数字输入框（带 data-num-input 标记）：键盘自动切到数字模式，输入区带入 "3"', () => {
  assert.equal(kb().dataset.numMode, 'true'); assert.equal(area().value, '3'); assert.ok(btn('.') && btn('{abc}')); assert.equal(btn('q'), null); assert.equal(area().getAttribute('inputmode'), 'decimal')
})
await press('{bksp2}'); for (const k of ['1', '2', '.', '5']) await press(k)
await press('{enter}'); await sleep(40)
check('数字键盘输入 12.5 + 回车 → NInputNumber 的值为 12.5（数字）', () => { assert.equal(model.num, 12.5); assert.equal(store.globalKeyBoardShow, false) })
await open('f-num'); await press('{abc}')
check('数字模式下 abc 切到字母键盘，123 再切回', () => { assert.equal(kb().dataset.numMode, 'false'); assert.ok(btn('q')) })
await press('{123}')
check('……切回数字键盘', () => { assert.equal(kb().dataset.numMode, 'true'); assert.ok(btn('.')) })
await open('f-text')
check('之后打开普通输入框：回到文字键盘', () => { assert.equal(kb().dataset.numMode, 'false'); assert.equal(area().value, 'typed by hand') })
await open('f-pwd')
check('密码框：输入区也是 password 类型（不明文显示），带入原内容', () => { assert.equal(area().type, 'password'); assert.equal(area().value, 'secret') })
await press('{enter}'); await sleep(40)
await open('f-note')
check('多行文本框：输入区换成 textarea', () => { assert.equal(area().tagName, 'TEXTAREA'); assert.equal(area().value, 'line1') })
await typeArea('line1\nline2'); await areaKey('Enter', { shiftKey: true })
check('textarea 里 Shift + Enter 不提交（留给换行）', () => { assert.ok(visible()); assert.equal(model.note, 'line1') })
await areaKey('Enter')
check('……Enter 提交多行内容', () => { assert.equal(model.note, 'line1\nline2'); assert.equal(store.globalKeyBoardShow, false) })
await open('f-short')
check('目标有 maxlength=5：输入区同样限制 5；按键超出不再增加', () => { assert.equal(area().getAttribute('maxlength'), '5'); assert.equal(area().value, 'ab') })
for (const k of ['c', 'd', 'e', 'f', 'g']) await press(k)
check('……最多 5 个字符', () => assert.equal(area().value, 'abcde'))
await press('{enter}'); await sleep(40)
check('……回车写回原生 input（input 事件驱动的 v-model 也更新）', () => { assert.equal(inputOf('f-short').value, 'abcde'); assert.equal(model.short, 'abcde') })
for (const id of ['f-ro', 'f-check', 'f-nokb']) {
  await open(id)
  check(`不弹键盘：${{ 'f-ro': '只读输入框', 'f-check': 'checkbox', 'f-nokb': '.' + noKeyBoardInputClass + ' 区域里的输入框' }[id]}`, () => assert.equal(store.globalKeyBoardShow, false))
}
store.setGlobalKeyBoardBlocked(true); await open('f-text')
check('数据组态 tab 激活（globalKeyBoardBlocked）且没有打开系统配置 / 产品配方 / 产品历史：不弹键盘', () => { assert.equal(store.globalKeyBoardShow, false); assert.equal(isKeyboardSuppressed(store, configStore), true) })
{
  const formulaStore = useFormulaStore(pinia)
  const pages = [
    ['系统配置', v => { configStore.isShowConfig = v }],
    ['产品配方', v => { formulaStore.show = v }],
    ['产品历史', v => { configStore.productHistoryShow = v }]
  ]
  for (const [name, set] of pages) {
    set(true); await nextTick()
    await open('f-text')
    check(`数据组态 tab 激活但「${name}」页面打开：照常弹键盘`, () => { assert.equal(isKeyboardSuppressed(store, configStore), false); assert.ok(visible()); assert.equal(area().value, model.text) })
    set(false); await nextTick(); await sleep(40)
    check(`……关掉「${name}」页面（回到数据组态）：开着的键盘收起，再点输入框也不弹`, () => { assert.equal(store.globalKeyBoardShow, false) })
    await open('f-text')
    assert.equal(store.globalKeyBoardShow, false)
  }
  configStore.isShowConfig = true; formulaStore.show = true; await nextTick()
  await open('f-text')
  check('几个页面同时打开：照常弹；只关一个（另一个还开着）不收起', () => { assert.ok(visible()) })
  configStore.isShowConfig = false; await nextTick(); await sleep(40)
  check('……关掉系统配置、产品配方还开着：键盘仍在', () => assert.ok(visible()))
  formulaStore.show = false; await nextTick(); await sleep(40)
  check('……都关掉：键盘收起', () => assert.equal(store.globalKeyBoardShow, false))
}
store.setGlobalKeyBoardBlocked(false)
configStore.isShowConfig = true; await nextTick()
await open('f-text')
check('不在数据组态 tab（未屏蔽）：系统配置页打开与否都照常弹', () => { assert.equal(isKeyboardSuppressed(store, configStore), false); assert.ok(visible()) })
configStore.isShowConfig = false; await nextTick(); await sleep(40)
check('……关掉系统配置页不影响（不在数据组态 tab 时键盘不收起）', () => assert.ok(visible()))
store.setGlobalKeyBoardShow(false); await nextTick(); await sleep(40)
await open('f-text')
check('输入区本身获得焦点不会再触发弹键盘 / 换目标', () => { area().blur(); area().focus(); assert.equal(store.keyboardTarget, inputOf('f-text')) })
configStore.sysConfig.InputType = 0; await nextTick(); await sleep(40)
check('键盘开着时在系统配置里关掉「触摸键盘输入」：键盘收起', () => assert.equal(store.globalKeyBoardShow, false))
configStore.sysConfig.InputType = 1
{
  const [nIn, mIn] = [...root.querySelectorAll('#f-form .n-input-number input')]
  check('MyFormWrap numInput：渲染成 NInputNumber（带数字标记），字符串模式显示 502', () => { assert.equal(nIn.getAttribute(vk.NUM_INPUT_ATTR), 'true'); assert.equal(nIn.value, '502'); assert.equal(mIn.value, '7') })
  blurAll(); nIn.focus(); await nextTick(); await nextTick(); await sleep(10)
  check('……点它弹出数字键盘，带入 502', () => { assert.equal(kb().dataset.numMode, 'true'); assert.equal(area().value, '502') })
  await press('0'); await press('{enter}'); await sleep(40)
  check('……回车后表单值为字符串 "5020"（numAsString：规则 / 提交数据不变）', () => assert.equal(model.form.n, '5020'))
  blurAll(); nIn.focus(); await nextTick(); await nextTick(); await sleep(10)
  await typeArea(''); await areaKey('Enter')
  check('……清空后回车：表单值为空字符串 ""', () => assert.equal(model.form.n, ''))
  blurAll(); nIn.focus(); await nextTick(); await nextTick(); await sleep(10)
  for (const k of ['1', '0', '0']) await press(k)
  await press('{enter}'); await sleep(40)
  check('……再输入 100：表单值 "100"', () => assert.equal(model.form.n, '100'))
  blurAll(); mIn.focus(); await nextTick(); await nextTick(); await sleep(10)
  await press('{bksp2}'); await press('9'); await press('{enter}'); await sleep(40)
  check('不带 numAsString 的 numInput：表单值存数字 9', () => assert.equal(model.form.m, 9))
}

// ---- 任务 64：带焦点陷阱的弹窗（naive useDialog / NModal）里的输入框 ----
{
  // 卡死的复现：弹窗打开时自动聚焦输入框 → 弹键盘 → 键盘把焦点移到自己的输入区 → 弹窗的焦点陷阱（vueuc FocusTrap，
  // document 捕获阶段的 focus 监听）把焦点拉回弹窗里的输入框 → 又「打开」一次键盘 → 又聚焦输入区 …… 微任务里无限循环。
  // 这里给 openGlobalKeyBoard 计数并设上限，循环时测试失败而不是挂死。
  let opens = 0
  const rawOpen = store.openGlobalKeyBoard.bind(store)
  store.openGlobalKeyBoard = el => { opens++; if (opens <= 40) rawOpen(el) }
  blurAll(); store.setGlobalKeyBoardShow(false); configStore.sysConfig.InputType = 1; await nextTick()
  configStore.setDeviceGroupAddFormShow(true); await nextTick(); await sleep(150)
  const dlgInput = document.querySelector('.n-dialog input')
  check('任务 65：useDialog().create() 默认不再自动聚焦——设备分组「新增」弹窗打开时焦点不进输入框，也不弹键盘', () => {
    assert.ok(dlgInput, '弹窗里有设备名称输入框'); assert.equal(opens, 0); assert.equal(store.globalKeyBoardShow, false)
    assert.ok(!document.activeElement || !document.activeElement.closest('.n-dialog'), '焦点不在弹窗里')
  })
  dlgInput.focus(); await nextTick(); await sleep(60)
  check('……点弹窗里的输入框（焦点陷阱 + 虚拟键盘）：键盘只弹一次，不会和焦点陷阱来回抢焦点（任务 64 原来在这里卡死）', () => {
    assert.ok(opens >= 1 && opens <= 2, 'openGlobalKeyBoard 调用次数 ' + opens)
    assert.ok(visible()); assert.equal(store.keyboardTarget, dlgInput)
  })
  check('……焦点留在键盘输入区（焦点陷阱不再把它拉回弹窗）', () => assert.equal(document.activeElement, area()))
  await press('a'); await press('b'); await press('{enter}'); await sleep(60)
  check('……键盘输入 + 回车：写进弹窗里的输入框（表单 v-model 更新）', () => { assert.equal(dlgInput.value, 'ab'); assert.equal(store.globalKeyBoardShow, false) })
  const n0 = opens
  dlgInput.focus(); await nextTick(); await sleep(60)
  check('……再点弹窗里的输入框：重新弹出并带入 "ab"，仍然只打开一次', () => { assert.equal(opens - n0, 1); assert.ok(visible()); assert.equal(area().value, 'ab') })
  const n1 = opens
  dlgInput.focus(); dlgInput.dispatchEvent(new window.FocusEvent('focusin', { bubbles: true })); await nextTick(); await sleep(30)
  check('键盘开着时同一个输入框再次获得焦点：不重新带入（不丢掉输入区里正在编辑的内容）', () => { assert.equal(opens, n1) })
  store.setGlobalKeyBoardShow(false); configStore.setDeviceGroupAddFormShow(false); await nextTick(); await sleep(150)
  // 显式 autoFocus: true 的弹窗仍然自动聚焦；任务 64 的焦点陷阱修复照样防住循环
  opens = 0; blurAll()
  const ins = dialogApi.create({ title: 'auto', autoFocus: true, content: () => h('input', { id: 'dlg-auto', value: 'x' }) }); await nextTick(); await sleep(150)
  check('显式 autoFocus: true：照常自动聚焦（弹出键盘），键盘只打开一次、焦点留在键盘输入区', () => {
    assert.ok(opens >= 1 && opens <= 2, 'openGlobalKeyBoard 调用次数 ' + opens); assert.equal(store.keyboardTarget, document.getElementById('dlg-auto')); assert.equal(document.activeElement, area())
  })
  store.setGlobalKeyBoardShow(false); ins.destroy(); await nextTick(); await sleep(150)
  opens = 0; blurAll()
  const ins2 = dialogApi.warning({ title: 'warn', content: () => h('input', { id: 'dlg-warn', value: 'y' }) }); await nextTick(); await sleep(150)
  check('dialog.warning（info / success / error 同理，内部都走 create）：同样默认不自动聚焦', () => { assert.equal(opens, 0); assert.ok(document.getElementById('dlg-warn')); assert.notEqual(document.activeElement, document.getElementById('dlg-warn')) })
  ins2.title = 'warn-changed'; await nextTick()
  check('……create 返回的 DialogReactive 改属性照常生效（改标题）', () => assert.ok([...document.querySelectorAll('.n-dialog')].some(d => d.textContent.includes('warn-changed'))))
  ins2.destroy(); await nextTick(); await sleep(150)
  store.openGlobalKeyBoard = rawOpen
}

// ---- 任务 65：配方参数改成卡片布局（一行三张，多了换行） ----
{
  const formulaStore = useFormulaStore(pinia)
  const cards = () => [...root.querySelectorAll('#f-formula [data-formula-param-card]')]
  check('配方参数：没有选中设备组 / 没有参数时显示空状态，没有 tab', () => {
    assert.equal(cards().length, 0); assert.equal(root.querySelector('#f-formula .n-tabs'), null); assert.ok(root.querySelector('#f-formula .formula-param-cards'))
  })
  formulaHost.fields = Array.from({ length: 7 }, (_, i) => ({ GId: 'dg' + i, DataName: '参数' + (i + 1), DeviceGroupId: 'dev1' }))
  formulaHost.params = formulaHost.fields.map((f, i) => ({ GId: 'p' + i, FormulaId: 'f1', DataGroupId: f.GId, Standard: String(10 + i), UpperTol: '0.5', LowerTol: '0.3' }))
  formulaStore.curEnableDataGroupConfig = { GId: 'cfg' }; await nextTick(); await sleep(20)
  formulaStore.curFormulaConfigRow = { GId: 'f1' }; await nextTick(); await sleep(20)
  formulaStore.curDeviceGroupRow = { GId: 'dev1', DeviceClass: '0' }; await nextTick(); await sleep(50)
  check('7 个参数 → 7 张卡片，放在 3 列网格里（第 4 张起换行），容器可纵向滚动；没有 NTabs', () => {
    assert.equal(cards().length, 7); const grid = cards()[0].parentElement
    assert.ok(grid.className.includes('grid') && grid.className.includes('grid-cols-3'), grid.className)
    assert.ok(root.querySelector('#f-formula .formula-param-cards').className.includes('overflow-y-auto')); assert.equal(root.querySelector('#f-formula .n-tabs'), null)
  })
  check('每张卡片：标题 = 参数名；标准值 / 上公差 / 下公差三个数字输入框（带数字标记），带入当前值', () => {
    const c = cards()[2]; assert.ok(c.textContent.includes('参数3'))
    const ins = [...c.querySelectorAll('.n-input-number input')]; assert.equal(ins.length, 3)
    assert.deepEqual(ins.map(i => i.value), ['12', '0.5', '0.3']); assert.ok(ins.every(i => i.getAttribute(vk.NUM_INPUT_ATTR) === 'true'))
    assert.ok(c.querySelector('.n-form-item--top-labelled'), '标签在输入框上方')
  })
  {
    const input = cards()[2].querySelector('.n-input-number input')
    blurAll(); input.focus(); await nextTick(); await nextTick(); await sleep(10)
    await press('{bksp2}'); await press('{bksp2}'); await press('2'); await press('0'); await press('{enter}'); await sleep(40)
    const map = formulaStore.getParamFormMapFn()
    check('卡片里的输入框弹数字键盘，回车写回；保存用的 formMap（getParamFormMapFn）里是字符串 "20"', () => { assert.equal(map['f1-dg2'].Standard, '20'); assert.equal(Object.keys(map).length, 7) })
  }
  formulaStore.curDeviceGroupRow = { GId: 'dev-other', DeviceClass: '0' }; await nextTick(); await sleep(30)
  check('切到没有参数的设备组：卡片清空，显示空状态', () => assert.equal(cards().length, 0))
}

app.unmount()
console.log(`keyboard smoke tests passed (${step} steps)`)
fs.rmSync(outdir, { recursive: true, force: true })
setTimeout(() => process.exit(0), 50).unref()
