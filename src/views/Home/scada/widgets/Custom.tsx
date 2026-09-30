/**
 * 自定义组件：用户自己写 HTML / CSS / JS，放进一个 srcdoc iframe 里运行——样式、脚本与页面隔离，
 * 写坏了也只影响这个组件。代码在属性面板里点按钮打开 CodeDialog（带语法高亮）编辑：HTML + CSS 同一个弹窗、JS 单独一个，改完 iframe 自动重载。
 *
 * 宿主 ⇄ iframe 用 postMessage 通信：
 *  - 宿主推送 { type: 'scada:data', point, widget, history, editing }（数据 / 尺寸 / 编辑状态变化时）
 *  - iframe 里注入的全局 scada 对象：point / value / widget / history / editing 只读属性，
 *    onData(cb) 订阅数据变化，write(value) 写回绑定的数据源（走 useControl，只有可写数据源生效），
 *    format(v, digits) / statusColor(status) 小工具
 *  - iframe 内的右键 / 长按转发给外层（scada:contextmenu），展示模式下仍能弹出“进入编辑”菜单；
 *    脚本错误（scada:error）在编辑模式下显示为组件左下角的红色角标
 * iframe 加了 sandbox（允许脚本 / 同源 / 表单 / 弹窗式对话框，不允许顶层跳转），代码来自现场配置，不做更严格的隔离。
 */
