/**
 * 带语法高亮的代码输入框：透明文字的 <textarea> 叠在高亮好的 <pre> 上（字体 / 内边距 / 换行规则完全一致，
 * 滚动时同步 pre 的 scrollTop / scrollLeft），输入体验就是普通 textarea（原生光标、选区、撤销、虚拟键盘）。
 * Tab 插入两个空格、Shift + Tab 退一级、Enter 保持上一行缩进（{ ( [ 后再多缩一级）；优先用 execCommand 以保留撤销栈，
 * 不支持时退回 setRangeText。父级用 value / onUpdateValue 双向绑定；高度由外层容器决定（本组件 100% 填充）。
 */
import { computed, defineComponent, nextTick, onBeforeUnmount, onMounted, ref, watch, type PropType } from 'vue'
import { CODE_EDITOR_CSS, highlight, type CodeLang } from './highlight'

const STYLE_ATTR = 'data-scada-code-style'
/** 编辑器样式只注入一次（多个编辑器 / 多次打开弹窗共用） */
export const ensureCodeEditorStyle = () => {
  if (typeof document === 'undefined' || document.head.querySelector(`style[${STYLE_ATTR}]`)) return
  const el = document.createElement('style')
  el.setAttribute(STYLE_ATTR, '')
  el.textContent = CODE_EDITOR_CSS
  document.head.appendChild(el)
}

