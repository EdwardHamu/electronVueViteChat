/**
 * 数据项选择浮窗（属性面板「数据绑定」区块的「数据项」按钮打开），样式仿经典 HMI 变量选择对话框：
 *  - 左侧树：数据源 → 分组（如设备名）；点数据源 = 看它的全部数据项，点分组 = 只看该组；
 *  - 右侧表格：名称 / 数据类型 / 单位，「名称」表头下带一个快速过滤输入框（按名称模糊匹配）；
 *    数据类型来自设备配置接口（采集地址 AddressString 里的 DataType，渲染时经 i18n 翻译成文本）；
 *  - 单击行选中，双击行 = 选中并确定；底部「显示全部」勾选后忽略左侧分组、显示当前数据源全部数据项；
 *  - 「确定」把选择回传（onApply），「关闭」不改任何东西。
 */
import { NButton, NCheckbox, NInput, NModal, NScrollbar } from 'naive-ui'
import { computed, defineComponent, ref, watch, type PropType } from 'vue'
import { dataSourceList, getDataSource } from './dataSource'
import type { BindingOption, DataBinding } from './types'
import { tt } from './widgets/common'

/**
 * 数据类型索引 → i18n key（顺序与 devConfig/enum.ts 的 getDataTypeList 一致）。
 * 不直接用那边的 DataTypeList：它在模块加载时就用 t() 生成文本，而语言包是异步加载的，
 * 加载完成前取到的是裸 key（显示成 config.unsignedInt16），且语言切换后也不会自己刷新；
 * 这里改为渲染时 tt() 现翻译，语言包加载 / 切换都能正确显示
 */
const DATA_TYPE_KEYS = ['config.unsignedInt16', 'config.signedInt16', 'config.unsignedInt32', 'config.signedInt32', 'config.float32', 'config.asciiChar', 'config.boolean']

/** 数据类型索引 → 显示文本；没有类型信息（如本地数据源）显示「—」 */
const dataTypeName = (o: BindingOption) => {
  if (o.dataType === undefined || o.dataType === null) return '—'
  const key = DATA_TYPE_KEYS[o.dataType]
  return key ? tt(key) : String(o.dataType)
}

