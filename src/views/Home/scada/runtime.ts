/**
 * 展示（运行）模式的运行时支撑：
 *  - runtimeOverrides：脚本 / 数据处理函数对组件属性的临时覆盖（widgetId → { 属性名: 值 }）。
 *    支持 props 里的任意键 + 顶层 hidden / x / y / w / h；只作用于展示渲染，不写进布局、不持久化，
 *    每次进入展示模式时清空；
 *  - resolveParam：按 key 或名称在数据源里找数据项（供 ctx.get / 全局脚本的 read/write 用）；
 *  - SubPool：动态按需订阅集合（脚本 / 处理函数读到哪个数据项就订阅哪个，轮询型数据源才会去请求它）。
 */
import { reactive } from 'vue'
import { dataSourceList, getDataSource } from './dataSource'
import type { DataSourceProvider, WidgetInstance } from './types'

/** 顶层（非 props）可覆盖的键 */
const TOP_KEYS = new Set(['hidden', 'x', 'y', 'w', 'h'])

export const runtimeOverrides = reactive<Record<string, Record<string, any>>>({})

export const setRuntimeProp = (widgetId: string, key: string, value: any) => {
  if (!widgetId || !key) return
  const ov = runtimeOverrides[widgetId] || (runtimeOverrides[widgetId] = {})
  if (value === undefined) delete ov[key]
  else ov[key] = value
}

export const clearRuntimeOverrides = () => {
  Object.keys(runtimeOverrides).forEach(k => delete runtimeOverrides[k])
}

/** 展示渲染用：把运行时覆盖合并进组件实例（无覆盖时原样返回，不产生新对象）。
 *  includeGeometry = false（编辑模式）时跳过 x / y / w / h，避免和拖拽、选择框、手柄打架 */
export const applyRuntime = (w: WidgetInstance, includeGeometry = true): WidgetInstance => {
  const ov = runtimeOverrides[w.id]
  if (!ov || !Object.keys(ov).length) return w
  const GEOMETRY = ['x', 'y', 'w', 'h']
  const entries = Object.entries(ov).filter(([k]) => includeGeometry || !GEOMETRY.includes(k))
  if (!entries.length) return w
  const out: any = { ...w, props: { ...w.props } }
  entries.forEach(([k, v]) => {
    if (TOP_KEYS.has(k)) out[k] = v
    else out.props[k] = v
  })
  return out as WidgetInstance
}

/** 清掉某个组件的全部运行时覆盖（组件的处理函数代码改变 / 组件卸载时调用） */
export const clearWidgetOverrides = (widgetId: string) => {
  delete runtimeOverrides[widgetId]
}

/** 读取合并覆盖后的属性值（全局脚本 getProp 用） */
export const readRuntimeProp = (w: WidgetInstance, key: string) => {
  const ov = runtimeOverrides[w.id]
  if (ov && key in ov) return ov[key]
  if (TOP_KEYS.has(key)) return (w as any)[key]
  return w.props[key]
}

export interface ParamRef {
  prov: DataSourceProvider
  key: string
}

/**
 * 按 key（如 GId / var3）或显示名称找数据项。
 * sourceId 指定只在某个数据源里找；否则先在 preferSource（组件自己绑定的数据源）里找，再找其余数据源。
 */
export const resolveParam = (keyOrName: string, sourceId?: string, preferSource?: string): ParamRef | null => {
  if (!keyOrName) return null
  let provs: DataSourceProvider[]
  if (sourceId) {
    const p = getDataSource(sourceId)
    provs = p ? [p] : []
  } else {
    provs = dataSourceList().slice()
    if (preferSource) {
      const i = provs.findIndex(p => p.id === preferSource)
      if (i > 0) provs.unshift(provs.splice(i, 1)[0])
    }
  }
  // 先按 key 精确匹配（跨数据源），再按名称匹配
  for (const prov of provs) {
    if (prov.options().some(o => o.key === keyOrName)) return { prov, key: keyOrName }
  }
  for (const prov of provs) {
    const hit = prov.options().find(o => o.label === keyOrName)
    if (hit) return { prov, key: hit.key }
  }
  return null
}

/** 动态订阅集合：ensure 幂等（同一数据项只订阅一次），clear 全部退订 */
export class SubPool {
  private map = new Map<string, () => void>()
  ensure(ref: ParamRef) {
    const sk = `${ref.prov.id}|${ref.key}`
    if (this.map.has(sk)) return
    const un = ref.prov.subscribe ? ref.prov.subscribe(ref.key) : () => {}
    this.map.set(sk, un)
  }
  clear() {
    this.map.forEach(un => un())
    this.map.clear()
  }
}