import { computed, defineComponent, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { CodePart, WidgetDefinition, WriteValue } from '../types'
import { icons } from './icons'
import { STATUS_COLORS, tt, widgetProps } from './common'
import { useControl } from './controlCommon'
import { FONT_FAMILY_KEY, fontFamilyCss } from '../fonts'

/** 默认示例：名称 + 数值（随状态变色）+ 单位 + 公差范围 */
export const CUSTOM_TEMPLATE = {
  html: `<div class="card">
  <div class="name" id="name">--</div>
  <div class="value"><span id="value">--</span><span class="unit" id="unit"></span></div>
  <div class="range" id="range"></div>
</div>`,
  css: `.card { height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; color: #1f2937; }
.name { font-size: 14px; opacity: .7; }
.value { font-size: 36px; font-weight: bold; line-height: 1; }
.unit { font-size: 14px; margin-left: 4px; font-weight: normal; }
.range { font-size: 12px; opacity: .6; }`,
  js: `// 数据变化时回调：point 为当前数据点（未绑定为 undefined）
scada.onData(function (point) {
  var $ = function (id) { return document.getElementById(id) }
  $('name').textContent = point && point.name ? point.name : '--'
  $('value').textContent = point ? scada.format(point.value, point.precision) : '--'
  $('value').style.color = point ? scada.statusColor(point.status) : '#9ca3af'
  $('unit').textContent = point && point.unit ? point.unit : ''
  $('range').textContent = point && point.lower !== undefined && point.upper !== undefined
    ? scada.format(point.lower, point.precision) + ' ~ ' + scada.format(point.upper, point.precision)
    : ''
})`
}

/** 注入到 iframe 的运行时（ES5，写成字符串避免被打包器改写） */
export const CUSTOM_RUNTIME = `(function () {
  var COLORS = ${JSON.stringify(STATUS_COLORS)};
  var state = { point: undefined, widget: null, history: [], editing: false, ready: false };
  var handlers = [];
  function post(msg) { try { window.parent.postMessage(msg, '*') } catch (e) {} }
  function report(err) {
    try { console.error('[scada custom]', err) } catch (e) {}
    post({ type: 'scada:error', message: String(err && err.message ? err.message : err) });
  }
  function call(cb) { try { cb(state.point, state) } catch (err) { report(err) } }
  window.scada = {
    get point() { return state.point },
    get value() { return state.point && state.point.value !== undefined ? state.point.value : null },
    get widget() { return state.widget },
    get history() { return state.history },
    get editing() { return state.editing },
    onData: function (cb) { if (typeof cb !== 'function') return; handlers.push(cb); if (state.ready) call(cb) },
    write: function (value) { post({ type: 'scada:write', value: value }) },
    format: function (v, digits) { var n = Number(v); return v === null || v === undefined || v === '' || isNaN(n) ? '--' : n.toFixed(digits === undefined || digits === null ? 2 : digits) },
    statusColor: function (status) { return COLORS[status] || COLORS.none }
  };
  window.addEventListener('message', function (e) {
    var d = e.data;
    if (!d || d.type !== 'scada:data') return;
    state.point = d.point; state.widget = d.widget; state.history = d.history || []; state.editing = !!d.editing; state.ready = true;
    for (var i = 0; i < handlers.length; i++) call(handlers[i]);
  });
  document.addEventListener('contextmenu', function (e) { e.preventDefault(); post({ type: 'scada:contextmenu', x: e.clientX, y: e.clientY }) });
  window.addEventListener('error', function (e) { post({ type: 'scada:error', message: String(e.message || e) }) });
  window.addEventListener('unhandledrejection', function (e) { report(e.reason) });
  window.addEventListener('DOMContentLoaded', function () { post({ type: 'scada:ready' }) });
})();`

/** 推给 iframe 的组件属性：去掉三段代码本身（每次数据更新都要克隆，没必要带着） */
const publicProps = (props: Record<string, any>) => {
  const out: Record<string, any> = {}
  Object.keys(props || {}).forEach(k => {
    if (k === 'html' || k === 'css' || k === 'js') return
    const v = props[k]
    if (v === undefined || typeof v === 'function') return
    out[k] = v
  })
  return JSON.parse(JSON.stringify(out))
}

/** 用户代码里的 </script> / </style> 会提前结束标签，转义成 <\\/…（在 JS 字符串 / CSS 里都合法） */
const escapeClose = (code: string, tag: string) => code.replace(new RegExp('</' + tag, 'gi'), m => '<\\/' + m.slice(2))

/**
 * 拼出 iframe 的 srcdoc：运行时放在 head 里，这样 HTML 内联的 <script> 也能用 scada。
 * font = 属性面板选的字体（props.fontFamily）：iframe 是独立文档、继承不到外面的字体，写进基础样式（用户 CSS 在后面，仍可覆盖）
 */
export const buildCustomDoc = (html: string, css: string, js: string, font = '') =>
  '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
  '<style>html,body{margin:0;padding:0;width:100%;height:100%;overflow:hidden;background:transparent;font-family:' +
  (fontFamilyCss(font) || 'system-ui,-apple-system,"Segoe UI",Roboto,"PingFang SC","Microsoft YaHei",sans-serif') +
  '}*,*::before,*::after{box-sizing:border-box}</style>' +
  '<script>' + CUSTOM_RUNTIME + '</script>' +
  '<style>' + escapeClose(css, 'style') + '</style></head><body>' +
  html +
  '<script>' + escapeClose(js, 'script') + '\n</script></body></html>'

const CustomWidget = defineComponent({
  name: 'ScadaCustom',
  props: widgetProps,
  setup(props) {
    const p = computed(() => props.widget.props)
    const { write } = useControl(props)
    const frameRef = ref<HTMLIFrameElement>()
    const ready = ref(false)
    const error = ref('')
    const doc = computed(() => buildCustomDoc(String(p.value.html ?? ''), String(p.value.css ?? ''), String(p.value.js ?? ''), String(p.value[FONT_FAMILY_KEY] || '')))
    const hasCode = computed(() => !!(String(p.value.html || '').trim() || String(p.value.js || '').trim()))

    /** 推给 iframe 的快照：只带可结构化克隆的字段 */
    const snapshot = () => {
      const w = props.widget
      return {
        type: 'scada:data',
        point: props.point ? { ...props.point } : undefined,
        widget: { id: w.id, type: w.type, title: w.title || '', x: w.x, y: w.y, w: w.w, h: w.h, binding: w.binding ? { ...w.binding } : null, props: publicProps(w.props) },
        history: props.history.slice(),
        editing: props.editing
      }
    }
    const post = () => {
      const win = frameRef.value?.contentWindow
      if (!win || !ready.value) return
      try {
        win.postMessage(snapshot(), '*')
      } catch (err) {
        console.warn('[scada] custom widget postMessage failed', err)
      }
    }
    watch(() => [props.point, props.history, props.editing, props.widget.w, props.widget.h, props.widget.title, props.widget.binding], post, { deep: true })
    // srcdoc 变化 → iframe 重新加载，等它再次报 ready
    watch(doc, () => {
      ready.value = false
      error.value = ''
    })

    /** iframe 里的右键 / 长按：换算成外层坐标后在 iframe 元素上派发 contextmenu，冒泡到页面根元素弹菜单 */
    const forwardContextMenu = (x: number, y: number) => {
      const el = frameRef.value
      if (!el) return
      const r = el.getBoundingClientRect()
      const sx = el.clientWidth ? r.width / el.clientWidth : 1
      const sy = el.clientHeight ? r.height / el.clientHeight : 1
      el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + Number(x || 0) * sx, clientY: r.top + Number(y || 0) * sy }))
    }
    const onMessage = (e: MessageEvent) => {
      const win = frameRef.value?.contentWindow
      if (!win || e.source !== win) return
      const d = (e.data || {}) as { type?: string; value?: unknown; message?: unknown; x?: number; y?: number }
      if (d.type === 'scada:ready') {
        ready.value = true
        error.value = ''
        post()
      } else if (d.type === 'scada:write') {
        const v = d.value
        if (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') write(v as WriteValue)
      } else if (d.type === 'scada:error') {
        error.value = String(d.message || 'error')
        console.warn('[scada] custom widget error:', error.value)
      } else if (d.type === 'scada:contextmenu') {
        forwardContextMenu(Number(d.x), Number(d.y))
      }
    }
    onMounted(() => window.addEventListener('message', onMessage))
    onBeforeUnmount(() => window.removeEventListener('message', onMessage))

    return () => {
      const pv = p.value
      return (
        <div
          class={'w-full h-full relative overflow-hidden'}
          style={{ background: pv.bg || 'transparent', borderRadius: (Number(pv.radius) || 0) + 'px', border: pv.border ? '1px solid #cbd5e1' : 'none' }}
          data-scada-custom
        >
          <iframe
            ref={frameRef}
            class={'block w-full h-full border-0'}
            style={{ background: 'transparent', pointerEvents: props.editing ? 'none' : 'auto' }}
            srcdoc={doc.value}
            sandbox="allow-scripts allow-same-origin allow-forms allow-modals"
            title={props.widget.title || 'custom'}
          />
          {props.editing && !hasCode.value ? (
            <div class={'absolute inset-0 flex items-center justify-center text-xs text-gray-500 bg-gray-50/80 pointer-events-none text-center px-2'}>{tt('scada.widget.customPlaceholder')}</div>
          ) : null}
          {props.editing && error.value ? (
            <div class={'absolute left-1 bottom-1 text-[10px] leading-4 px-1 rounded bg-red-600 text-white pointer-events-none truncate max-w-[90%]'} title={error.value} data-custom-error>
              {tt('scada.widget.customError')}: {error.value}
            </div>
          ) : null}
        </div>
      )
    }
  }
})

