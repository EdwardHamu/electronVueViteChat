/**
 * 画布级全局脚本引擎（启动 / 循环 / 结束），代码存在 ScadaLayout.scripts 里（属性面板空选区的「全局脚本」区块编辑）。
 *
 * 执行时机：
 *  - 启动脚本：画布进入展示（运行）模式后执行一次；
 *  - 循环脚本：展示模式下按 loopMs（默认 1000ms）反复执行；
 *  - 结束脚本：应用退出前（window beforeunload）执行；回到编辑模式只停止循环，不触发结束脚本。
 *
 * 脚本写法：一段普通 JS 语句（不需要包成函数），全局对象 scada 提供：
 *  - scada.read(名称或key, 数据源?)   读数据项，返回 DataPoint（含 value / text / status / upper / lower…），自动按需订阅
 *  - scada.value(名称或key, 数据源?)  直接取数值（无数据返回 null）
 *  - scada.write(名称或key, 值, 数据源?)  写入可写数据源（如内部变量）
 *  - scada.widgets()                  所有组件 [{ id, type, title }]
 *  - scada.setProp(组件标题或id, 属性名, 值)   运行时修改组件属性（props 任意键 + hidden / x / y / w / h），临时覆盖不入库
 *  - scada.getProp(组件标题或id, 属性名)       读组件属性（含运行时覆盖）
 *  - scada.state                      三个脚本共享的持久对象（进入展示模式时重置）
 *  - scada.log(...)                   console 输出，带 [scada:script] 前缀
 * 任何错误不会中断运行，记录在 scriptErrors（属性面板「全局脚本」区块可见）。
 */
import { reactive } from 'vue'
import { clearRuntimeOverrides, readRuntimeProp, resolveParam, setRuntimeProp, SubPool } from './runtime'
import type { DataPoint, ScadaLayout, WidgetInstance, WriteValue } from './types'

export type ScriptKind = 'start' | 'loop' | 'end'

/** 最近一次运行的错误（kind → 信息）；成功运行会清掉对应条目 */
export const scriptErrors = reactive<Record<string, string>>({})

const errorText = (err: unknown) => (err instanceof Error ? `${err.name}: ${err.message}` : String(err))

type ScriptFn = (scada: Record<string, any>) => unknown
const cache = new Map<string, { fn: ScriptFn | null; error: string | null }>()

/** 编译脚本（带缓存）：普通语句体，入参名为 scada */
export const compileScript = (code: string | null | undefined): { fn: ScriptFn | null; error: string | null } => {
  const src = (code || '').trim()
  if (!src) return { fn: null, error: null }
  const hit = cache.get(src)
  if (hit) return hit
  let out: { fn: ScriptFn | null; error: string | null }
  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function('scada', `"use strict";\n${src}`) as ScriptFn
    out = { fn, error: null }
  } catch (err) {
    out = { fn: null, error: errorText(err) }
  }
  if (cache.size > 100) {
    const oldest = cache.keys().next().value
    if (oldest !== undefined) cache.delete(oldest)
  }
  cache.set(src, out)
  return out
}

// ---------------------------------------------------------------- 运行引擎（同一时间只为一个画布服务）
let getLayout: (() => ScadaLayout) | null = null
let timer: ReturnType<typeof setInterval> | null = null
let exitBound = false
const subs = new SubPool()
/** 三个脚本共享的持久状态，进入展示模式时重置 */
let sharedState: Record<string, any> = {}

const findWidget = (ref: unknown): WidgetInstance | undefined => {
  const l = getLayout ? getLayout() : null
  if (!l || ref === null || ref === undefined) return undefined
  const s = String(ref)
  return l.widgets.find(w => w.id === s) || l.widgets.find(w => (w.title || '') === s)
}

const readPoint = (keyOrName: unknown, sourceId?: unknown): DataPoint | undefined => {
  const pr = resolveParam(String(keyOrName ?? ''), sourceId === undefined ? undefined : String(sourceId))
  if (!pr) return undefined
  subs.ensure(pr)
  return pr.prov.read(pr.key)
}

const api: Record<string, any> = {
  read: (k: unknown, s?: unknown) => readPoint(k, s),
  value: (k: unknown, s?: unknown) => {
    const p = readPoint(k, s)
    return p && p.value !== undefined ? p.value : null
  },
  write: (k: unknown, value: WriteValue, s?: unknown) => {
    const pr = resolveParam(String(k ?? ''), s === undefined ? undefined : String(s))
    if (pr && pr.prov.write) return pr.prov.write(pr.key, value)
    return undefined
  },
  widgets: () => (getLayout ? getLayout().widgets.map(w => ({ id: w.id, type: w.type, title: w.title || '' })) : []),
  setProp: (ref: unknown, key: string, value: any) => {
    const w = findWidget(ref)
    if (w) setRuntimeProp(w.id, key, value)
  },
  getProp: (ref: unknown, key: string) => {
    const w = findWidget(ref)
    return w ? readRuntimeProp(w, key) : undefined
  },
  get state() {
    return sharedState
  },
  log: (...args: unknown[]) => console.log('[scada:script]', ...args)
}

const run = (kind: ScriptKind) => {
  const l = getLayout ? getLayout() : null
  const code = l?.scripts?.[kind]
  if (!code || !code.trim()) return
  const c = compileScript(code)
  if (c.error) {
    scriptErrors[kind] = c.error
    return
  }
  try {
    c.fn!(api)
    if (kind in scriptErrors) delete scriptErrors[kind]
  } catch (err) {
    scriptErrors[kind] = errorText(err)
    console.warn(`[scada:script] ${kind} failed:`, err)
  }
}

const onBeforeUnload = () => run('end')

/** 进入展示（运行）模式：清掉上一轮的运行时覆盖和共享状态，执行启动脚本并开始循环 */
export const startScripts = (layoutGetter: () => ScadaLayout) => {
  stopScripts()
  getLayout = layoutGetter
  sharedState = {}
  clearRuntimeOverrides()
  ;(['start', 'loop', 'end'] as const).forEach(k => delete scriptErrors[k])
  run('start')
  const scripts = layoutGetter().scripts
  if (scripts?.loop && scripts.loop.trim()) {
    const ms = Math.min(60000, Math.max(100, Number(scripts.loopMs) || 1000))
    timer = setInterval(() => run('loop'), ms)
  }
  if (!exitBound) {
    window.addEventListener('beforeunload', onBeforeUnload)
    exitBound = true
  }
}

/** 回到编辑模式 / 页面卸载：停止循环并退订（不执行结束脚本——那是应用退出时的事） */
export const stopScripts = () => {
  if (timer) clearInterval(timer)
  timer = null
  subs.clear()
  clearRuntimeOverrides()
  if (exitBound) {
    window.removeEventListener('beforeunload', onBeforeUnload)
    exitBound = false
  }
  getLayout = null
}
