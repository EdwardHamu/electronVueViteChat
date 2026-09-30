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
import { NInput, NInputNumber } from 'naive-ui'
import GlobalKeyBoard from '@/views/Home/GlobalKeyBoard'
import { useMain } from '@/store'
import { useConfigStore } from '@/store/config'
import { listenAllInputFocus } from '@/utils/utils'
import * as vk from '@/utils/virtualKeyboard'
import { MyFormWrap } from '@/components/MyFormWrap/MyFormWrap'
import { noKeyBoardInputClass } from '@/views/Home/config/sysConfig/enum'
export { createApp, nextTick, h, reactive, defineComponent, createPinia, NInput, NInputNumber, GlobalKeyBoard, useMain, useConfigStore, listenAllInputFocus, vk, MyFormWrap, noKeyBoardInputClass }
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
const { createApp, nextTick, h, reactive, defineComponent, createPinia, NInput, NInputNumber, GlobalKeyBoard, useMain, useConfigStore, listenAllInputFocus, vk, MyFormWrap, noKeyBoardInputClass } = m

const sleep = ms => new Promise(r => setTimeout(r, ms))
let step = 0
const check = (name, fn) => { step++; fn(); console.log(`  ✓ ${step}. ${name}`) }

vk.installNumberInputMark()
const model = reactive({ text: 'hello', num: 3, pwd: 'secret', note: 'line1', short: 'ab', ro: 'fixed', form: { n: '502', m: 7 } })
const pinia = createPinia()
const App = defineComponent({
  setup() {
    return () => h('div', [
      h(GlobalKeyBoard),
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
const app = createApp(App).use(pinia)
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
check('globalKeyBoardBlocked（数据组态页）：不弹键盘', () => assert.equal(store.globalKeyBoardShow, false))
store.setGlobalKeyBoardBlocked(false)
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

app.unmount()
console.log(`keyboard smoke tests passed (${step} steps)`)
fs.rmSync(outdir, { recursive: true, force: true })
setTimeout(() => process.exit(0), 50).unref()
