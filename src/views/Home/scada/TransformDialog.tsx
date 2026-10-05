/**
 * 数据处理函数编辑弹窗：由属性面板底部的按钮打开。
 * 弹窗里编辑的是本地草稿，用组件当前绑定的数据实时预览输出（预览有独立的 ctx.state，不影响画布里的实例），
 * 点「确定」才写回 WidgetInstance.transform；语法错误时不允许确定。
 */
import { NButton, NInput, NModal, NPopover, NScrollbar, NSelect } from 'naive-ui'
import { computed, defineComponent, ref, watch, type PropType } from 'vue'
import { getDataSource } from './dataSource'
import { formatValue } from './geometry'
import { getWidgetDefinition } from './registry'
import { useScadaStore } from './store'
import { resolveParam, runtimeOverrides } from './runtime'
import { compileTransform, runTransform, TRANSFORM_EXAMPLES, type TransformContext } from './transform'
import type { DataPoint, WidgetInstance } from './types'
import { tt } from './widgets/common'

/** 预览行里简要显示一个数据点 */
export const describePoint = (p?: DataPoint) => {
  if (!p) return '—'
  const main = p.value === null ? (p.text !== undefined ? JSON.stringify(p.text) : 'null') : formatValue(p.value, p.precision)
  const parts = [main + (p.unit ? ' ' + p.unit : '')]
  parts.push(tt('scada.status.' + p.status))
  if (p.upper !== undefined || p.lower !== undefined) parts.push(`${formatValue(p.lower, p.precision)} ~ ${formatValue(p.upper, p.precision)}`)
  return parts.join(' · ')
}

