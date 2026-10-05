/**
 * 脚本编辑器弹窗（参考传统组态软件的脚本程序窗口）：
 * 左侧带行号的高亮编辑区，右侧查找 / 替换 + 可插入对象树（双击插入到光标处）；
 * 工具栏：保存 / 剪切 / 复制 / 粘贴 / 撤销 / 恢复 / 缩进 / 退格 / 注释 / 检查 /
 *        语句块 / 运算符 / 括号 / 插入注释 / 内部变量（变量管理）/ 帮助。
 * 快捷键：Ctrl+S 保存、Ctrl+F 查找、Ctrl+R 替换、Ctrl+I 缩进、Ctrl+B 退格、
 *        Ctrl+' 注释、Ctrl+E 检查、Ctrl+D 删除选中、Ctrl+H 帮助（撤销恢复剪贴板为编辑区原生）。
 * 从全局脚本 / 数据处理函数 / 自定义组件代码弹窗的「打开脚本编辑器」按钮进入，
 * 「保存」把内容写回原弹窗的草稿（仍需在原弹窗点确定才落盘）。
 */
import { NButton, NCheckbox, NDropdown, NInput, NModal, NScrollbar, NTree, type DropdownOption, type TreeOption } from 'naive-ui'
import { computed, defineComponent, reactive, ref, watch, type PropType } from 'vue'
import CodeEditor from './CodeEditor'
import { openScriptHelp } from './ScriptHelpDialog'
import { compileScript } from './scripts'
import { compileTransform } from './transform'
import { useScadaStore } from './store'
import { tt } from './widgets/common'

export type EditorMode = 'script' | 'transform' | 'plain'

const BLOCKS: Array<{ key: string; label: string; code: string }> = [
  { key: 'ifelse', label: 'if - else', code: 'if (cond) {\n  \n} else {\n  \n}' },
  { key: 'if', label: 'if', code: 'if (cond) {\n  \n}' },
  { key: 'while', label: 'while', code: 'while (cond) {\n  \n}' },
  { key: 'for', label: 'for', code: 'for (let i = 0; i < 10; i++) {\n  \n}' },
  { key: 'trycatch', label: 'try - catch', code: 'try {\n  \n} catch (e) {\n  \n}' },
  { key: 'exit', label: 'return', code: 'return' }
]
const OPERATORS = ['+', '-', '*', '/', '%', '=', '==', '===', '!=', '!==', '>', '<', '>=', '<=', '&&', '||', '!', '? :']

