/**
 * 导入组态包弹窗，两种来源：
 *  - 宿主模式（preview）：宿主 PreviewScadaPackage 已选好文件并清点完毕 → 显示清单（组件数、画布、资源：需复制 / 可复用 / 缺失）
 *    → 确认后调宿主 ImportScadaPackage 解压资源、拿回布局并替换；
 *  - 浏览器模式（file）：前端解析 zip / JSON → 清单（复用 / 需上传 / 缺失）→ 确认后上传资源并替换布局。
 * 展示模式下直接持久化；编辑模式下替换草稿，保存后才生效。
 */
import { NButton, NModal, NSpin } from 'naive-ui'
import { defineComponent, reactive, watch, type PropType } from 'vue'
import {
  applyPackage,
  importPackageViaHost,
  layoutFromHostImport,
  parsePackage,
  planImport,
  type HostImportResult,
  type HostPackagePreview,
  type ImportPlan,
  type ImportResult,
  type ParsedPackage
} from './package'
import { hasHostBridge } from './resource'
import { useScadaStore } from './store'
import { tt } from './widgets/common'

type Phase = 'idle' | 'parsing' | 'ready' | 'error' | 'importing' | 'done'

const readFileBytes = async (file: Blob): Promise<Uint8Array> => {
  if (typeof (file as any).arrayBuffer === 'function') return new Uint8Array(await file.arrayBuffer())
  return new Promise<Uint8Array>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer))
    reader.onerror = () => reject(reader.error || new Error('read failed'))
    reader.readAsArrayBuffer(file)
  })
}

const fmt = (key: string, vars: Record<string, string | number>) => tt(key, vars)