const codePart = (key: 'html' | 'css' | 'js'): CodePart => ({
  key,
  label: () => tt('scada.prop.' + key),
  language: key,
  example: () => CUSTOM_TEMPLATE[key],
  hint: () => tt('scada.custom.' + key + 'Hint')
})

export const customDefinition: WidgetDefinition = {
  type: 'custom',
  hasText: true,
  label: () => tt('scada.widget.custom'),
  description: () => tt('scada.widget.customDesc'),
  icon: icons.custom,
  category: 'data',
  defaultSize: { w: 240, h: 140 },
  minSize: { w: 40, h: 30 },
  needsBinding: false,
  keepHistory: 60,
  defaultProps: () => ({ html: CUSTOM_TEMPLATE.html, css: CUSTOM_TEMPLATE.css, js: CUSTOM_TEMPLATE.js, bg: '', border: false, radius: 0 }),
  propSchema: [
    // HTML 与 CSS 放在同一个弹窗里编辑，JS 单独一个；都带语法高亮（CodeDialog / CodeEditor）
    { key: 'html', label: () => tt('scada.prop.htmlCss'), type: 'code', parts: [codePart('html'), codePart('css')] },
    { key: 'js', label: () => tt('scada.prop.js'), type: 'code', parts: [codePart('js')] },
    { key: 'bg', label: () => tt('scada.prop.bg'), type: 'color' },
    { key: 'border', label: () => tt('scada.prop.border'), type: 'boolean' },
    { key: 'radius', label: () => tt('scada.prop.radius'), type: 'number', min: 0, max: 100, step: 1 }
  ],
  component: CustomWidget
}

export default CustomWidget
