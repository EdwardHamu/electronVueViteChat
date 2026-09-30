/**
 * 代码编辑弹窗（propSchema 里 type = 'code' 的字段用）：自定义组件的 HTML / CSS / JS 都在这里编辑。
 * 弹窗里改的是本地草稿，点「确定」（或 Ctrl + Enter）才写回组件属性；可插入字段自带的示例、清空。
 */
import { NButton, NInput, NModal } from 'naive-ui'
import { defineComponent, ref, watch, type PropType } from 'vue'
import type { PropField } from './types'
import { tt } from './widgets/common'

export default defineComponent({
  name: 'ScadaCodeDialog',
  props: {
    show: { type: Boolean, default: false },
    /** 弹窗标题（组件名 · 字段名） */
    title: { type: String, default: '' },
    field: { type: Object as PropType<PropField | undefined>, default: undefined },
    value: { type: String, default: '' }
  },
  emits: {
    apply: (_value: string) => true,
    close: () => true
  },
  setup(props, { emit }) {
    const draft = ref('')
    watch(
      () => props.show,
      show => {
        if (show) draft.value = props.value || ''
      },
      { immediate: true }
    )
    const close = () => emit('close')
    const apply = () => {
      emit('apply', draft.value)
      close()
    }
    const onKeydown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault()
        apply()
      }
    }
    const placeholderOf = () => {
      const lang = props.field?.language
      return lang === 'html' ? '<div class="card">…</div>' : lang === 'css' ? '.card { color: #1f2937; }' : lang === 'js' ? 'scada.onData(function (point) { … })' : ''
    }

    return () => {
      const f = props.field
      const example = f?.example ? f.example() : ''
      const hint = f?.hint ? f.hint() : ''
      return (
        <NModal
          show={props.show}
          preset="card"
          title={props.title}
          closable
          maskClosable={false}
          autoFocus={false}
          style={{ width: '760px', maxWidth: '96vw' }}
          onUpdateShow={(v: boolean) => {
            if (!v) close()
          }}
        >
          {{
            default: () => (
              <div class={'flex flex-col gap-2'} onKeydown={onKeydown} data-scada-code-dialog={f?.key || ''}>
                <NInput
                  type="textarea"
                  value={draft.value}
                  placeholder={placeholderOf()}
                  autosize={{ minRows: 12, maxRows: 22 }}
                  inputProps={{ spellcheck: false, autocapitalize: 'off', autocorrect: 'off' } as any}
                  style={{ fontFamily: 'ui-monospace, Consolas, monospace', fontSize: '13px' }}
                  onUpdateValue={(v: string) => (draft.value = v)}
                />
                <div class={'flex items-center gap-2 flex-wrap'}>
                  {example ? (
                    <NButton size="small" secondary onClick={() => (draft.value = example)}>
                      {tt('scada.panel.codeExample')}
                    </NButton>
                  ) : null}
                  <NButton size="small" quaternary disabled={!draft.value} onClick={() => (draft.value = '')}>
                    {tt('scada.panel.codeClear')}
                  </NButton>
                </div>
                {hint ? <div class={'text-xs text-gray-500 leading-5 whitespace-pre-line break-all'}>{hint}</div> : null}
              </div>
            ),
            footer: () => (
              <div class={'flex items-center gap-2'}>
                <span class={'text-xs text-gray-400'}>Ctrl + Enter</span>
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
