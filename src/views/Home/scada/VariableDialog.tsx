/**
 * 内部变量管理弹窗（数据源 local）：工具栏「内部变量」按钮 / 属性面板数据绑定里的「管理内部变量」打开，开关状态是 store 的 varsShow。
 *  - 弹窗里编辑的是本地副本（名称 / 增 / 删），点「确定」才一次性写回草稿（store.setVariables，撤销历史里算一步），点「取消」不改任何东西；
 *  - 每行：序号 / 名称（可改，留空 = 默认名「变量 N」）/ 标识（自动编号 var17，不复用、不能改）/ 当前值（只读，实时）/ 使用它的组件数 / 删除；
 *  - 名称不能重名（重名的行标红，「确定」置灰）；删除被组件绑定着的变量要确认——确定后这些组件解除绑定；
 *  - 「添加变量」追加一行并让名称框进入编辑（全选）。
 * 变量的「值」不在这里改（值是运行期数据，由控制组件写入）；定义随布局保存 / 导出，见 variables.ts。
 */
import { NButton, NInput, NModal, NPopconfirm, NScrollbar } from 'naive-ui'
import { computed, defineComponent, nextTick, ref, watch } from 'vue'
import { localDataSource } from './dataSource/localSource'
import { widgetName } from './registry'
import { useScadaStore } from './store'
import { defaultVarName, MAX_VARIABLES, MAX_VAR_NAME, nextVarSeq, variableUsers, varDisplayName } from './variables'
import { tt } from './widgets/common'

interface Row {
  key: string
  /** 名称框里的文字（打开时已是「显示名」：用户起的名字或默认名） */
  name: string
}

/** 当前值的简短文本：没有值 = —；文本值原样；数值去掉浮点噪声 */
const valueText = (key: string) => {
  const p = localDataSource.read(key)
  if (!p) return '—'
  if (p.value === null) return p.text !== undefined && p.text !== '' ? p.text : '—'
  return p.text !== undefined && p.text !== '' ? p.text : String(Number(p.value.toFixed(6)))
}

