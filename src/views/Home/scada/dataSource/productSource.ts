/**
 * 数据源：产品分类（当前启用的产品分组）下配置好的采集数据。
 *
 * - 数据项列表：GetDeviceGroups(CurrentGroupId) → 每台设备 GetShowDataGroups / GetChartDataGroups，按 GId 去重
 * - 实时值：GetRealtimeData(GId)，与右侧数值块一样按 sysConfig.ColloctInterval 轮询，但只轮询被组件绑定的 GId
 * - 标准值 / 公差：来自当前启用配方 configStore.curEnableFormulaParamList（DataGroupId == GId）
 */
import { effectScope, reactive, watch, type EffectScope } from 'vue'
import i18n from '@/i18n'
import { useConfigStore } from '@/store/config'
import { callBrige } from '@/utils/callm'
import { callFnName } from '@/utils/enum'
import type { DataGroupEntity, DataValue, DeviceGroupEntity } from '~/me'
import type { BindingOption, DataPoint, DataSourceProvider, PointStatus } from '../types'

export const PRODUCT_SOURCE_ID = 'product'

interface ItemMeta {
  key: string
  name: string
  device: string
  unit?: string
  precision?: number
}

interface Sample {
  value: number | null
  text?: string
  time: number
}

const state = reactive({
  options: [] as BindingOption[],
  meta: {} as Record<string, ItemMeta>,
  values: {} as Record<string, Sample>,
  groupId: '' as string | undefined,
  loading: false
})

const subscribers = new Map<string, number>()
let timer: ReturnType<typeof setInterval> | null = null
let scope: EffectScope | null = null
let polling = false
let refreshSeq = 0

/** callBrige 在无 webview 时返回 rejected promise、无此方法时返回 undefined，这里统一成 Promise<T | undefined> */
const asPromise = <T,>(p: any): Promise<T | undefined> => Promise.resolve(p).then(v => v as T).catch(() => undefined)

const refresh = async () => {
  const configStore = useConfigStore()
  const groupId = configStore.sysConfig.CurrentGroupId
  if (!groupId) return
  const seq = ++refreshSeq
  state.loading = true
  try {
    const devices = (await asPromise<DeviceGroupEntity[]>(callBrige(callFnName.GetDeviceGroups, groupId))) || []
    const perDevice = await Promise.all(
      (Array.isArray(devices) ? devices : []).map(async dev => {
        const [show, chart] = await Promise.all([
          asPromise<DataGroupEntity[]>(callBrige(callFnName.GetShowDataGroups, dev.GId)),
          asPromise<DataGroupEntity[]>(callBrige(callFnName.GetChartDataGroups, dev.GId))
        ])
        const items: DataGroupEntity[] = []
        if (Array.isArray(show)) items.push(...show)
        if (Array.isArray(chart)) items.push(...chart)
        return { dev, items }
      })
    )
    if (seq !== refreshSeq) return
    const meta: Record<string, ItemMeta> = {}
    const options: BindingOption[] = []
    perDevice.forEach(({ dev, items }) => {
      items.forEach(item => {
        if (!item || !item.GId || meta[item.GId]) return
        const m: ItemMeta = {
          key: item.GId,
          name: item.DataName || item.GId,
          device: dev.DeviceName || '',
          unit: item.Unit,
          precision: item.Precision
        }
        meta[item.GId] = m
        options.push({ key: m.key, label: m.name, group: m.device, unit: m.unit, precision: m.precision })
      })
    })
    state.meta = meta
    state.options = options
    state.groupId = groupId
  } finally {
    if (seq === refreshSeq) state.loading = false
  }
}

const poll = async () => {
  if (polling) return
  const keys = Array.from(subscribers.keys())
  if (!keys.length) return
  polling = true
  try {
    await Promise.all(
      keys.map(async key => {
        const res = await asPromise<DataValue>(callBrige(callFnName.GetRealtimeData, key))
        // resultProcess 在 Data 为空时会返回 1，这里只接受对象
        if (res && typeof res === 'object') {
          const v = Number(res.Value)
          state.values[key] = { value: Number.isFinite(v) ? v : null, text: res.StringValue, time: Date.now() }
        }
      })
    )
  } finally {
    polling = false
  }
}

const restartTimer = () => {
  if (timer) clearInterval(timer)
  const ms = Math.max(200, Number(useConfigStore().sysConfig.ColloctInterval) || 500)
  timer = setInterval(poll, ms)
}

const start = () => {
  if (scope) return
  scope = effectScope(true)
  scope.run(() => {
    const configStore = useConfigStore()
    // 产品分类切换（含首次加载 sysConfig）时重新拉数据项
    watch(() => configStore.sysConfig.CurrentGroupId, id => {
      if (id) refresh()
    }, { immediate: true })
    watch(() => configStore.sysConfig.ColloctInterval, () => restartTimer(), { immediate: true })
  })
}

const stop = () => {
  if (scope) {
    scope.stop()
    scope = null
  }
  if (timer) clearInterval(timer)
  timer = null
  polling = false
}

const subscribe = (key: string) => {
  subscribers.set(key, (subscribers.get(key) || 0) + 1)
  // 新绑定立即拉一次，不用等下一个周期
  if (timer) poll()
  return () => {
    const n = (subscribers.get(key) || 1) - 1
    if (n <= 0) subscribers.delete(key)
    else subscribers.set(key, n)
  }
}

const read = (key: string): DataPoint | undefined => {
  const meta = state.meta[key]
  const sample = state.values[key]
  const configStore = useConfigStore()
  const fp = configStore.curEnableFormulaParamList?.find(e => e.DataGroupId == key)
  const standard = typeof fp?.Standard === 'number' ? fp.Standard : undefined
  const upper = standard !== undefined ? standard + (fp?.UpperTol || 0) : undefined
  const lower = standard !== undefined ? standard - (fp?.LowerTol || 0) : undefined
  const value = sample ? sample.value : null
  let status: PointStatus = 'offline'
  if (value !== null) {
    if (upper !== undefined && lower !== undefined) {
      status = value > upper ? 'high' : value < lower ? 'low' : 'ok'
    } else {
      status = 'none'
    }
  }
  return {
    value,
    text: sample?.text,
    name: meta?.name,
    unit: meta?.unit,
    precision: meta?.precision,
    standard,
    upper,
    lower,
    status,
    time: sample?.time
  }
}

export const productDataSource: DataSourceProvider = {
  id: PRODUCT_SOURCE_ID,
  label: () => i18n.global.t('scada.source.product'),
  options: () => state.options,
  read,
  start,
  stop,
  refresh,
  subscribe
}

/** 供界面显示加载状态 / 当前分组 */
export const productSourceState = state