export default defineComponent({
  name: 'ScadaBindingPickerDialog',
  props: {
    show: { type: Boolean, default: false },
    /** 打开时优先定位到的数据源（属性面板「数据源」下拉的当前值） */
    sourceId: { type: String, default: '' },
    /** 组件当前的绑定（打开时回显选中状态） */
    value: { type: Object as PropType<DataBinding | null>, default: null }
  },
  emits: ['close', 'apply'],
  setup(props, { emit }) {
    const curSource = ref('')
    /** 左侧选中的分组；null = 整个数据源 */
    const curGroup = ref<string | null>(null)
    const selKey = ref<string | null>(null)
    const filter = ref('')
    const showAll = ref(false)

    // 打开时初始化：定位到当前绑定（或面板当前数据源），清空过滤
    watch(
      () => props.show,
      show => {
        if (!show) return
        const b = props.value
        curSource.value = b?.source || props.sourceId || dataSourceList()[0]?.id || ''
        selKey.value = b && b.source === curSource.value ? b.key : null
        const opt = selKey.value ? getDataSource(curSource.value)?.options().find(o => o.key === selKey.value) : undefined
        curGroup.value = opt?.group || null
        filter.value = ''
        showAll.value = false
      },
      { immediate: true }
    )

    /** 左侧树：数据源 → 去重后的分组列表 */
    const tree = computed(() =>
      dataSourceList().map(p => ({
        id: p.id,
        label: p.label(),
        groups: Array.from(new Set(p.options().map(o => o.group).filter((g): g is string => !!g)))
      }))
    )

    /** 右侧表格行：按 分组（除非显示全部）+ 快速过滤 筛选 */
    const items = computed<BindingOption[]>(() => {
      const provider = getDataSource(curSource.value)
      if (!provider) return []
      let list = provider.options()
      if (!showAll.value && curGroup.value) list = list.filter(o => o.group === curGroup.value)
      const kw = filter.value.trim().toLowerCase()
      if (kw) list = list.filter(o => o.label.toLowerCase().includes(kw))
      return list
    })

    const pickNode = (source: string, group: string | null) => {
      if (curSource.value !== source) selKey.value = null
      curSource.value = source
      curGroup.value = group
    }
    const canApply = computed(() => !!selKey.value && items.value.some(o => o.key === selKey.value))
    const apply = () => {
      const opt = getDataSource(curSource.value)?.options().find(o => o.key === selKey.value)
      if (!opt) return
      emit('apply', { source: curSource.value, key: opt.key, label: opt.label })
      emit('close')
    }

    const treeNode = (active: boolean, depth: number, label: string, icon: string, onClick: () => void, attrs: Record<string, string>) => (
      <div
        {...attrs}
        class={
          'flex items-center gap-1 px-1.5 py-0.5 text-xs cursor-pointer select-none truncate ' +
          (active ? 'bg-[#cfe0f3] text-[#1f3b5c] font-bold' : 'text-gray-700 hover:bg-gray-100')
        }
        style={{ paddingLeft: `${8 + depth * 16}px` }}
        onClick={onClick}
      >
        <span class={'shrink-0'}>{icon}</span>
        <span class={'truncate'}>{label}</span>
      </div>
    )

    const renderTree = () => (
      <div class={'w-[140px] shrink-0 border border-solid border-gray-300 rounded bg-white overflow-hidden flex flex-col'}>
        <NScrollbar class={'flex-1 min-h-0'}>
          {tree.value.map(src => (
            <div key={src.id}>
              {treeNode(curSource.value === src.id && curGroup.value === null, 0, src.label, '🗂', () => pickNode(src.id, null), { 'data-picker-source': src.id })}
              {src.groups.map(g =>
                treeNode(curSource.value === src.id && curGroup.value === g, 1, g, '🏷', () => pickNode(src.id, g), { 'data-picker-group': g })
              )}
            </div>
          ))}
        </NScrollbar>
      </div>
    )

    const renderTable = () => (
      <div class={'flex-1 min-w-0 border border-solid border-gray-300 rounded bg-white overflow-hidden flex flex-col'}>
        {/* 表头 + 名称列下的快速过滤输入框 */}
        <div class={'shrink-0 border-0 border-b border-solid border-gray-300 bg-[#eef1f5]'}>
          <div class={'flex items-center text-xs font-bold text-gray-700'}>
            <span class={'flex-1 min-w-0 px-1.5 py-1'}>{tt('scada.panel.pickerName')}</span>
            <span class={'w-[110px] shrink-0 px-1.5 py-1 border-0 border-l border-solid border-gray-300'}>{tt('scada.panel.pickerType')}</span>
            <span class={'w-[64px] shrink-0 px-1.5 py-1 border-0 border-l border-solid border-gray-300'}>{tt('scada.panel.pickerUnit')}</span>
          </div>
          <div class={'px-1 pb-1'}>
            <NInput size="small" value={filter.value} placeholder={tt('scada.panel.pickerFilter')} clearable data-picker-filter onUpdateValue={(v: string) => (filter.value = v)} />
          </div>
        </div>
        <NScrollbar class={'flex-1 min-h-0'}>
          {items.value.length ? (
            items.value.map(o => (
              <div
                key={o.key}
                data-picker-row={o.key}
                class={
                  'flex items-center text-xs cursor-pointer border-0 border-b border-solid border-gray-100 ' +
                  (selKey.value === o.key ? 'bg-[#cfe0f3] text-[#1f3b5c]' : 'text-gray-800 hover:bg-gray-50')
                }
                onClick={() => (selKey.value = o.key)}
                onDblclick={() => {
                  selKey.value = o.key
                  apply()
                }}
              >
                <span class={'flex-1 min-w-0 px-1.5 py-1 truncate'} title={o.label}>{o.label}</span>
                <span class={'w-[110px] shrink-0 px-1.5 py-1 truncate'} data-picker-datatype>{dataTypeName(o)}</span>
                <span class={'w-[64px] shrink-0 px-1.5 py-1 truncate'}>{o.unit || '—'}</span>
              </div>
            ))
          ) : (
            <div class={'px-3 py-8 text-center text-xs text-gray-400'} data-picker-empty>{tt('scada.panel.pickerEmpty')}</div>
          )}
        </NScrollbar>
      </div>
    )

    return () => (
      <NModal
        show={props.show}
        preset="card"
        title={tt('scada.panel.pickerTitle')}
        closable
        maskClosable={false}
        autoFocus={false}
        style={{ width: '490px', maxWidth: '96vw' }}
        contentStyle={{ padding: '8px 14px' }}
        footerStyle={{ padding: '6px 14px 10px' }}
        onUpdateShow={(v: boolean) => {
          if (!v) emit('close')
        }}
      >
        {{
          default: () => (
            <div class={'flex gap-1.5'} style={{ height: 'min(36vh, 294px)' }} data-scada-binding-picker>
              {renderTree()}
              {renderTable()}
            </div>
          ),
          footer: () => (
            <div class={'flex items-center gap-1.5'}>
              <NCheckbox size="small" checked={showAll.value} data-picker-show-all onUpdateChecked={(v: boolean) => (showAll.value = v)}>
                {tt('scada.panel.pickerShowAll')}
              </NCheckbox>
              <div class={'flex-1'} />
              <NButton size="small" type="primary" data-picker-apply disabled={!canApply.value} onClick={apply}>
                {tt('scada.confirm')}
              </NButton>
              <NButton size="small" data-picker-close onClick={() => emit('close')}>{tt('scada.panel.pickerClose')}</NButton>
            </div>
          )
        }}
      </NModal>
    )
  }
})