export default defineComponent({
  name: 'ScadaCodeEditor',
  props: {
    value: { type: String, default: '' },
    language: { type: String as PropType<CodeLang>, default: 'js' },
    placeholder: { type: String, default: '' },
    /** 行号模式（脚本编辑器用）：左侧行号槽 + 不自动换行（横向滚动），行号才能和内容逐行对齐 */
    lineNumbers: { type: Boolean, default: false },
    /** 自动换行（默认开启）：长行折行显示、无横向滚动；行号照常显示——用隐藏镜像层量出每个逻辑行折行后的实际高度，行号按行高对齐 */
    wrap: { type: Boolean, default: true }
  },
  emits: {
    updateValue: (_v: string) => true
  },
  setup(props, { emit, expose }) {
    ensureCodeEditorStyle()
    const ta = ref<HTMLTextAreaElement>()
    const pre = ref<HTMLElement>()
    // 行号模式：行数 / 槽宽 / 随内容滚动
    const scrollTop = ref(0)
    const lines = computed(() => (props.value || '').split('\n'))
    const lineCount = computed(() => lines.value.length)
    const gutterW = computed(() => Math.max(34, 16 + String(lineCount.value).length * 8))
    // 自动换行 + 行号：隐藏镜像层按逻辑行分块渲染同样的内容（同字体 / 同宽 / 同折行规则），
    // 量出每个逻辑行折行后的实际高度（getBoundingClientRect 保留小数，避免 19.5px 行高累计漂移），行号按高度逐行排
    const mirror = ref<HTMLElement>()
    const rootEl = ref<HTMLElement>()
    const lineHeights = ref<number[]>([])
    let ro: ResizeObserver | null = null
    const measure = () => {
      if (!(props.lineNumbers && props.wrap) || !mirror.value) {
        if (lineHeights.value.length) lineHeights.value = []
        return
      }
      const kids = mirror.value.children
      const hs: number[] = []
      for (let i = 0; i < kids.length; i++) hs.push(kids[i].getBoundingClientRect().height)
      lineHeights.value = hs
    }
    watch(() => [props.value, props.wrap, props.lineNumbers], () => nextTick(measure))
    onMounted(() => {
      measure()
      if (typeof ResizeObserver !== 'undefined' && rootEl.value) {
        ro = new ResizeObserver(() => measure())
        ro.observe(rootEl.value)
      }
    })
    onBeforeUnmount(() => { if (ro) ro.disconnect() })
    // 末尾是换行时补一个空格，否则 pre 不会为最后的空行留出高度，滚到底会和 textarea 错位
    const html = computed(() => {
      const v = props.value || ''
      return highlight(v.endsWith('\n') ? v + ' ' : v, props.language)
    })
    const sync = () => {
      if (!pre.value || !ta.value) return
      pre.value.scrollTop = ta.value.scrollTop
      pre.value.scrollLeft = ta.value.scrollLeft
      scrollTop.value = ta.value.scrollTop
    }
    const onInput = (e: Event) => emit('updateValue', (e.target as HTMLTextAreaElement).value)

    /** 在光标 / 选区处插入文本，尽量走 execCommand 保住原生撤销 */
    const insertText = (el: HTMLTextAreaElement, text: string) => {
      let done = false
      try {
        el.focus()
        done = typeof document.execCommand === 'function' && document.execCommand('insertText', false, text)
      } catch (err) {
        done = false
      }
      if (!done) {
        const s = el.selectionStart
        const e = el.selectionEnd
        el.setRangeText(text, s, e, 'end')
      }
      emit('updateValue', el.value)
      requestAnimationFrame(sync)
    }
    const outdent = (el: HTMLTextAreaElement) => {
      const s = el.selectionStart
      const lineStart = el.value.lastIndexOf('\n', s - 1) + 1
      const lead = /^ {1,2}/.exec(el.value.slice(lineStart, lineStart + 2))
      if (!lead) return
      el.setSelectionRange(lineStart, lineStart + lead[0].length)
      insertText(el, '')
      const pos = Math.max(lineStart, s - lead[0].length)
      el.setSelectionRange(pos, pos)
    }
    const onKeydown = (e: KeyboardEvent) => {
      const el = e.target as HTMLTextAreaElement
      if (!el || el.tagName !== 'TEXTAREA') return
      if (e.key === 'Tab' && !e.ctrlKey && !e.altKey && !e.metaKey) {
        e.preventDefault()
        if (e.shiftKey) outdent(el)
        else insertText(el, '  ')
        return
      }
      if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && !e.isComposing) {
        const s = el.selectionStart
        const lineStart = el.value.lastIndexOf('\n', s - 1) + 1
        const indent = (/^[ \t]*/.exec(el.value.slice(lineStart, s)) || [''])[0]
        const before = el.value.slice(0, s).trimEnd()
        const extra = /[{([]$/.test(before) ? '  ' : ''
        if (indent || extra) {
          e.preventDefault()
          insertText(el, '\n' + indent + extra)
        }
      }
    }

    // 脚本编辑器需要直接操作原生 textarea（剪贴板 / 缩进 / 查找选区等）
    expose({ textarea: ta })

    return () => {
      const ln = props.lineNumbers
      const wrapOn = props.wrap
      const side = ln ? { left: gutterW.value + 'px', whiteSpace: (wrapOn ? 'pre-wrap' : 'pre') as 'pre-wrap' | 'pre' } : undefined
      return (
        <div ref={rootEl} class={'scada-code-editor w-full h-full rounded border border-solid border-gray-300 overflow-hidden'} data-code-editor={props.language}>
          {ln && (
            <div class={'scada-code-gutter'} style={{ width: gutterW.value + 'px' }} aria-hidden="true">
              {wrapOn ? (
                // 自动换行：每个行号占它所属逻辑行折行后的实际高度（镜像层量出），数字对齐在该行的第一个视觉行
                <div class={'scada-code-gutter-in'} style={{ transform: `translateY(${-scrollTop.value}px)` }}>
                  {lines.value.map((_, i) => (
                    <div key={i} style={{ height: (lineHeights.value[i] || 0) + 'px', overflow: 'hidden' }}>{i + 1}</div>
                  ))}
                </div>
              ) : (
                <pre class={'scada-code-gutter-in'} style={{ transform: `translateY(${-scrollTop.value}px)` }}>
                  {Array.from({ length: lineCount.value }, (_, i) => i + 1).join('\n')}
                </pre>
              )}
            </div>
          )}
          {ln && wrapOn && (
            // 隐藏镜像层：和高亮层同类名（同字体 / 内边距 / 折行规则 / scrollbar-gutter），逐逻辑行分块以便测量
            <div ref={mirror} class={'scada-code-pre'} style={{ left: gutterW.value + 'px', visibility: 'hidden' }} aria-hidden="true">
              {lines.value.map((l, i) => (
                <div key={i}>{l || ' '}</div>
              ))}
            </div>
          )}
          <pre ref={pre} class={'scada-code-pre'} style={side} aria-hidden="true" innerHTML={html.value} />
          <textarea
            ref={ta}
            class={'scada-code-ta'}
            style={side}
            value={props.value}
            placeholder={props.placeholder}
            spellcheck={false}
            autocapitalize="off"
            autocomplete="off"
            wrap={ln && !wrapOn ? 'off' : 'soft'}
            onInput={onInput}
            onScroll={sync}
            onKeydown={onKeydown}
          />
        </div>
      )
    }
  }
})
