/**
 * 数据源：内部变量。
 * 宿主桥目前没有向仪器写值的接口，按钮 / 开关 / IO 域这类控制组件需要一个可写的目标：
 * 这里提供 16 个通用内部变量（数值 / 文本都能存），写入后所有绑定同一变量的组件立即刷新，
 * 并持久化到 localStorage（key `scadaLocalVars`），重启后保留。
 * 后端以后提供写接口时，只要给产品分类数据源实现 write()，控制组件不用改。
 */
import { reactive } from 'vue'
import i18n from '@/i18n'
import type { BindingOption, DataPoint, DataSourceProvider, WriteValue } from '../types'

export const LOCAL_SOURCE_ID = 'local'
export const LOCAL_VARS_KEY = 'scadaLocalVars'
export const LOCAL_VAR_COUNT = 16

const t = (k: string) => i18n.global.t(k)

interface LocalVar {
  value: number | null
  text?: string
  time?: number
}

const state = reactive({
  vars: {} as Record<string, LocalVar>,
  loaded: false
})

const keys = Array.from({ length: LOCAL_VAR_COUNT }, (_, i) => `var${i + 1}`)

const load = () => {
  if (state.loaded) return
  state.loaded = true
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(LOCAL_VARS_KEY) : null
    const saved = raw ? JSON.parse(raw) : null
    if (saved && typeof saved === 'object') {
      keys.forEach(k => {
        const v = saved[k]
        if (v && typeof v === 'object') {
          const num = v.value === null || v.value === undefined ? null : Number(v.value)
          state.vars[k] = { value: num !== null && Number.isFinite(num) ? num : null, text: typeof v.text === 'string' ? v.text : undefined, time: Number(v.time) || undefined }
        }
      })
    }
  } catch (err) {
    console.warn('[scada] load local vars failed', err)
  }
}

const persist = () => {
  try {
    localStorage.setItem(LOCAL_VARS_KEY, JSON.stringify(state.vars))
  } catch (err) {
    console.warn('[scada] save local vars failed', err)
  }
}

const label = (key: string) => `${t('scada.source.localVar')} ${key.replace('var', '')}`

const read = (key: string): DataPoint | undefined => {
  if (!keys.includes(key)) return undefined
  load()
  const v = state.vars[key]
  return {
    value: v ? v.value : null,
    text: v?.text,
    name: label(key),
    unit: '',
    precision: 2,
    status: v && (v.value !== null || v.text) ? 'none' : 'offline',
    time: v?.time
  }
}

const write = (key: string, value: WriteValue) => {
  if (!keys.includes(key)) return
  load()
  const now = Date.now()
  if (typeof value === 'boolean') state.vars[key] = { value: value ? 1 : 0, time: now }
  else if (typeof value === 'number') state.vars[key] = { value: Number.isFinite(value) ? value : null, time: now }
  else {
    // 文本：能解析成数字的同时存数值，方便数值类组件读取
    const n = value.trim() === '' ? NaN : Number(value)
    state.vars[key] = { value: Number.isFinite(n) ? n : null, text: value, time: now }
  }
  persist()
}

/** 测试 / 调试用：清空全部内部变量 */
export const resetLocalVars = () => {
  load()
  keys.forEach(k => delete state.vars[k])
  persist()
}

export const localDataSource: DataSourceProvider = {
  id: LOCAL_SOURCE_ID,
  label: () => t('scada.source.local'),
  options: (): BindingOption[] => keys.map(k => ({ key: k, label: label(k), group: t('scada.source.local'), unit: '', precision: 2 })),
  read,
  write,
  writable: () => true
}
