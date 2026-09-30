/**
 * 代码编辑弹窗（propSchema 里 type = 'code' 的字段用）：自定义组件的 HTML / CSS 在同一个弹窗里编辑（横屏左右两栏、竖屏上下两栏），
 * JS 单独一个弹窗。每段代码用带语法高亮的 CodeEditor；弹窗里改的是本地草稿，点「确定」（或 Ctrl + Enter）才一起写回组件属性；
 * 每段各有「插入示例」「清空」和说明文字。
 */
import { NButton, NModal } from 'naive-ui'
import { defineComponent, reactive, watch, type PropType } from 'vue'
import { useMain } from '@/store'
import CodeEditor from './CodeEditor'
import type { CodePart, PropField } from './types'
import { tt } from './widgets/common'

/** code 字段包含的代码段：优先 parts，否则按字段本身（key / language / example / hint）当作单段 */
export const codeParts = (f: PropField | undefined): CodePart[] => {
  if (!f) return []
  if (f.parts && f.parts.length) return f.parts
  return [{ key: f.key, label: f.label, language: f.language || 'js', example: f.example, hint: f.hint }]
}

const PLACEHOLDER: Record<string, string> = {
  html: '<div class="card">…</div>',
  css: '.card { color: #1f2937; }',
  js: 'scada.onData(function (point) { … })'
}

export default defineComponent({
  name: 'ScadaCodeDialog',
  props: {
    show: { type: Boolean, default: false },
    /** 弹窗标题（组件名 · 字段名） */
    title: { type: String, default: '' },
    field: { type: Object as PropType<PropField | undefined>, default: undefined },
    /** 各代码段当前值（key → 代码） */
    values: { type: Object as PropType<Record<string, string>>, default: () => ({}) }
  },
  emits: {
    apply: (_values: Record<string, string>) => true,
    close: () => true
  },
  setup(props, { emit }) {
    const store = useMain()
    const draft = reactive<Record<string, string>>({})
    watch(
      () => props.show,
      show => {
        if (!show) return
        Object.keys(draft).forEach(k => delete draft[k])
        codeParts(props.field).forEach(p => (draft[p.key] = String(props.values[p.key] ?? '')))
      },
      { immediate: true }
    )
    const close = () => emit('close')
    const apply = () => {
      emit('apply', { ...draft })
      close()
    }
    const onKeydown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault()
        apply()
      }
    }

    const renderPart = (p: CodePart, multi: boolean) => {
      const example = p.example ? p.example() : ''
      const hint = p.hint ? p.hint() : ''
      const height = multi ? (store.isLandscape ? '52vh' : '26vh') : '46vh'
      return (
        <div class={'flex-1 min-w-0 flex flex-col gap-1'} data-code-part={p.key} key={p.key}>
          <div class={'flex items-center gap-2'}>
            <span class={'text-sm font-bold'}>{p.label()}</span>
            <span class={'text-xs text-gray-400'}>{tt('scada.panel.codeChars', { n: (draft[p.key] || '').length })}</span>
            <div class={'flex-1'} />
            {example ? (
              <NButton size="tiny" secondary onClick={() => (draft[p.key] = example)}>
                {tt('scada.panel.codeExample')}
              </NButton>
            ) : null}
            <NButton size="tiny" quaternary disabled={!draft[p.key]} onClick={() => (draft[p.key] = '')}>
              {tt('scada.panel.codeClear')}
            </NButton>
          </div>
          <div style={{ height }}>
            <CodeEditor value={draft[p.key] || ''} language={p.language} placeholder={PLACEHOLDER[p.language] || ''} onUpdateValue={(v: string) => (draft[p.key] = v)} />
          </div>
          {hint ? <div class={'text-xs text-gray-500 leading-5 whitespace-pre-line break-all'}>{hint}</div> : null}
        </div>
      )
    }

    return () => {
      const parts = codeParts(props.field)
      const multi = parts.length > 1
      const row = multi && store.isLandscape
      return (
        <NModal
          show={props.show}
          preset="card"
          title={props.title}
          closable
          maskClosable={false}
          autoFocus={false}
          style={{ width: row ? '1180px' : '760px', maxWidth: '96vw' }}
          onUpdateShow={(v: boolean) => {
            if (!v) close()
          }}
        >
          {{
            default: () => (
              <div class={row ? 'flex flex-row gap-4' : 'flex flex-col gap-3'} onKeydown={onKeydown} data-scada-code-dialog={props.field?.key || ''} data-code-layout={row ? 'row' : 'column'}>
                {parts.map(p => renderPart(p, multi))}
              </div>
            ),
            footer: () => (
              <div class={'flex items-center gap-2'}>
                <span class={'text-xs text-gray-400'}>Ctrl + Enter · Tab</span>
                <div class={'flex-1'} />
                <NButton onClick={close}>{tt('scada.cancel')}</NButton>
                <NButton type="primary" onClick={apply}>
                  {tt('scada.confirm')}
                </NButton>
              </div>
            )
          }}
        </NModal>
      )
    }
  }
})
