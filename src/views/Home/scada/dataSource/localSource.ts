/**
 * 数据源：内部变量。
 * 宿主桥目前没有向仪器写值的接口，按钮 / 开关 / IO 域这类控制组件需要一个可写的目标：
 * 这里提供一批通用内部变量（数值 / 文本都能存），写入后所有绑定同一变量的组件立即刷新，
 * 并持久化到 localStorage（key `scadaLocalVars`），重启后保留。
 *
 * 任务 60：变量不再是固定的 16 个——「有哪些变量、叫什么名字」是布局的一部分（ScadaLayout.variables，工具栏「内部变量」按钮里增 / 删 / 改名，
 * 随草稿撤销 / 保存 / 导出），这里只负责「值」：定义通过 setLocalVarResolver() 由 store 注入（编辑中读草稿、展示时读已保存布局），
 * 没注入 / 取不到（单独使用、单测）时退回默认的 var1 ~ var16。
 * 后端以后提供写接口时，只要给产品分类数据源实现 write()，控制组件不用改。
 */
import { reactive } from 'vue'
import i18n from '@/i18n'
import type { BindingOption, DataPoint, DataSourceProvider, LocalVarDef, WriteValue } from '../types'
import { DEFAULT_VAR_COUNT, defaultVariables, isValidVarKey, LOCAL_SOURCE_ID, varDisplayName } from '../variables'

export { LOCAL_SOURCE_ID }
export const LOCAL_VARS_KEY = 'scadaLocalVars'
/** 老版本固定的变量个数（= 默认变量数） */
export const LOCAL_VAR_COUNT = DEFAULT_VAR_COUNT

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

const FALLBACK: readonly LocalVarDef[] = defaultVariables()
let resolver: (() => readonly LocalVarDef[] | undefined) | null = null

/** 注册「当前生效的变量定义」的来源（store 注册；返回 undefined 表示取不到，退回默认的 16 个） */
export const setLocalVarResolver = (fn: (() => readonly LocalVarDef[] | undefined) | null) => {
  resolver = fn
}

/** 当前生效的变量定义（读的是响应式状态，computed 里调用会自动跟踪改名 / 增删） */
export const localVarDefs = (): readonly LocalVarDef[] => {
  try {
    return (resolver && resolver()) || FALLBACK
  } catch {
    return FALLBACK
  }
}

const find = (key: string) => localVarDefs().find(v => v.key === key)

const load = () => {
  if (state.loaded) return
  state.loaded = true
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(LOCAL_VARS_KEY) : null
    const saved = raw ? JSON.parse(raw) : null
    if (saved && typeof saved === 'object') {
      // 所有合法 key 都读进来（变量定义可以增删，删掉的变量的值留到保存退出时再清理）
      Object.keys(saved).forEach(k => {
        const v = saved[k]
        if (isValidVarKey(k) && v && typeof v === 'object') {
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

const label = (v: LocalVarDef) => varDisplayName(v, t('scada.source.localVar'))

const read = (key: string): DataPoint | undefined => {
  const def = find(key)
  if (!def) return undefined
  load()
  const v = state.vars[key]
  return {
    value: v ? v.value : null,
    text: v?.text,
    name: label(def),
    unit: '',
    precision: 2,
    status: v && (v.value !== null || v.text) ? 'none' : 'offline',
    time: v?.time
  }
}

const write = (key: string, value: WriteValue) => {
  if (!find(key)) return
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

/** 测试 / 调试用：清空全部内部变量的值 */
export const resetLocalVars = () => {
  load()
  Object.keys(state.vars).forEach(k => delete state.vars[k])
  persist()
}

/** 只保留给定 key 的值（保存并退出编辑后，清理已经被删除的变量留下的值） */
export const pruneLocalVarValues = (keep: Iterable<string>) => {
  load()
  const set = new Set(keep)
  let changed = false
  Object.keys(state.vars).forEach(k => {
    if (!set.has(k)) {
      delete state.vars[k]
      changed = true
    }
  })
  if (changed) persist()
}

export const localDataSource: DataSourceProvider = {
  id: LOCAL_SOURCE_ID,
  label: () => t('scada.source.local'),
  options: (): BindingOption[] => localVarDefs().map(v => ({ key: v.key, label: label(v), group: t('scada.source.local'), unit: '', precision: 2 })),
  read,
  write,
  writable: key => !!find(key)
}