export default defineComponent({
  name: 'ScadaImportDialog',
  props: {
    show: { type: Boolean, default: false },
    /** 浏览器模式：用户通过 file input 选的文件 */
    file: { type: Object as PropType<File | null>, default: null },
    /** 宿主模式：PreviewScadaPackage 的结果（优先于 file） */
    preview: { type: Object as PropType<HostPackagePreview | null>, default: null }
  },
  emits: {
    close: () => true,
    /** 导入完成（布局已替换） */
    imported: (_result: ImportResult) => true
  },
  setup(props, { emit }) {
    const scada = useScadaStore()
    const state = reactive({
      phase: 'idle' as Phase,
      error: '',
      pkg: null as ParsedPackage | null,
      plan: null as ImportPlan | null,
      result: null as ImportResult | null,
      host: null as HostPackagePreview | null,
      hostResult: null as HostImportResult | null,
      progress: { done: 0, total: 0 }
    })
    let seq = 0

    const reset = () => {
      state.phase = 'idle'
      state.error = ''
      state.pkg = null
      state.plan = null
      state.result = null
      state.host = null
      state.hostResult = null
      state.progress = { done: 0, total: 0 }
    }

    const parse = async (file: File) => {
      const mySeq = ++seq
      reset()
      state.phase = 'parsing'
      try {
        const bytes = await readFileBytes(file)
        const pkg = await parsePackage(bytes)
        const plan = await planImport(pkg)
        if (mySeq !== seq) return
        state.pkg = pkg
        state.plan = plan
        state.phase = 'ready'
      } catch (err: any) {
        if (mySeq !== seq) return
        console.warn('[scada] import: parse failed', err)
        const code = String((err && err.message) || '')
        state.error = code.startsWith('invalid-') ? tt('scada.pkg.invalid') : tt('scada.pkg.readFailed')
        state.phase = 'error'
      }
    }

    watch(
      () => [props.show, props.file, props.preview] as const,
      ([show, file, preview]) => {
        if (show && preview) {
          seq++
          reset()
          state.host = preview
          state.phase = 'ready'
        } else if (show && file) parse(file)
        else if (!show) {
          seq++
          reset()
        }
      },
      { immediate: true }
    )

    /** 宿主模式确认：宿主解压资源并返回布局 → 规范化 → 替换 */
    const confirmHost = async () => {
      const host = state.host
      if (!host || !host.Path || state.phase !== 'ready') return
      state.phase = 'importing'
      try {
        const res = await importPackageViaHost(host.Path)
        // undefined / null：宿主不支持或返回失败（callBrige 已弹出宿主的错误信息）
        if (!res || typeof res !== 'object') throw new Error('host-import-failed')
        const layout = layoutFromHostImport(res)
        await scada.applyLayout(layout)
        state.hostResult = res
        state.phase = 'done'
        window.$message && window.$message.success(fmt('scada.pkg.hostDone', { w: layout.widgets.length, u: res.Copied || 0, r: res.Reused || 0 }))
        const failed = [...(res.Failed || []), ...(res.Missing || [])].map(url => ({ file: '', url }))
        emit('imported', { layout, uploaded: res.Copied || 0, reused: res.Reused || 0, inlined: 0, failed })
      } catch (err: any) {
        console.error('[scada] host import failed', err)
        state.error = String((err && err.message) || '') === 'invalid-layout' ? tt('scada.pkg.invalid') : tt('scada.pkg.importFailed')
        state.phase = 'error'
      }
    }

    const confirm = async () => {
      if (state.host) return confirmHost()
      if (!state.pkg || !state.plan || state.phase !== 'ready') return
      state.phase = 'importing'
      state.progress = { done: 0, total: state.plan.toUpload.length }
      try {
        const result = await applyPackage(state.pkg, state.plan, {
          onProgress: (done, total) => (state.progress = { done, total })
        })
        await scada.applyLayout(result.layout)
        state.result = result
        state.phase = 'done'
        window.$message && window.$message.success(fmt('scada.pkg.done', { w: result.layout.widgets.length, u: result.uploaded + result.inlined, r: result.reused }))
        emit('imported', result)
      } catch (err) {
        console.error('[scada] import failed', err)
        state.error = tt('scada.pkg.importFailed')
        state.phase = 'error'
      }
    }

    const row = (label: string, value: any) => (
      <div class={'flex items-center gap-2 text-sm'}>
        <span class={'w-20 shrink-0 text-gray-500'}>{label}</span>
        <span class={'min-w-0 break-all'}>{value}</span>
      </div>
    )

    const renderBody = () => {
      const p = state.phase
      if (p === 'parsing') {
        return (
          <div class={'py-6 flex items-center justify-center gap-3 text-sm text-gray-500'} data-import-phase="parsing">
            <NSpin size="small" />
            {tt('scada.pkg.parsing')}
          </div>
        )
      }
      if (p === 'error') return <div class={'py-2 text-sm text-red-600 break-all'} data-import-phase="error">{state.error}</div>
      if (p === 'importing') {
        return (
          <div class={'py-6 flex items-center justify-center gap-3 text-sm text-gray-500'} data-import-phase="importing">
            <NSpin size="small" />
            {state.host ? tt('scada.pkg.hostImporting') : fmt('scada.pkg.importing', { done: state.progress.done, total: state.progress.total })}
          </div>
        )
      }
      if (p === 'done' && state.hostResult) {
        const r = state.hostResult
        const failed = (r.Failed || []).length
        const missing = (r.Missing || []).length
        return (
          <div class={'flex flex-col gap-1'} data-import-phase="done">
            <div class={'text-sm text-green-700'}>{fmt('scada.pkg.hostDone', { w: r.Widgets, u: r.Copied || 0, r: r.Reused || 0 })}</div>
            {failed ? <div class={'text-xs text-orange-600'}>{fmt('scada.pkg.failedCount', { n: failed })}</div> : null}
            {missing ? <div class={'text-xs text-orange-600'}>{fmt('scada.pkg.missingCount', { n: missing })}</div> : null}
            {scada.editing ? <div class={'text-xs text-gray-500'}>{tt('scada.pkg.draftNote')}</div> : null}
          </div>
        )
      }
      if (p === 'done' && state.result) {
        const r = state.result
        return (
          <div class={'flex flex-col gap-1'} data-import-phase="done">
            <div class={'text-sm text-green-700'}>{fmt('scada.pkg.done', { w: r.layout.widgets.length, u: r.uploaded + r.inlined, r: r.reused })}</div>
            {r.failed.length ? <div class={'text-xs text-orange-600'}>{fmt('scada.pkg.failedCount', { n: r.failed.length })}</div> : null}
            {r.inlined ? <div class={'text-xs text-gray-500'}>{tt('scada.pkg.inlinedNote')}</div> : null}
            {scada.editing ? <div class={'text-xs text-gray-500'}>{tt('scada.pkg.draftNote')}</div> : null}
          </div>
        )
      }
      if (p === 'ready' && state.host) {
        const h = state.host
        const total = h.Resources || 0
        const missing = (h.Missing || []).length
        return (
          <div class={'flex flex-col gap-1.5'} data-import-phase="ready" data-import-source="host">
            {row(tt('scada.pkg.file'), h.FileName || h.Path || '')}
            {row(tt('scada.panel.widgetCount'), h.Widgets || 0)}
            {row(tt('scada.panel.canvas'), h.Canvas ? `${h.Canvas.Width} × ${h.Canvas.Height}` : '-')}
            {row(
              tt('scada.pkg.resources'),
              total ? `${total}（${fmt('scada.pkg.hostResourceDetail', { u: h.ToCopy || 0, r: h.Reusable || 0, m: missing })}）` : tt('scada.pkg.noResources')
            )}
            {missing ? <div class={'text-xs text-orange-600 mt-1'}>{fmt('scada.pkg.missingCount', { n: missing })}</div> : null}
            <div class={'text-xs text-gray-500 mt-1'}>{scada.editing ? tt('scada.pkg.replaceDraftHint') : tt('scada.pkg.replaceHint')}</div>
          </div>
        )
      }
      if (p === 'ready' && state.pkg && state.plan) {
        const l = state.pkg.layout
        const plan = state.plan
        const total = state.pkg.resources.length
        return (
          <div class={'flex flex-col gap-1.5'} data-import-phase="ready">
            {row(tt('scada.pkg.file'), props.file ? props.file.name : '')}
            {row(tt('scada.panel.widgetCount'), l.widgets.length)}
            {row(tt('scada.panel.canvas'), `${l.canvas.width} × ${l.canvas.height}`)}
            {row(
              tt('scada.pkg.resources'),
              total
                ? `${total}（${fmt('scada.pkg.resourceDetail', { u: plan.toUpload.length, r: plan.reusable.length, m: plan.missing.length })}）`
                : tt('scada.pkg.noResources')
            )}
            {plan.toUpload.length && !hasHostBridge() ? <div class={'text-xs text-orange-600 mt-1'}>{tt('scada.pkg.noBridge')}</div> : null}
            <div class={'text-xs text-gray-500 mt-1'}>{scada.editing ? tt('scada.pkg.replaceDraftHint') : tt('scada.pkg.replaceHint')}</div>
          </div>
        )
      }
      return null
    }

    const renderFooter = () => {
      const p = state.phase
      const closeBtn = (
        <NButton size="small" onClick={() => emit('close')} disabled={p === 'importing'}>
          {p === 'done' ? tt('scada.close') : tt('scada.cancel')}
        </NButton>
      )
      return (
        <div class={'flex justify-end gap-2'}>
          {closeBtn}
          {p === 'ready' ? (
            <NButton size="small" type="primary" data-import-confirm onClick={confirm}>
              {tt('scada.pkg.apply')}
            </NButton>
          ) : null}
        </div>
      )
    }

    return () => (
      <NModal
        show={props.show}
        preset="card"
        title={tt('scada.pkg.importTitle')}
        style={{ width: 'min(480px, 94vw)' }}
        closable
        maskClosable={state.phase !== 'importing'}
        onUpdateShow={(v: boolean) => {
          if (!v && state.phase !== 'importing') emit('close')
        }}
      >
        {{
          default: () => <div data-scada-import-dialog>{renderBody()}</div>,
          footer: renderFooter
        }}
      </NModal>
    )
  }
})