export default defineComponent({
  name: 'ScadaVariableDialog',
  setup() {
    const scada = useScadaStore()
    const rows = ref<Row[]>([])
    const listRef = ref<HTMLElement>()
    /** 新增变量用的下一个编号（本地副本里推进，确定时一并写回 variableSeq） */
    let seq = 1
    const prefix = () => tt('scada.source.localVar')
    const defName = (key: string) => defaultVarName(key, prefix())
    const effective = (r: Row) => r.name.trim() || defName(r.key)

    watch(
      () => scada.varsShow,
      show => {
        if (!show) return
        const list = scada.variables
        rows.value = list.map(v => ({ key: v.key, name: varDisplayName(v, prefix()) }))
        seq = nextVarSeq(list, scada.draft?.variableSeq)
      },
      { immediate: true }
    )

    /** 有重名的行（名称不区分大小写；默认名也参与比较） */
    const duplicated = computed(() => {
      const byName = new Map<string, string[]>()
      rows.value.forEach(r => {
        const n = effective(r).toLowerCase()
        byName.set(n, [...(byName.get(n) || []), r.key])
      })
      const dup = new Set<string>()
      byName.forEach(keys => keys.length > 1 && keys.forEach(k => dup.add(k)))
      return dup
    })
    const canApply = computed(() => duplicated.value.size === 0)
    const usersOf = (key: string) => variableUsers(scada.current.widgets, key)

    const close = () => (scada.varsShow = false)
    const add = () => {
      if (rows.value.length >= MAX_VARIABLES) return
      const key = `var${seq++}`
      rows.value.push({ key, name: defName(key) })
      nextTick(() => {
        const input = listRef.value?.querySelector(`[data-var-name="${key}"] input`) as HTMLInputElement | null
        if (input) {
          if (input.scrollIntoView) input.scrollIntoView({ block: 'nearest' })
          input.focus()
          input.select()
        }
      })
    }
    const remove = (key: string) => {
      rows.value = rows.value.filter(r => r.key !== key)
    }
    const apply = () => {
      if (!canApply.value) return
      // 名称留空或等于默认名 → 存空串（显示时随语言取默认名）
      const list = rows.value.map(r => {
        const name = r.name.trim()
        return { key: r.key, name: name === defName(r.key) ? '' : name }
      })
      scada.setVariables(list, seq)
      close()
    }
    const onKeydown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault()
        apply()
      }
    }

    const deleteButton = (key: string) => (
      <button type="button" data-var-delete={key} title={tt('scada.vars.delete')} class={'w-6 h-6 shrink-0 p-0 rounded border-0 bg-transparent text-gray-400 hover:text-red-500 hover:bg-red-50 cursor-pointer outline-none text-base leading-none'}>
        ✕
      </button>
    )

    const renderRow = (r: Row, i: number) => {
      const users = usersOf(r.key)
      const dup = duplicated.value.has(r.key)
      return (
        <div key={r.key} data-var-row={r.key} class={'flex items-start gap-2 px-2 py-1 border-0 border-b border-solid border-gray-100'}>
          <span class={'w-6 shrink-0 text-right text-xs text-gray-400 leading-[28px]'}>{i + 1}</span>
          <div class={'flex-1 min-w-0'} data-var-name={r.key}>
            <NInput
              size="small"
              value={r.name}
              maxlength={MAX_VAR_NAME}
              placeholder={defName(r.key)}
              status={dup ? 'error' : undefined}
              inputProps={{ spellcheck: false } as any}
              onUpdateValue={(v: string) => (r.name = v)}
            />
            {dup ? <div class={'text-[11px] leading-4 text-red-500'} data-var-dup>{tt('scada.vars.duplicate')}</div> : null}
          </div>
          <span class={'hidden sm:block w-16 shrink-0 text-xs text-gray-500 leading-[28px] font-mono'} data-var-key>{r.key}</span>
          <span class={'w-20 shrink-0 text-xs text-gray-700 leading-[28px] truncate'} data-var-value title={valueText(r.key)}>{valueText(r.key)}</span>
          <span class={'w-10 shrink-0 text-xs text-center leading-[28px] text-gray-600'} data-var-usage title={users.map(w => widgetName(w)).join('、')}>
            {users.length || '—'}
          </span>
          <div class={'w-6 shrink-0 h-7 flex items-center justify-center'}>
            {users.length ? (
              <NPopconfirm onPositiveClick={() => remove(r.key)} positiveText={tt('scada.confirm')} negativeText={tt('scada.cancel')}>
                {{
                  trigger: () => deleteButton(r.key),
                  default: () => tt('scada.vars.deleteConfirm', { n: users.length })
                }}
              </NPopconfirm>
            ) : (
              <span onClick={() => remove(r.key)}>{deleteButton(r.key)}</span>
            )}
          </div>
        </div>
      )
    }

    const renderBody = () => (
      <div class={'flex flex-col gap-2'} onKeydown={onKeydown} data-scada-vars-dialog>
        <div class={'rounded border border-solid border-gray-200 overflow-hidden'}>
          <div class={'flex items-center gap-2 px-2 py-1 bg-gray-50 text-xs text-gray-500 border-0 border-b border-solid border-gray-200'}>
            <span class={'w-6 shrink-0 text-right'}>#</span>
            <span class={'flex-1 min-w-0'}>{tt('scada.vars.name')}</span>
            <span class={'hidden sm:block w-16 shrink-0'}>{tt('scada.vars.key')}</span>
            <span class={'w-20 shrink-0'}>{tt('scada.vars.value')}</span>
            <span class={'w-10 shrink-0 text-center'}>{tt('scada.vars.usage')}</span>
            <span class={'w-6 shrink-0'} />
          </div>
          <NScrollbar style={{ maxHeight: 'min(46vh, 380px)' }}>
            <div ref={listRef}>
              {rows.value.length ? rows.value.map(renderRow) : <div class={'px-3 py-6 text-center text-xs text-gray-400'} data-var-empty>{tt('scada.vars.empty')}</div>}
            </div>
          </NScrollbar>
        </div>
        <div class={'flex items-center gap-2'}>
          <NButton size="small" secondary type="primary" data-var-add disabled={rows.value.length >= MAX_VARIABLES} onClick={add}>
            ＋ {tt('scada.vars.add')}
          </NButton>
          <span class={'text-xs text-gray-400'} data-var-count>{tt('scada.vars.count', { n: rows.value.length })}</span>
        </div>
        <div class={'text-xs text-gray-500 leading-5 whitespace-pre-line'}>{tt('scada.vars.hint')}</div>
      </div>
    )

    return () => (
      <NModal
        show={scada.varsShow}
        preset="card"
        title={tt('scada.vars.title')}
        closable
        maskClosable={false}
        autoFocus={false}
        style={{ width: '680px', maxWidth: '96vw' }}
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
              <NButton data-var-cancel onClick={close}>{tt('scada.cancel')}</NButton>
              <NButton type="primary" data-var-apply disabled={!canApply.value} onClick={apply}>
                {tt('scada.confirm')}
              </NButton>
            </div>
          )
        }}
      </NModal>
    )
  }
})