export default defineComponent({
  name: 'ScadaTransformDialog',
  props: {
    show: { type: Boolean, default: false },
    widget: { type: Object as PropType<WidgetInstance | undefined>, default: undefined }
  },
  emits: {
    close: () => true
  },
  setup(props, { emit }) {
    const scada = useScadaStore()
    const draft = ref('')
    // 预览专用的持久状态 / 上一次结果：打开弹窗或代码改变时重置
    let previewState: Record<string, any> = {}
    let previewPrev: DataPoint | undefined
    const resetPreview = () => {
      previewState = {}
      previewPrev = undefined
    }

    watch(
      () => props.show,
      show => {
        if (show) {
          draft.value = props.widget?.transform || ''
          resetPreview()
        }
      },
      { immediate: true }
    )
    watch(draft, resetPreview)

    const compiled = computed(() => compileTransform(draft.value))
    const exampleOptions = computed(() => TRANSFORM_EXAMPLES.map(e => ({ label: tt('scada.transformExample.' + e.key), value: e.key })))
    /** 组件当前绑定的原始数据点（未绑定为 undefined） */
    const rawPoint = computed<DataPoint | undefined>(() => {
      const b = props.widget?.binding
      if (!b) return undefined
      const provider = getDataSource(b.source)
      if (!provider) return { value: null, status: 'offline', name: b.label }
      return provider.read(b.key)
    })
    /** 草稿对当前数据的处理结果 */
    const preview = computed(() => {
      const w = props.widget
      const c = compiled.value
      if (!w || !c.source) return null
      const ctx: TransformContext = {
        widget: w,
        history: [],
        state: previewState,
        prev: previewPrev,
        now: Date.now(),
        // 预览里 ctx.get 只读不订阅（轮询型数据源可能取到的是旧值）；ctx.setProp 在预览中不生效
        get: (keyOrName: string, sourceId?: string) => {
          const ref = resolveParam(keyOrName, sourceId, w.binding?.source)
          return ref ? ref.prov.read(ref.key) : undefined
        },
        setProp: () => {}
      }
      const r = runTransform(c, rawPoint.value, ctx)
      previewPrev = r.point
      return r
    })
    const close = () => emit('close')
    const apply = () => {
      if (compiled.value.error) return
      if (props.widget) scada.updateWidget(props.widget.id, { transform: draft.value.trim() ? draft.value : '' })
      close()
    }
    const onKeydown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault()
        apply()
      }
    }

    /** 「组件属性」浮窗内容：当前组件对象的实时快照（写 ctx.setProp / 读 ctx.widget.props 时对照用） */
    const widgetSnapshot = () => {
      const w = props.widget
      if (!w) return null
      const snap: Record<string, any> = {
        id: w.id,
        type: w.type,
        title: w.title || '',
        x: w.x, y: w.y, w: w.w, h: w.h,
        hidden: !!w.hidden,
        binding: w.binding || null,
        props: w.props
      }
      const ov = runtimeOverrides[w.id]
      if (ov && Object.keys(ov).length) snap.runtimeOverrides = ov
      return snap
    }

    const renderBody = () => {
      const p = preview.value
      return (
        <div class={'flex flex-col gap-2'} onKeydown={onKeydown}>
          <NInput
            type="textarea"
            value={draft.value}
            placeholder={tt('scada.panel.transformPlaceholder')}
            autosize={{ minRows: 10, maxRows: 18 }}
            inputProps={{ spellcheck: false, autocapitalize: 'off', autocorrect: 'off' } as any}
            style={{ fontFamily: 'ui-monospace, Consolas, monospace', fontSize: '13px' }}
            onUpdateValue={(v: string) => (draft.value = v)}
          />
          <div class={'flex items-center gap-2 flex-wrap'}>
            <NSelect
              class={'w-[200px]'}
              size="small"
              value={null}
              placeholder={tt('scada.panel.transformExample')}
              options={exampleOptions.value}
              onUpdateValue={(k: string) => {
                const ex = TRANSFORM_EXAMPLES.find(e => e.key === k)
                if (ex) draft.value = ex.code
              }}
            />
            <NButton size="small" quaternary disabled={!draft.value} onClick={() => (draft.value = '')}>
              {tt('scada.panel.transformClear')}
            </NButton>
            {/* 浮窗展示当前组件的属性对象（实时，含运行时覆盖），写 ctx.setProp / 读 ctx.widget.props 时对照 */}
            <NPopover trigger="click" placement="top" style={{ padding: '0' }}>
              {{
                trigger: () => (
                  <NButton size="small" data-transform-props>
                    {tt('scada.panel.transformProps')}
                  </NButton>
                ),
                default: () => (
                  <NScrollbar style={{ maxHeight: '340px', width: '380px' }}>
                    <pre class={'m-0 px-3 py-2 text-xs leading-5'} style={{ fontFamily: 'ui-monospace, Consolas, monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                      {JSON.stringify(widgetSnapshot(), null, 2)}
                    </pre>
                  </NScrollbar>
                )
              }}
            </NPopover>
            <div class={'flex-1'} />
            {!props.widget?.binding && <span class={'text-xs text-orange-500'}>{tt('scada.panel.transformNoBinding')}</span>}
          </div>
          <div class={'rounded bg-gray-50 border border-solid border-gray-200 px-3 py-2 text-xs leading-5 break-all min-h-[52px]'}>
            {!p ? (
              <div class={'text-gray-400'}>{tt('scada.panel.transformEmptyPreview')}</div>
            ) : p.error ? (
              <div class={'text-red-600'}>{tt('scada.panel.transformError')}: {p.error}</div>
            ) : (
              <>
                <div class={'text-gray-500'}>{tt('scada.panel.transformInput')}: {describePoint(rawPoint.value)}</div>
                <div class={'text-gray-800'}>{tt('scada.panel.transformOutput')}: {describePoint(p.point)}</div>
              </>
            )}
          </div>
          <div class={'text-xs text-gray-500 leading-5 whitespace-pre-line'}>{tt('scada.panel.transformHint')}</div>
        </div>
      )
    }

    return () => {
      const w = props.widget
      const def = w ? getWidgetDefinition(w.type) : undefined
      const title = `${tt('scada.panel.transform')} · ${def ? def.label() : w?.type || ''}${w?.title ? ' · ' + w.title : ''}`
      return (
        <NModal
          show={props.show}
          preset="card"
          title={title}
          closable
          maskClosable={false}
          autoFocus={false}
          style={{ width: '760px', maxWidth: '96vw' }}
          onUpdateShow={(v: boolean) => {
            if (!v) close()
          }}
        >
          {{
            default: () => renderBody(),
            footer: () => (
              <div class={'flex items-center gap-2'}>
                <span class={'text-xs text-gray-400'}>Ctrl + Enter</span>
                <div class={'flex-1'} />
                <NButton onClick={close}>{tt('scada.cancel')}</NButton>
                <NButton type="primary" disabled={!!compiled.value.error} onClick={apply}>
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
