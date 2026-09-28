/**
 * 数据源：模拟信号。
 * 作用：1) 没有 C# 宿主（浏览器 / Playwright）时也能调试组态页；2) 作为"第二个数据源"的示例，
 * 说明新增数据源只需要实现 DataSourceProvider 并注册，组件层不用改。
 */
import { reactive } from 'vue'
import i18n from '@/i18n'
import type { BindingOption, DataPoint, DataSourceProvider, PointStatus } from '../types'

export const SIM_SOURCE_ID = 'sim'

interface SimItem {
  key: string
  label: () => string
  unit: string
  precision: number
  standard?: number
  upper?: number
  lower?: number
  next: (t: number, prev: number | null) => number
}

const t = (k: string) => i18n.global.t(k)

const items: SimItem[] = [
  {
    key: 'sine', label: () => t('scada.sim.sine'), unit: '%', precision: 1,
    standard: 50, upper: 80, lower: 20,
    next: now => 50 + 40 * Math.sin(now / 3000)
  },
  {
    key: 'walk', label: () => t('scada.sim.walk'), unit: 'mm', precision: 3,
    standard: 1.5, upper: 1.55, lower: 1.45,
    next: (_, prev) => {
      const base = prev === null ? 1.5 : prev
      const v = base + (Math.random() - 0.5) * 0.01
      return Math.min(1.6, Math.max(1.4, v))
    }
  },
  {
    key: 'saw', label: () => t('scada.sim.saw'), unit: '℃', precision: 0,
    standard: 50, upper: 90, lower: 10,
    next: now => (now / 100) % 100
  },
  {
    key: 'square', label: () => t('scada.sim.square'), unit: '', precision: 0,
    next: now => (Math.floor(now / 2000) % 2)
  }
]

const state = reactive({
  values: {} as Record<string, { value: number; time: number }>
})

let timer: ReturnType<typeof setInterval> | null = null

const tick = () => {
  const now = Date.now()
  items.forEach(item => {
    const prev = state.values[item.key]
    state.values[item.key] = { value: item.next(now, prev ? prev.value : null), time: now }
  })
}

const start = () => {
  if (timer) return
  tick()
  timer = setInterval(tick, 500)
}

const stop = () => {
  if (timer) clearInterval(timer)
  timer = null
}

const read = (key: string): DataPoint | undefined => {
  const item = items.find(e => e.key === key)
  if (!item) return undefined
  const sample = state.values[key]
  const value = sample ? sample.value : null
  let status: PointStatus = 'offline'
  if (value !== null) {
    if (item.upper !== undefined && item.lower !== undefined) {
      status = value > item.upper ? 'high' : value < item.lower ? 'low' : 'ok'
    } else {
      status = 'none'
    }
  }
  return {
    value,
    name: item.label(),
    unit: item.unit,
    precision: item.precision,
    standard: item.standard,
    upper: item.upper,
    lower: item.lower,
    status,
    time: sample?.time
  }
}

export const simDataSource: DataSourceProvider = {
  id: SIM_SOURCE_ID,
  label: () => t('scada.source.sim'),
  options: (): BindingOption[] => items.map(e => ({ key: e.key, label: e.label(), group: t('scada.source.sim'), unit: e.unit, precision: e.precision })),
  read,
  start,
  stop
}
