/**
 * 全局脚本编辑弹窗（启动 / 循环 / 结束）：属性面板空选区「全局脚本」区块的按钮打开。
 * 编辑的是本地草稿，点「确定」才写回布局（scada.setScripts）；语法错误时不允许确定。
 */
import { NButton, NModal } from 'naive-ui'
import { computed, defineComponent, ref, watch } from 'vue'
import CodeEditor from './CodeEditor'
import { compileScript, type ScriptKind } from './scripts'
import { useScadaStore } from './store'
import { tt } from './widgets/common'

const KIND_LABEL: Record<ScriptKind, string> = {
  start: 'scada.panel.scriptStart',
  loop: 'scada.panel.scriptLoop',
  end: 'scada.panel.scriptEnd'
}

export default defineComponent({
  name: 'ScadaScriptDialog',
  props: {
    show: { type: Boolean, default: false },
    kind: { type: String as () => ScriptKind, default: 'start' }
  },
  emits: {
    close: () => true
  },
  setup(props, { emit }) {
    const scada = useScadaStore()
    const draft = ref('')
    watch(
      () => `${props.show}|${props.kind}`,
      () => {
        if (props.show) draft.value = scada.current.scripts?.[props.kind] || ''
      },
      { immediate: true }
    )
    const compiled = computed(() => compileScript(draft.value))
    const apply = () => {
      if (compiled.value.error) return
      scada.setScripts({ [props.kind]: draft.value.trim() } as any)
      emit('close')
    }
    return () => (
      <NModal
        show={props.show}
        preset="card"
        title={`${tt('scada.panel.scripts')} · ${tt(KIND_LABEL[props.kind])}`}
        closable
        maskClosable={false}
        autoFocus={false}
        style={{ width: '680px', maxWidth: '96vw' }}
        contentStyle={{ padding: '10px 14px' }}
        footerStyle={{ padding: '8px 14px 12px' }}
        onUpdateShow={(v: boolean) => {
          if (!v) emit('close')
        }}
      >
        {{
          default: () => (
            <div data-scada-script-dialog>
              <div class={'text-xs text-gray-500 whitespace-pre-line mb-2'}>{tt('scada.panel.scriptHint')}</div>
              <div style={{ height: '300px' }}>
                <CodeEditor value={draft.value} language="js" placeholder={'// JS'} onUpdateValue={(v: string) => (draft.value = v)} />
              </div>
              {compiled.value.error && <div class={'mt-1 text-xs text-red-500 break-all'}>{compiled.value.error}</div>}
            </div>
          ),
          footer: () => (
            <div class={'flex items-center gap-2 justify-end'}>
              <NButton size="small" type="primary" disabled={!!compiled.value.error} data-script-apply onClick={apply}>
                {tt('scada.confirm')}
              </NButton>
              <NButton size="small" onClick={() => emit('close')}>{tt('scada.panel.pickerClose')}</NButton>
            </div>
          )
        }}
      </NModal>
    )
  }
})
