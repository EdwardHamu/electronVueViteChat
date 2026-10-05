/**
 * 自定义组件代码编辑器用的轻量语法高亮（HTML / CSS / JS），不依赖第三方库。
 * highlight(code, lang) 返回已转义的 HTML 字符串，token 用 <span class="tok-xxx"> 包起来；
 * 配色见 CODE_EDITOR_CSS（浅色主题，参考 VS Code Light）。分词是近似的：目标是“看得清结构”，不是完整的语法分析，
 * 任何异常都会退回纯转义文本，绝不会让编辑器挂掉。HTML 里的 <style> / <script> 内容分别按 CSS / JS 高亮。
 */
export type CodeLang = 'html' | 'css' | 'js'

interface Tok {
  t: string
  c?: string
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const JS_KEYWORDS = new Set(
  'var let const function return if else for while do break continue new delete typeof instanceof in of switch case default throw try catch finally class extends super this null undefined true false void yield async await import export from as debugger with static get set NaN Infinity'.split(
    ' '
  )
)
const JS_VALUE_KEYWORDS = new Set(['this', 'null', 'undefined', 'true', 'false', 'super', 'NaN', 'Infinity'])
const JS_BUILTINS = new Set(
  'scada document window console Math JSON Number String Boolean Array Object Date parseInt parseFloat isNaN isFinite setTimeout setInterval clearTimeout clearInterval requestAnimationFrame cancelAnimationFrame fetch Promise Map Set WeakMap Error RegExp localStorage sessionStorage alert Symbol Intl'.split(
    ' '
  )
)
const JS_OPERATOR = /^(?:>>>=|===|!==|\*\*=|&&=|\|\|=|\?\?=|<<=|>>=|>>>|=>|==|!=|<=|>=|&&|\|\||\?\?|\*\*|\+\+|--|[+\-*/%&|^]=|<<|>>|[+\-*/%&|^!~<>=?:])/
const JS_NUMBER = /^(?:0[xX][0-9a-fA-F_]+|0[bB][01_]+|0[oO][0-7_]+|(?:\d[\d_]*\.?[\d_]*|\.\d[\d_]*)(?:[eE][+-]?\d+)?)n?/
const isSpace = (ch: string) => ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === '\f' || ch === '\v'
const isIdentStart = (ch: string) => /[A-Za-z_$\u00a0-\uffff]/.test(ch)
const isIdent = (ch: string) => /[\w$\u00a0-\uffff]/.test(ch)

/** 读一段引号字符串（含转义），单 / 双引号到行尾为止，反引号可跨行 */
const readString = (src: string, i: number): number => {
  const q = src[i]
  const n = src.length
  let j = i + 1
  while (j < n) {
    const c = src[j]
    if (c === '\\') {
      j += 2
      continue
    }
    if (c === q) return j + 1
    if (q !== '`' && c === '\n') return j
    j++
  }
  return n
}

const pushWs = (src: string, i: number, out: Tok[]): number => {
  let j = i
  while (j < src.length && isSpace(src[j])) j++
  out.push({ t: src.slice(i, j) })
  return j
}

function tokenizeJs(src: string, out: Tok[]) {
  const n = src.length
  let i = 0
  /** 上一个有意义的 token 类型，用来判断 / 是除号还是正则 */
  let prev = ''
  while (i < n) {
    const ch = src[i]
    if (isSpace(ch)) {
      i = pushWs(src, i, out)
      continue
    }
    if (ch === '/' && src[i + 1] === '/') {
      let j = src.indexOf('\n', i)
      if (j < 0) j = n
      out.push({ t: src.slice(i, j), c: 'comment' })
      i = j
      continue
    }
    if (ch === '/' && src[i + 1] === '*') {
      let j = src.indexOf('*/', i + 2)
      j = j < 0 ? n : j + 2
      out.push({ t: src.slice(i, j), c: 'comment' })
      i = j
      continue
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      const j = readString(src, i)
      out.push({ t: src.slice(i, j), c: 'string' })
      i = j
      prev = 'value'
      continue
    }
    if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(src[i + 1] || ''))) {
      const m = JS_NUMBER.exec(src.slice(i))
      const t = m ? m[0] : ch
      out.push({ t, c: 'number' })
      i += t.length
      prev = 'value'
      continue
    }
    if (isIdentStart(ch)) {
      let j = i + 1
      while (j < n && isIdent(src[j])) j++
      const word = src.slice(i, j)
      let k = j
      while (k < n && (src[k] === ' ' || src[k] === '\t')) k++
      const call = src[k] === '('
      let c: string | undefined
      if (prev === '.') c = call ? 'function' : 'prop'
      else if (JS_KEYWORDS.has(word)) c = 'keyword'
      else if (JS_BUILTINS.has(word)) c = 'builtin'
      else if (call) c = 'function'
      out.push({ t: word, c })
      i = j
      prev = c === 'keyword' && !JS_VALUE_KEYWORDS.has(word) ? 'keyword' : 'value'
      continue
    }
    if (ch === '/' && prev !== 'value') {
      // 正则字面量：到同一行里下一个未转义、不在 [] 内的 / 为止
      let j = i + 1
      let inClass = false
      while (j < n && src[j] !== '\n') {
        const d = src[j]
        if (d === '\\') {
          j += 2
          continue
        }
        if (d === '[') inClass = true
        else if (d === ']') inClass = false
        else if (d === '/' && !inClass) break
        j++
      }
      if (j < n && src[j] === '/') {
        j++
        while (j < n && /[dgimsuvy]/.test(src[j])) j++
        out.push({ t: src.slice(i, j), c: 'regex' })
        i = j
        prev = 'value'
        continue
      }
    }
    if (ch === '.') {
      out.push({ t: ch, c: 'punct' })
      i++
      prev = '.'
      continue
    }
    if ('{}()[];,'.includes(ch)) {
      out.push({ t: ch, c: 'punct' })
      i++
      prev = ch === ')' || ch === ']' ? 'value' : 'punct'
      continue
    }
    const om = JS_OPERATOR.exec(src.slice(i))
    if (om) {
      out.push({ t: om[0], c: 'operator' })
      i += om[0].length
      prev = 'operator'
      continue
    }
    out.push({ t: ch })
    i++
    prev = 'punct'
  }
}

