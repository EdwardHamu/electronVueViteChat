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
import { NButton, NCheckbox, NDropdown, NIcon, NInput, NModal, NPopover, NScrollbar, NTree, type DropdownOption, type TreeOption } from 'naive-ui'
import { computed, defineComponent, reactive, ref, watch, type Component, type PropType } from 'vue'
import {
  SaveRound, ContentCutRound, ContentCopyRound, ContentPasteRound, UndoRound, RedoRound,
  FormatIndentIncreaseRound, FormatIndentDecreaseRound, CommentRound, SpellcheckRound,
  DataObjectRound, DataArrayRound, AddCommentRound, HelpOutlineRound, SearchRound, WrapTextRound
} from '@vicons/material'
import { Variable as VariableIcon } from '@vicons/tabler'
import BindingPickerDialog from './BindingPickerDialog'
import CodeEditor from './CodeEditor'
import { openScriptHelp } from './ScriptHelpDialog'
import { compileScript } from './scripts'
import { compileTransform } from './transform'
import { useScadaStore } from './store'
import { getWidgetDefinition } from './registry'
import { getDataSource, PRODUCT_SOURCE_ID } from './dataSource'
import type { WidgetInstance } from './types'
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

export default defineComponent({
  name: 'ScadaScriptEditorDialog',
  props: {
    show: { type: Boolean, default: false },
    value: { type: String, default: '' },
    title: { type: String, default: '' },
    mode: { type: String as PropType<EditorMode>, default: 'script' },
    /** 数据处理函数弹窗打开时传入当前组件：对象树的「组件」部分只显示它 */
    widget: { type: Object as PropType<WidgetInstance | undefined>, default: undefined }
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
    const findShow = ref(false)
    /** 自动换行（工具栏开关，默认开启）：长行折行显示，行号照常显示并按逻辑行的实际折行高度对齐 */
    const wordWrap = ref(true)
    const openFind = (which: 'find' | 'replace') => {
      findShow.value = true
      setTimeout(() => (which === 'find' ? findInputRef.value?.focus?.() : replaceInputRef.value?.focus?.()), 60)
    }
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
    /** 运行语法检查并更新状态条，返回是否通过（保存前强制调用，不通过则禁止保存） */
    const runCheck = (): boolean => {
      const r = props.mode === 'transform' ? compileTransform(draft.value) : compileScript(draft.value)
      if (r.error) {
        checkMsg.value = { ok: false, text: r.error }
        msg('error', r.error)
        return false
      }
      checkMsg.value = { ok: true, text: tt('scada.editor.checkOk') }
      return true
    }
    const doCheck = () => {
      if (runCheck()) msg('success', tt('scada.editor.checkOk'))
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
      const widgetSource = props.widget ? [props.widget] : scada.current.widgets
      const widgets: TreeOption[] = widgetSource.map(w => {
        // 节点文案: 组件类型中文名 + (自定义命名) + id 前 4 位省略号
        const def = getWidgetDefinition(w.type)
        const typeName = def?.label() || w.type
        const named = (w.title || '').trim()
        const shortId = w.id.length > 4 ? w.id.slice(0, 4) + '…' : w.id
        return {
        key: 'w:' + w.id,
        label: `${typeName}${named ? `（${named}）` : ''} · ${shortId}`,
        insert: `'${w.id}'`,
        children: Object.keys(w.props || {}).map(k => {
          // 属性节点: 中文配置名（属性key）; 属性 schema 里没有的键退回只显示 key
          const cn = def?.propSchema?.find(f => f.key === k)?.label() || ''
          return {
            key: `w:${w.id}:${k}`,
            label: cn ? `${cn}（${k}）` : k,
            insert: mode === 'script' ? `scada.getProp('${w.id}', '${k}')` : `ctx.widget.props['${k}']`,
            getCode: mode === 'script' ? `scada.getProp('${w.id}', '${k}')` : `ctx.widget.props['${k}']`,
            setCode: mode === 'script' ? `scada.setProp('${w.id}', '${k}', '')` : `ctx.setProp('${k}', '')`
          }
        })
        }
      }) as TreeOption[]
      const vars: TreeOption[] = scada.variables.map(v => ({
        key: 'v:' + v.key,
        label: (v.name || '').trim() ? `${v.name} · ${v.key}` : v.key,
        insert: mode === 'script' ? `scada.value('${v.key}', 'local')` : `ctx.get('${v.key}', 'local')`,
        getCode: mode === 'script' ? `scada.value('${v.key}', 'local')` : `ctx.get('${v.key}', 'local')`,
        setCode: mode === 'script' ? `scada.write('${v.key}', '', 'local')` : undefined
      })) as TreeOption[]
      // 产品数据源(系统配置的产品分类数据)按分组建子树; 写值接口后端尚未完善, 先按可写生成代码
      const prodOpts = getDataSource(PRODUCT_SOURCE_ID)?.options() || []
      const prodLeaf = (o: { key: string; label: string }) => ({
        key: 'p:' + o.key,
        label: o.label || o.key,
        insert: mode === 'script' ? `scada.value('${o.key}', '${PRODUCT_SOURCE_ID}')` : `ctx.get('${o.key}', '${PRODUCT_SOURCE_ID}')`,
        getCode: mode === 'script' ? `scada.value('${o.key}', '${PRODUCT_SOURCE_ID}')` : `ctx.get('${o.key}', '${PRODUCT_SOURCE_ID}')`,
        setCode: mode === 'script' ? `scada.write('${o.key}', '', '${PRODUCT_SOURCE_ID}')` : undefined
      })
      const prodGroups = Array.from(new Set(prodOpts.map(o => o.group).filter((g): g is string => !!g)))
      const product: TreeOption[] = [
        ...prodGroups.map(g => ({
          key: 'pg:' + g,
          label: g,
          children: prodOpts.filter(o => o.group === g).map(prodLeaf)
        })),
        ...prodOpts.filter(o => !o.group).map(prodLeaf)
      ] as TreeOption[]
      return [
        { key: 'api', label: tt('scada.editor.api'), children: api },
        { key: 'widgets', label: tt('scada.editor.widgets'), children: widgets },
        { key: 'product', label: getDataSource(PRODUCT_SOURCE_ID)?.label() || PRODUCT_SOURCE_ID, children: product },
        { key: 'vars', label: tt('scada.editor.localVars'), children: vars }
      ] as TreeOption[]
    })
    /** 对象树右键菜单：组件属性 / 内部变量节点分「取值」「写值」插入不同代码 */
    const treeMenu = reactive({ show: false, x: 0, y: 0, getCode: '', setCode: '' })
    const treeMenuOptions = computed<DropdownOption[]>(() => {
      const list: DropdownOption[] = []
      if (treeMenu.getCode) list.push({ key: 'get', label: tt('scada.editor.menuGet') })
      if (treeMenu.setCode) list.push({ key: 'set', label: tt('scada.editor.menuSet') })
      return list
    })
    const onTreeMenuSelect = (key: string | number) => {
      treeMenu.show = false
      const code = key === 'set' ? treeMenu.setCode : treeMenu.getCode
      if (code) insertText(code)
    }
    const nodeProps = ({ option }: { option: TreeOption & { insert?: string; getCode?: string; setCode?: string } }) => ({
      ondblclick: () => { if (option.insert) insertText(option.insert) },
      oncontextmenu: (e: MouseEvent) => {
        if (!option.getCode && !option.setCode) return
        e.preventDefault()
        e.stopPropagation()
        treeMenu.getCode = option.getCode || ''
        treeMenu.setCode = option.setCode || ''
        treeMenu.x = e.clientX
        treeMenu.y = e.clientY
        treeMenu.show = true
      },
      title: option.insert || '',
      style: option.insert ? { cursor: 'pointer' } : undefined
    })

    /** 编辑区右键菜单：读取变量 / 写入变量 → 复用数据绑定的选择数据弹窗，选中后在光标处插入对应代码 */
    const edMenu = reactive({ show: false, x: 0, y: 0 })
    const pickAction = ref<'read' | 'write'>('read')
    const pickerShow = ref(false)
    const edMenuOptions = computed<DropdownOption[]>(() => {
      const list: DropdownOption[] = [{ key: 'read', label: tt('scada.editor.menuRead') }]
      // transform 模式没有写入 API（ctx.get 只读），只给「读取变量」
      if (props.mode === 'script') list.push({ key: 'write', label: tt('scada.editor.menuWrite') })
      return list
    })
    const onEditorContextmenu = (e: MouseEvent) => {
      if (props.mode === 'plain') return // 自定义组件代码没有 scada / ctx 数据接口
      e.preventDefault()
      e.stopPropagation()
      edMenu.x = e.clientX
      edMenu.y = e.clientY
      edMenu.show = true
    }
    const onEdMenuSelect = (key: string | number) => {
      edMenu.show = false
      pickAction.value = key === 'write' ? 'write' : 'read'
      pickerShow.value = true
    }
    const onPickerApply = (b: { source: string; key: string; label?: string }) => {
      pickerShow.value = false
      const code = props.mode === 'transform'
        ? `ctx.get('${b.key}', '${b.source}')`
        : pickAction.value === 'write'
          ? `scada.write('${b.key}', '', '${b.source}')`
          : `scada.value('${b.key}', '${b.source}')`
      // 等弹窗关闭（焦点陷阱解除）后再插入，否则 execCommand 时焦点还被弹窗扣着，插不进编辑区
      setTimeout(() => insertText(code), 0)
    }

    // ---------------- 保存 / 快捷键 ----------------
    const doSave = () => {
      if (!runCheck()) return // 语法检查不通过不允许保存
      emit('save', draft.value)
      msg('success', tt('scada.editor.saved'))
    }
    const apply = () => {
      if (!runCheck()) return // 语法检查不通过不允许保存
      emit('save', draft.value)
      emit('close')
    }
    const onKeydown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return
      const k = e.key.toLowerCase()
      const run = (fn: () => void) => { e.preventDefault(); e.stopPropagation(); fn() }
      if (k === 's') run(doSave)
      else if (k === 'f') run(() => openFind('find'))
      else if (k === 'r') run(() => openFind('replace'))
      else if (k === 'i') run(doIndent)
      else if (k === 'b') run(doOutdent)
      else if (k === "'") run(doComment)
      else if (k === 'e') run(doCheck)
      else if (k === 'd') run(() => insertText(''))
      else if (k === 'h') run(() => openScriptHelp('editor'))
    }

    const blockOptions: DropdownOption[] = BLOCKS.map(b => ({ key: b.key, label: b.label }))

    /** 工具栏图标按钮：悬停标题 = 本地化名称 + 快捷键 */
    const tbtn = (icon: Component, onClick: () => void, titleText: string) => (
      <NButton size="small" quaternary circle onClick={onClick} title={titleText}>
        {{ icon: () => <NIcon size={20} component={icon} /> }}
      </NButton>
    )
    const dbtn = (icon: Component, titleText: string) => (
      <NButton size="small" quaternary circle title={titleText}>
        {{ icon: () => <NIcon size={20} component={icon} /> }}
      </NButton>
    )
    const sep = () => <div class={'w-px h-5 bg-gray-300 mx-1 shrink-0'} />

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
              {/* 工具栏（全图标, 悬停显示名称+快捷键） */}
              <div class={'flex items-center gap-0.5 flex-wrap'}>
                {tbtn(SaveRound, doSave, tt('scada.editor.save') + ' Ctrl+S')}
                {sep()}
                {tbtn(ContentCutRound, doCut, tt('scada.editor.cut') + ' Ctrl+X')}
                {tbtn(ContentCopyRound, doCopy, tt('scada.editor.copy') + ' Ctrl+C')}
                {tbtn(ContentPasteRound, doPaste, tt('scada.editor.paste') + ' Ctrl+V')}
                {sep()}
                {tbtn(UndoRound, doUndo, tt('scada.editor.undo') + ' Ctrl+Z')}
                {tbtn(RedoRound, doRedo, tt('scada.editor.redo') + ' Ctrl+Y')}
                {sep()}
                {tbtn(FormatIndentIncreaseRound, doIndent, tt('scada.editor.indent') + ' Ctrl+I')}
                {tbtn(FormatIndentDecreaseRound, doOutdent, tt('scada.editor.outdent') + ' Ctrl+B')}
                {tbtn(CommentRound, doComment, tt('scada.editor.comment') + " Ctrl+'")}
                {sep()}
                {tbtn(SpellcheckRound, doCheck, tt('scada.editor.check') + ' Ctrl+E')}
                {sep()}
                <NPopover
                  trigger="manual"
                  show={findShow.value}
                  placement="bottom-start"
                  style={{ padding: '10px' }}
                  onClickoutside={() => (findShow.value = false)}
                >
                  {{
                    trigger: () => (
                      <NButton size="small" quaternary circle title={tt('scada.editor.find') + ' Ctrl+F / Ctrl+R'} onClick={() => openFind('find')}>
                        {{ icon: () => <NIcon size={20} component={SearchRound} /> }}
                      </NButton>
                    ),
                    default: () => (
                      <div class={'flex flex-col gap-1.5'} style={{ width: '320px' }}>
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
                      </div>
                    )
                  }}
                </NPopover>
                <NButton
                  size="small" quaternary circle
                  type={wordWrap.value ? 'primary' : 'default'}
                  title={tt('scada.editor.wrap')}
                  onClick={() => (wordWrap.value = !wordWrap.value)}
                >
                  {{ icon: () => <NIcon size={20} component={WrapTextRound} /> }}
                </NButton>
                {sep()}
                <NDropdown trigger="click" options={blockOptions} onSelect={(k: string) => { const b = BLOCKS.find(x => x.key === k); if (b) insertText(b.code) }}>
                  {dbtn(DataObjectRound, tt('scada.editor.block'))}
                </NDropdown>
                {tbtn(DataArrayRound, () => { const s = selectedText(); insertText(`(${s})`) }, tt('scada.editor.bracket'))}
                {tbtn(AddCommentRound, () => { const s = selectedText(); insertText(s ? `/* ${s} */` : '// ') }, tt('scada.editor.insertComment'))}
                {sep()}
                {tbtn(VariableIcon, () => (scada.varsShow = true), tt('scada.editor.variables'))}
                {tbtn(HelpOutlineRound, () => openScriptHelp('editor'), tt('scada.editor.help') + ' Ctrl+H')}
              </div>
              {/* 编辑区 + 右侧查找/对象树 */}
              <div class={'flex gap-2'} style={{ height: 'min(440px, 56vh)' }}>
                <div class={'flex-1 min-w-0'} onContextmenu={onEditorContextmenu}>
                  <CodeEditor ref={edRef} value={draft.value} language="js" lineNumbers wrap={wordWrap.value} placeholder={'// JS'} onUpdateValue={(v: string) => (draft.value = v)} />
                </div>
                {/* 编辑区右键菜单：读取/写入变量（复用数据绑定的选择数据弹窗） */}
                <NDropdown
                  trigger="manual"
                  placement="bottom-start"
                  show={edMenu.show}
                  x={edMenu.x}
                  y={edMenu.y}
                  options={edMenuOptions.value}
                  onClickoutside={() => (edMenu.show = false)}
                  onSelect={onEdMenuSelect}
                />
                <BindingPickerDialog
                  show={pickerShow.value}
                  value={null}
                  onClose={() => (pickerShow.value = false)}
                  onApply={onPickerApply}
                />
                {props.mode !== 'plain' && (
                  <div class={'w-[250px] shrink-0 flex flex-col gap-1.5 min-h-0'}>
                    <div class={'text-xs text-gray-600'}>{tt('scada.editor.objects')}</div>
                    <div class={'flex-1 min-h-0 border border-solid border-gray-200 rounded'}>
                      <NScrollbar class={'h-full'}>
                        <NTree blockLine selectable={false} expandOnClick data={treeData.value} nodeProps={nodeProps as never} />
                        <NDropdown
                          trigger="manual"
                          placement="bottom-start"
                          show={treeMenu.show}
                          x={treeMenu.x}
                          y={treeMenu.y}
                          options={treeMenuOptions.value}
                          onClickoutside={() => (treeMenu.show = false)}
                          onSelect={onTreeMenuSelect}
                        />
                      </NScrollbar>
                    </div>
                  </div>
                )}
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
