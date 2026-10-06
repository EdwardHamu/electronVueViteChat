import { computed, defineComponent, reactive, watch } from "vue";
import { NButton, NInputNumber, NModal, NScrollbar, NSelect, NSpin, useMessage } from "naive-ui";
import { useConfigStore } from "@/store/config";
import { callBrige } from "@/utils/callm";
import { callFnName } from "@/utils/enum";
import { DEMO_RANGE_DEFAULT } from "@/utils/demoData";
import { useMyI18n } from "@/hooks/useMyI18n";
import { DataGroupEntity, DeviceGroupEntity, GroupConfigEntity } from "~/me";

type RangeRow = {
  key: string
  device: string
  name: string
  min: number | null
  max: number | null
}

/**
 * 展示模式假数据随机范围配置：
 * 按产品分类选择变量清单（设备 → 数据组，去重），为每个变量配置 min/max；
 * 未配置的变量使用默认范围（DEMO_RANGE_DEFAULT）。保存持久化到 localStorage（configStore.demoRanges）。
 */
export default defineComponent({
  name: 'DemoRangeDialog',
  props: {
    show: { type: Boolean, default: false },
  },
  emits: ['close'],
  setup(props, ctx) {
    const configStore = useConfigStore()
    const { t, i18nStore } = useMyI18n()
    const msg = useMessage()

    const alldata = reactive({
      loading: false,
      groupList: [] as GroupConfigEntity[],
      curGroupId: '' as string,
      rows: [] as RangeRow[],
    })

    const labels = computed(() => {
      const _ = i18nStore.langChangeCount
      return {
        title: t('config.demoRangeTitle'),
        group: t('config.productClassification'),
        device: t('config.demoRangeDevice'),
        variable: t('config.demoRangeVar'),
        min: t('config.demoRangeMin'),
        max: t('config.demoRangeMax'),
        empty: t('config.demoRangeEmpty'),
        tip: t('config.demoRangeTip', { min: DEMO_RANGE_DEFAULT.min, max: DEMO_RANGE_DEFAULT.max }),
        save: t('config.save'),
        cancel: t('config.cancel'),
      }
    })

    const asPromise = <T,>(p: any): Promise<T | undefined> => Promise.resolve(p).then(v => v as T).catch(() => undefined)

    /** 拉取某产品分类下全部变量（设备 → 展示/图表数据组，按 GId 去重） */
    const loadRows = async (groupId: string) => {
      alldata.loading = true
      try {
        const devices = (await asPromise<DeviceGroupEntity[]>(callBrige(callFnName.GetDeviceGroups, groupId))) || []
        const seen = new Set<string>()
        const rows: RangeRow[] = []
        for (const dev of (Array.isArray(devices) ? devices : [])) {
          const [show, chart] = await Promise.all([
            asPromise<DataGroupEntity[]>(callBrige(callFnName.GetShowDataGroups, dev.GId)),
            asPromise<DataGroupEntity[]>(callBrige(callFnName.GetChartDataGroups, dev.GId)),
          ])
          const items: DataGroupEntity[] = []
          if (Array.isArray(show)) items.push(...show)
          if (Array.isArray(chart)) items.push(...chart)
          items.forEach(item => {
            if (!item?.GId || seen.has(item.GId)) return
            seen.add(item.GId)
            const saved = configStore.demoRanges?.[item.GId]
            rows.push({
              key: item.GId,
              device: dev.DeviceName || '',
              name: item.DataName || item.GId,
              min: Number.isFinite(Number(saved?.min)) ? Number(saved!.min) : null,
              max: Number.isFinite(Number(saved?.max)) ? Number(saved!.max) : null,
            })
          })
        }
        alldata.rows = rows
      } finally {
        alldata.loading = false
      }
    }

    const loadGroups = async () => {
      const groups = (await asPromise<GroupConfigEntity[]>(callBrige(callFnName.GetGroupConfigs))) || []
      alldata.groupList = Array.isArray(groups) ? groups : []
      const cur = configStore.sysConfig.CurrentGroupId
      alldata.curGroupId = (cur && alldata.groupList.find(g => g.GId == cur)) ? cur : (alldata.groupList[0]?.GId || '')
      if (alldata.curGroupId) await loadRows(alldata.curGroupId)
      else alldata.rows = []
    }

    watch(() => props.show, (v) => {
      if (v) loadGroups()
    })

    const groupOptions = computed(() => alldata.groupList.map(g => ({ label: g.GroupName, value: g.GId as string })))

    const onGroupChange = (v: string) => {
      alldata.curGroupId = v
      loadRows(v)
    }

    /** 保存：与已有配置合并（保留其他产品分类下已配的范围），min/max 颠倒自动交换，只填一半或相等视为未配置 */
    const save = () => {
      const merged: Record<string, { min: number, max: number }> = { ...(configStore.demoRanges || {}) }
      for (const row of alldata.rows) {
        const hasMin = row.min != null && Number.isFinite(Number(row.min))
        const hasMax = row.max != null && Number.isFinite(Number(row.max))
        if (hasMin && hasMax && Number(row.min) !== Number(row.max)) {
          let lo = Number(row.min), hi = Number(row.max)
          if (lo > hi) [lo, hi] = [hi, lo]
          merged[row.key] = { min: lo, max: hi }
        } else {
          delete merged[row.key]
        }
      }
      configStore.setDemoRanges(merged)
      msg.success(t('config.saveComplete'))
      ctx.emit('close')
    }

    return () => (
      <NModal show={props.show} onUpdateShow={(v: boolean) => { if (!v) ctx.emit('close') }}>
        <div class={'bg-white rounded-md shadow-xl flex flex-col'} style={{ width: 'min(680px, 94vw)', maxHeight: 'min(560px, 86vh)' }} data-demo-range-dialog>
          <div class={'flex items-center justify-between px-4 py-2'} style={{ borderBottom: '1px solid #c2cbd4' }}>
            <span class={'text-lg font-bold'}>{labels.value.title}</span>
            <NButton quaternary size="small" onClick={() => ctx.emit('close')}>✕</NButton>
          </div>
          <div class={'flex items-center gap-2 px-4 py-2 flex-shrink-0'}>
            <span>{labels.value.group}:</span>
            <NSelect class={'w-[220px]'} size="small" value={alldata.curGroupId || null}
              options={groupOptions.value} onUpdateValue={onGroupChange} />
            <span class={'text-sm text-[#7a8699] ml-auto'}>{labels.value.tip}</span>
          </div>
          <div class={'px-4 pb-1 flex items-center text-sm font-bold text-[#4d75a1] flex-shrink-0'}>
            <span class={'w-[150px]'}>{labels.value.device}</span>
            <span class={'flex-1'}>{labels.value.variable}</span>
            <span class={'w-[140px]'}>{labels.value.min}</span>
            <span class={'w-[140px] ml-2'}>{labels.value.max}</span>
          </div>
          <NScrollbar class={'flex-1 px-4'} style={{ maxHeight: '330px' }}>
            <NSpin show={alldata.loading}>
              {
                alldata.rows.length === 0 && !alldata.loading
                  ? <div class={'text-center text-[#7a8699] py-8'}>{labels.value.empty}</div>
                  : alldata.rows.map(row => (
                    <div class={'flex items-center py-1'} key={row.key} data-demo-range-row>
                      <span class={'w-[150px] truncate pr-2'} title={row.device}>{row.device}</span>
                      <span class={'flex-1 truncate pr-2'} title={row.name}>{row.name}</span>
                      <NInputNumber class={'w-[140px]'} size="small" showButton={false} value={row.min}
                        placeholder={String(DEMO_RANGE_DEFAULT.min)}
                        onUpdateValue={(v: number | null) => { row.min = v }} />
                      <NInputNumber class={'w-[140px] ml-2'} size="small" showButton={false} value={row.max}
                        placeholder={String(DEMO_RANGE_DEFAULT.max)}
                        onUpdateValue={(v: number | null) => { row.max = v }} />
                    </div>
                  ))
              }
            </NSpin>
          </NScrollbar>
          <div class={'flex justify-end gap-2 px-4 py-3 flex-shrink-0'} style={{ borderTop: '1px solid #c2cbd4' }}>
            <NButton size="small" onClick={() => ctx.emit('close')}>{labels.value.cancel}</NButton>
            <NButton size="small" type="primary" data-demo-range-save onClick={save}>{labels.value.save}</NButton>
          </div>
        </div>
      </NModal>
    )
  }
})