function tokenizeCss(src: string, out: Tok[]) {
  const n = src.length
  let i = 0
  let depth = 0
  let inValue = false
  while (i < n) {
    const ch = src[i]
    if (isSpace(ch)) {
      i = pushWs(src, i, out)
      continue
    }
    if (ch === '/' && src[i + 1] === '*') {
      let j = src.indexOf('*/', i + 2)
      j = j < 0 ? n : j + 2
      out.push({ t: src.slice(i, j), c: 'comment' })
      i = j
      continue
    }
    if (ch === '"' || ch === "'") {
      const j = readString(src, i)
      out.push({ t: src.slice(i, j), c: 'string' })
      i = j
      continue
    }
    if (ch === '{') {
      out.push({ t: ch, c: 'punct' })
      depth++
      inValue = false
      i++
      continue
    }
    if (ch === '}') {
      out.push({ t: ch, c: 'punct' })
      depth = Math.max(0, depth - 1)
      inValue = false
      i++
      continue
    }
    if (ch === ';') {
      out.push({ t: ch, c: 'punct' })
      inValue = false
      i++
      continue
    }
    if (ch === '@') {
      const m = /^@[\w-]+/.exec(src.slice(i))
      const t = m ? m[0] : ch
      out.push({ t, c: 'atrule' })
      i += t.length
      continue
    }
    const rest = src.slice(i)
    if (!inValue) {
      // 到下一个 { ; } 之前如果先碰到 {，这一段是选择器（含 @media 内嵌套规则），否则是属性名
      const stop = rest.search(/[{;}]/)
      const selectorMode = depth === 0 || (stop >= 0 && rest[stop] === '{')
      if (selectorMode) {
        const m = /^[^{},;/"'\s]+/.exec(rest)
        if (m) {
          out.push({ t: m[0], c: 'selector' })
          i += m[0].length
          continue
        }
      } else {
        if (ch === ':') {
          out.push({ t: ch, c: 'punct' })
          inValue = true
          i++
          continue
        }
        const m = /^[\w-]+/.exec(rest)
        if (m) {
          out.push({ t: m[0], c: 'cssprop' })
          i += m[0].length
          continue
        }
      }
      out.push({ t: ch, c: 'punct' })
      i++
      continue
    }
    // 声明值
    let m: RegExpExecArray | null
    if (ch === '#' && (m = /^#[0-9a-fA-F]{3,8}\b/.exec(rest))) {
      out.push({ t: m[0], c: 'number' })
      i += m[0].length
      continue
    }
    if (ch === '!' && (m = /^!\s*important\b/i.exec(rest))) {
      out.push({ t: m[0], c: 'keyword' })
      i += m[0].length
      continue
    }
    if ((m = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?(?:%|[a-zA-Z]+)?/.exec(rest))) {
      out.push({ t: m[0], c: 'number' })
      i += m[0].length
      continue
    }
    if ((m = /^[\w-]+(?=\()/.exec(rest))) {
      out.push({ t: m[0], c: 'function' })
      i += m[0].length
      continue
    }
    if ((m = /^[\w-]+/.exec(rest))) {
      out.push({ t: m[0], c: 'value' })
      i += m[0].length
      continue
    }
    out.push({ t: ch, c: 'punct' })
    i++
  }
}

function tokenizeHtml(src: string, out: Tok[]) {
  const n = src.length
  let i = 0
  while (i < n) {
    const ch = src[i]
    if (ch === '<' && src.startsWith('<!--', i)) {
      let j = src.indexOf('-->', i + 4)
      j = j < 0 ? n : j + 3
      out.push({ t: src.slice(i, j), c: 'comment' })
      i = j
      continue
    }
    if (ch === '<' && src[i + 1] === '!') {
      let j = src.indexOf('>', i)
      j = j < 0 ? n : j + 1
      out.push({ t: src.slice(i, j), c: 'doctype' })
      i = j
      continue
    }
    const tm = ch === '<' ? /^<\/?[A-Za-z][\w:-]*/.exec(src.slice(i)) : null
    if (tm) {
      const closing = tm[0][1] === '/'
      const name = tm[0].slice(closing ? 2 : 1)
      out.push({ t: closing ? '</' : '<', c: 'punct' })
      out.push({ t: name, c: 'tag' })
      i += tm[0].length
      // 属性区
      let selfClosed = false
      while (i < n) {
        const d = src[i]
        if (isSpace(d)) {
          i = pushWs(src, i, out)
          continue
        }
        if (d === '>' || src.startsWith('/>', i)) {
          const t = d === '>' ? '>' : '/>'
          selfClosed = t === '/>'
          out.push({ t, c: 'punct' })
          i += t.length
          break
        }
        if (d === '=') {
          out.push({ t: d, c: 'punct' })
          i++
          continue
        }
        if (d === '"' || d === "'") {
          const j = readString(src, i)
          out.push({ t: src.slice(i, j), c: 'string' })
          i = j
          continue
        }
        const am = /^[^\s=/>"']+/.exec(src.slice(i))
        if (am) {
          // 等号后面的裸值也算字符串
          const last = out.slice().reverse().find(x => x.t.trim())
          out.push({ t: am[0], c: last && last.t === '=' ? 'string' : 'attr' })
          i += am[0].length
          continue
        }
        out.push({ t: d, c: 'punct' })
        i++
      }
      const lower = name.toLowerCase()
      if (!closing && !selfClosed && (lower === 'style' || lower === 'script')) {
        const endRe = new RegExp('</' + lower + '\\b', 'i')
        const m = endRe.exec(src.slice(i))
        const j = m ? i + m.index : n
        if (j > i) {
          if (lower === 'style') tokenizeCss(src.slice(i, j), out)
          else tokenizeJs(src.slice(i, j), out)
        }
        i = j
      }
      continue
    }
    if (ch === '&') {
      const m = /^&(?:#\d+|#x[0-9a-fA-F]+|[A-Za-z][\w]*);/.exec(src.slice(i))
      if (m) {
        out.push({ t: m[0], c: 'entity' })
        i += m[0].length
        continue
      }
    }
    let j = i + 1
    while (j < n && src[j] !== '<' && src[j] !== '&') j++
    out.push({ t: src.slice(i, j) })
    i = j
  }
}

/** 把代码转成高亮 HTML（已转义）；出错时退回纯转义文本 */
export const highlight = (code: string, lang: CodeLang): string => {
  const src = String(code ?? '')
  try {
    const toks: Tok[] = []
    if (lang === 'html') tokenizeHtml(src, toks)
    else if (lang === 'css') tokenizeCss(src, toks)
    else tokenizeJs(src, toks)
    let html = ''
    let covered = 0
    for (const tk of toks) {
      covered += tk.t.length
      html += tk.c ? `<span class="tok-${tk.c}">${esc(tk.t)}</span>` : esc(tk.t)
    }
    // 分词结果必须与原文等长，否则退回纯文本（保证与 textarea 逐字对齐）
    if (covered !== src.length) return esc(src)
    return html
  } catch (err) {
    console.warn('[scada] highlight failed', err)
    return esc(src)
  }
}

/**
 * 编辑器 + token 配色（一次性注入 <head>，见 CodeEditor.tsx）。
 * pre 与 textarea 必须逐字对齐：同样的字体 / 内边距 / 换行规则，scrollbar-gutter: stable 让两者都预留滚动条位置（否则 textarea 出现滚动条后换行宽度会和 pre 不一样）。
 */
export const CODE_EDITOR_CSS = `
.scada-code-editor{position:relative;font-family:ui-monospace,Consolas,"Cascadia Mono","Courier New",monospace;font-size:13px;line-height:1.5;tab-size:2;-moz-tab-size:2;background:#fff}
.scada-code-pre,.scada-code-ta{position:absolute;inset:0;margin:0;padding:8px 10px;border:0;font:inherit;line-height:inherit;letter-spacing:inherit;word-spacing:inherit;text-indent:0;tab-size:inherit;-moz-tab-size:inherit;white-space:pre-wrap;overflow-wrap:break-word;word-break:normal;box-sizing:border-box;text-align:left;scrollbar-gutter:stable}
.scada-code-pre{pointer-events:none;color:#1f2937;background:transparent;overflow:hidden}
.scada-code-ta{color:transparent;-webkit-text-fill-color:transparent;caret-color:#111827;background:transparent;resize:none;outline:none;overflow:auto;z-index:1}
.scada-code-ta::placeholder{color:#9ca3af;-webkit-text-fill-color:#9ca3af}
.scada-code-ta::selection{background:rgba(59,130,246,.28)}
.tok-comment{color:#008000;font-style:italic}.tok-string{color:#a31515}.tok-number{color:#098658}.tok-keyword{color:#0000ff}.tok-builtin{color:#267f99}
.tok-function{color:#795e26}.tok-prop{color:#001080}.tok-regex{color:#811f3f}.tok-operator{color:#374151}.tok-punct{color:#4b5563}
.tok-tag{color:#800000}.tok-attr{color:#e50000}.tok-entity{color:#0000ff}.tok-doctype{color:#6b7280}
.tok-selector{color:#800000}.tok-cssprop{color:#e50000}.tok-value{color:#0451a5}.tok-atrule{color:#af00db}
.scada-code-gutter{position:absolute;top:0;bottom:0;left:0;overflow:hidden;background:#f3f4f6;border-right:1px solid #e5e7eb;z-index:2;pointer-events:none}
.scada-code-gutter-in{margin:0;padding:8px 6px 8px 0;font:inherit;line-height:inherit;color:#9ca3af;text-align:right;white-space:pre}
`