export default defineComponent({
  name: 'ScadaScriptEditorDialog',
  props: {
    show: { type: Boolean, default: false },
    value: { type: String, default: '' },
    title: { type: String, default: '' },
    mode: { type: String as PropType<EditorMode>, default: 'script' }
  },
  emits: {
    close: () => true,
    save: (_v: string) => true
  },
  setup(props, { emit }) {
    const scada = useScadaStore()
    const draft = ref('')
    const edRef = ref<{ textarea?: HTMLTextAreaElement }>()
    const find = reactive({ text: '', replace: '', whole: false, count: -1 })
    const checkMsg = ref<{ ok: boolean; text: string } | null>(null)
    const findInputRef = ref<{ focus?: () => void }>()
    const replaceInputRef = ref<{ focus?: () => void }>()

    watch(
      () => props.show,
      show => {
        if (show) {
          draft.value = props.value
          checkMsg.value = null
          find.count = -1
        }
      },
      { immediate: true }
    )

    const el = () => edRef.value?.textarea
    const msg = (kind: 'success' | 'warning' | 'error', text: string) => {
      const m = window.$message as unknown as Record<string, ((t: string) => void) | undefined> | undefined
      const f = m && m[kind]
      if (f) f(text)
    }

    /** 在光标 / 选区处插入文本（优先 execCommand 保住原生撤销栈） */
    const insertText = (text: string) => {
      const t = el()
      if (!t) return
      t.focus()
      let done = false
      try {
        done = typeof document.execCommand === 'function' && document.execCommand('insertText', false, text)
      } catch (err) {
        done = false
      }
      if (!done) {
        t.setRangeText(text, t.selectionStart, t.selectionEnd, 'end')
        draft.value = t.value
      }
    }
    const selectedText = () => {
      const t = el()
      return t ? t.value.slice(t.selectionStart, t.selectionEnd) : ''
    }

    // ---------------- 剪贴板 / 撤销恢复 ----------------
    const doCopy = () => {
      const s = selectedText()
      if (!s) return
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(s).catch(() => {})
      else document.execCommand('copy')
      el()?.focus()
    }
    const doCut = () => {
      const s = selectedText()
      if (!s) return
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(s).catch(() => {})
      insertText('')
    }
    const doPaste = () => {
      const t = el()
      if (!t) return
      if (navigator.clipboard && navigator.clipboard.readText) {
        navigator.clipboard.readText().then(s => { if (s) insertText(s) }).catch(() => { t.focus(); document.execCommand('paste') })
      } else {
        t.focus()
        document.execCommand('paste')
      }
    }
    const doUndo = () => { el()?.focus(); document.execCommand('undo') }
    const doRedo = () => { el()?.focus(); document.execCommand('redo') }

    // ---------------- 行级操作：缩进 / 退格 / 注释 ----------------
    /** 对选中的整行做变换：选中整行范围 → insertText 替换（可撤销）→ 恢复选区 */
    const transformLines = (fn: (lines: string[]) => string[]) => {
      const t = el()
      if (!t) return
      const v = t.value
      const s0 = t.selectionStart
      const e0 = t.selectionEnd
      const ls = v.lastIndexOf('\n', s0 - 1) + 1
      let le = v.indexOf('\n', Math.max(e0 - 1, s0))
      if (le === -1) le = v.length
      const block = v.slice(ls, le)
      const out = fn(block.split('\n')).join('\n')
      if (out === block) return
      t.setSelectionRange(ls, le)
      insertText(out)
      t.setSelectionRange(ls, ls + out.length)
    }
    const doIndent = () => transformLines(lines => lines.map(l => '  ' + l))
    const doOutdent = () => transformLines(lines => lines.map(l => l.replace(/^ {1,2}/, '')))
    const doComment = () =>
      transformLines(lines => {
        const content = lines.filter(l => l.trim())
        const allCommented = content.length > 0 && content.every(l => l.trimStart().startsWith('//'))
        return allCommented
          ? lines.map(l => l.replace(/^(\s*)\/\/ ?/, '$1'))
          : lines.map(l => (l.trim() ? '// ' + l : l))
      })

    // ---------------- 检查 ----------------
    const doCheck = () => {
      const r = props.mode === 'transform' ? compileTransform(draft.value) : compileScript(draft.value)
      if (r.error) {
        checkMsg.value = { ok: false, text: r.error }
        msg('error', r.error)
      } else {
        checkMsg.value = { ok: true, text: tt('scada.editor.checkOk') }
        msg('success', tt('scada.editor.checkOk'))
      }
    }

    // ---------------- 查找 / 替换 ----------------
    const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const matcher = () => (find.text ? new RegExp(find.whole ? `\\b${escapeRe(find.text)}\\b` : escapeRe(find.text), 'g') : null)
    const countMatches = () => {
      const re = matcher()
      if (!re) return 0
      const m = draft.value.match(re)
      return m ? m.length : 0
    }
    const doFindNext = () => {
      const t = el()
      const re = matcher()
      if (!t || !re) return
      find.count = countMatches()
      if (!find.count) return
      re.lastIndex = t.selectionEnd
      let m = re.exec(t.value)
      if (!m) {
        re.lastIndex = 0
        m = re.exec(t.value) // 回绕到开头
      }
      if (m) {
        t.focus()
        t.setSelectionRange(m.index, m.index + m[0].length)
      }
    }
    const doReplaceOne = () => {
      const t = el()
      const re = matcher()
      if (!t || !re) return
      const sel = selectedText()
      re.lastIndex = 0
      const selIsMatch = sel && re.test(sel) && sel.replace(matcher()!, '') === '' // 选区整体就是一个匹配
      if (selIsMatch) insertText(find.replace)
      doFindNext()
    }
    const doReplaceAll = () => {
      const t = el()
      const re = matcher()
      if (!t || !re) return
      const n = countMatches()
      if (!n) { find.count = 0; return }
      const out = t.value.replace(re, find.replace)
      t.focus()
      t.setSelectionRange(0, t.value.length)
      insertText(out)
      find.count = 0
      msg('success', `${tt('scada.editor.replaceAll')}: ${n}`)
    }

    // ---------------- 可插入对象树（双击插入） ----------------
    const treeData = computed<TreeOption[]>(() => {
      const mode = props.mode
      if (mode === 'plain') return []
      const api: TreeOption[] =
        mode === 'script'
          ? [
              { key: 'a1', label: "scada.read('key')", insert: "scada.read('var1')" },
              { key: 'a2', label: "scada.value('key')", insert: "scada.value('var1')" },
              { key: 'a3', label: "scada.write('key', v)", insert: "scada.write('var1', 1)" },
              { key: 'a4', label: "scada.getProp(id, 'prop')", insert: "scada.getProp('', '')" },
              { key: 'a5', label: "scada.setProp(id, 'prop', v)", insert: "scada.setProp('', '', '')" },
              { key: 'a6', label: 'scada.state', insert: 'scada.state' },
              { key: 'a7', label: 'scada.log(...)', insert: 'scada.log()' }
            ]
          : [
              { key: 'a1', label: "ctx.get('key')", insert: "ctx.get('var1')" },
              { key: 'a2', label: "ctx.setProp('prop', v)", insert: "ctx.setProp('', '')" },
              { key: 'a3', label: 'ctx.widget.props', insert: 'ctx.widget.props' },
              { key: 'a4', label: 'ctx.state', insert: 'ctx.state' },
              { key: 'a5', label: 'ctx.prev', insert: 'ctx.prev' },
              { key: 'a6', label: 'value', insert: 'value' },
              { key: 'a7', label: 'point', insert: 'point' }
            ]
      const widgets: TreeOption[] = scada.current.widgets.map(w => ({
        key: 'w:' + w.id,
        label: `${w.title || w.type} · ${w.id}`,
        insert: `'${w.id}'`,
        children: Object.keys(w.props || {}).map(k => ({
          key: `w:${w.id}:${k}`,
          label: k,
          insert: mode === 'script' ? `scada.getProp('${w.id}', '${k}')` : `ctx.setProp('${k}', '')`
        }))
      })) as TreeOption[]
      const vars: TreeOption[] = scada.variables.map(v => ({
        key: 'v:' + v.key,
        label: (v.name || '').trim() ? `${v.name} · ${v.key}` : v.key,
        insert: mode === 'script' ? `scada.read('${v.key}', 'local')` : `ctx.get('${v.key}', 'local')`
      })) as TreeOption[]
      return [
        { key: 'api', label: tt('scada.editor.api'), children: api },
        { key: 'widgets', label: tt('scada.editor.widgets'), children: widgets },
        { key: 'vars', label: tt('scada.editor.localVars'), children: vars }
      ] as TreeOption[]
    })
    const nodeProps = ({ option }: { option: TreeOption & { insert?: string } }) => ({
      ondblclick: () => { if (option.insert) insertText(option.insert) },
      title: option.insert || '',
      style: option.insert ? { cursor: 'pointer' } : undefined
    })

    // ---------------- 保存 / 快捷键 ----------------
    const doSave = () => {
      emit('save', draft.value)
      msg('success', tt('scada.editor.saved'))
    }
    const apply = () => {
      emit('save', draft.value)
      emit('close')
    }
    const onKeydown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return
      const k = e.key.toLowerCase()
      const run = (fn: () => void) => { e.preventDefault(); e.stopPropagation(); fn() }
      if (k === 's') run(doSave)
      else if (k === 'f') run(() => findInputRef.value?.focus?.())
      else if (k === 'r') run(() => replaceInputRef.value?.focus?.())
      else if (k === 'i') run(doIndent)
      else if (k === 'b') run(doOutdent)
      else if (k === "'") run(doComment)
      else if (k === 'e') run(doCheck)
      else if (k === 'd') run(() => insertText(''))
      else if (k === 'h') run(() => openScriptHelp('editor'))
    }

    const blockOptions: DropdownOption[] = BLOCKS.map(b => ({ key: b.key, label: b.label }))
    const operatorOptions: DropdownOption[] = OPERATORS.map(o => ({ key: o, label: o }))

    const tbtn = (label: string, onClick: () => void, titleText?: string) => (
      <NButton size="tiny" quaternary onClick={onClick} title={titleText || label}>
        {label}
      </NButton>
    )
    const sep = () => <div class={'w-px h-4 bg-gray-300 mx-0.5 shrink-0'} />

    return () => (
      <NModal
        show={props.show}
        preset="card"
        title={`${tt('scada.editor.title')}${props.title ? ' · ' + props.title : ''}`}
        closable
        maskClosable={false}
        autoFocus={false}
        trapFocus={false}
        style={{ width: 'min(980px, 97vw)' }}
        contentStyle={{ padding: '8px 14px 10px' }}
        footerStyle={{ padding: '8px 14px 12px' }}
        onUpdateShow={(v: boolean) => { if (!v) emit('close') }}
      >
        {{
          default: () => (
            <div class={'flex flex-col gap-2'} onKeydown={onKeydown} data-script-editor>
              {/* 工具栏 */}
              <div class={'flex items-center gap-0.5 flex-wrap'}>
                {tbtn(tt('scada.editor.save'), doSave, tt('scada.editor.save') + ' Ctrl+S')}
                {sep()}
                {tbtn(tt('scada.editor.cut'), doCut, tt('scada.editor.cut') + ' Ctrl+X')}
                {tbtn(tt('scada.editor.copy'), doCopy, tt('scada.editor.copy') + ' Ctrl+C')}
                {tbtn(tt('scada.editor.paste'), doPaste, tt('scada.editor.paste') + ' Ctrl+V')}
                {sep()}
                {tbtn(tt('scada.editor.undo'), doUndo, tt('scada.editor.undo') + ' Ctrl+Z')}
                {tbtn(tt('scada.editor.redo'), doRedo, tt('scada.editor.redo') + ' Ctrl+Y')}
                {sep()}
                {tbtn(tt('scada.editor.indent'), doIndent, tt('scada.editor.indent') + ' Ctrl+I')}
                {tbtn(tt('scada.editor.outdent'), doOutdent, tt('scada.editor.outdent') + ' Ctrl+B')}
                {tbtn(tt('scada.editor.comment'), doComment, tt('scada.editor.comment') + " Ctrl+'")}
                {sep()}
                {tbtn(tt('scada.editor.check'), doCheck, tt('scada.editor.check') + ' Ctrl+E')}
                {sep()}
                <NDropdown trigger="click" options={blockOptions} onSelect={(k: string) => { const b = BLOCKS.find(x => x.key === k); if (b) insertText(b.code) }}>
                  <NButton size="tiny" quaternary>{tt('scada.editor.block')}</NButton>
                </NDropdown>
                <NDropdown trigger="click" options={operatorOptions} onSelect={(k: string) => insertText(` ${k} `)}>
                  <NButton size="tiny" quaternary>{tt('scada.editor.operator')}</NButton>
                </NDropdown>
                {tbtn('( )', () => { const s = selectedText(); insertText(`(${s})`) }, tt('scada.editor.bracket'))}
                {tbtn('//', () => { const s = selectedText(); insertText(s ? `/* ${s} */` : '// ') }, tt('scada.editor.insertComment'))}
                {sep()}
                {tbtn(tt('scada.editor.variables'), () => (scada.varsShow = true))}
                {tbtn(tt('scada.editor.help'), () => openScriptHelp('editor'), tt('scada.editor.help') + ' Ctrl+H')}
              </div>
              {/* 编辑区 + 右侧查找/对象树 */}
              <div class={'flex gap-2'} style={{ height: 'min(440px, 56vh)' }}>
                <div class={'flex-1 min-w-0'}>
                  <CodeEditor ref={edRef} value={draft.value} language="js" lineNumbers placeholder={'// JS'} onUpdateValue={(v: string) => (draft.value = v)} />
                </div>
                <div class={'w-[250px] shrink-0 flex flex-col gap-1.5 min-h-0'}>
                  <div class={'text-xs text-gray-600'}>{tt('scada.editor.find')}</div>
                  <div class={'flex gap-1'}>
                    <NInput ref={findInputRef} size="small" class={'flex-1 min-w-0'} value={find.text} placeholder={tt('scada.editor.searchPlaceholder')}
                      onUpdateValue={(v: string) => { find.text = v; find.count = -1 }} onKeydown={(e: KeyboardEvent) => { if (e.key === 'Enter') doFindNext() }} />
                    <NButton size="small" onClick={doFindNext} disabled={!find.text}>{tt('scada.editor.findNext')}</NButton>
                  </div>
                  <div class={'flex gap-1'}>
                    <NInput ref={replaceInputRef} size="small" class={'flex-1 min-w-0'} value={find.replace} placeholder={tt('scada.editor.replacePlaceholder')}
                      onUpdateValue={(v: string) => (find.replace = v)} />
                    <NButton size="small" onClick={doReplaceOne} disabled={!find.text}>{tt('scada.editor.replaceOne')}</NButton>
                    <NButton size="small" onClick={doReplaceAll} disabled={!find.text}>{tt('scada.editor.replaceAll')}</NButton>
                  </div>
                  <div class={'flex items-center justify-between'}>
                    <NCheckbox size="small" checked={find.whole} onUpdateChecked={(v: boolean) => { find.whole = v; find.count = -1 }}>
                      <span class={'text-xs'}>{tt('scada.editor.wholeWord')}</span>
                    </NCheckbox>
                    <span class={'text-xs text-gray-500'}>{find.count >= 0 ? `${tt('scada.editor.found')}: ${find.count}` : ''}</span>
                  </div>
                  {props.mode !== 'plain' && (
                    <>
                      <div class={'text-xs text-gray-600 mt-1'}>{tt('scada.editor.objects')}</div>
                      <div class={'flex-1 min-h-0 border border-solid border-gray-200 rounded'}>
                        <NScrollbar class={'h-full'}>
                          <NTree blockLine selectable={false} data={treeData.value} nodeProps={nodeProps as never} />
                        </NScrollbar>
                      </div>
                    </>
                  )}
                </div>
              </div>
              {/* 状态栏：检查结果 */}
              {checkMsg.value && (
                <div class={['text-xs break-all', checkMsg.value.ok ? 'text-green-600' : 'text-red-500']}>{checkMsg.value.text}</div>
              )}
            </div>
          ),
          footer: () => (
            <div class={'flex items-center gap-2'}>
              <span class={'text-xs text-gray-400'}>Ctrl+S / Ctrl+F / Ctrl+E …</span>
              <div class={'flex-1'} />
              <NButton size="small" onClick={() => emit('close')}>{tt('scada.cancel')}</NButton>
              <NButton size="small" type="primary" data-editor-apply onClick={apply}>{tt('scada.confirm')}</NButton>
            </div>
          )
        }}
      </NModal>
    )
  }
})
