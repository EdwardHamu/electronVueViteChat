/**
 * 组件级数据处理函数：用户在属性面板里写一段 JS，宿主（Canvas.tsx 的 WidgetHost）在数据源送来的 DataPoint
 * 交给组件渲染之前先经过它。代码保存在 WidgetInstance.transform 里，随布局一起持久化。
 *
 * 支持三种写法（按顺序识别）：
 *   1. 完整函数：      (value, point, ctx) => value * 1000      /  function (value) { ... }
 *   2. 函数体（含 return）： if (value > 10) return '高'; return '低'
 *   3. 单个表达式：    value * 1000
 *
 * 参数：value = point.value（无数据时为 null），point = 原始数据点（未绑定时为 undefined），
 *       ctx = { widget, history, state, prev, now, get, setProp }，其中 state 是该组件专属的持久对象（可做滑动平均等），
 *       history 是宿主保留的最近 N 个显示值（keepHistory 组件），prev 为上一次处理结果；
 *       ctx.get(名称或key, 数据源?) 监听 / 读取其他数据项（自动订阅，变化时函数重新执行），
 *       ctx.setProp(属性名, 值) 临时修改本组件属性（含 hidden / x / y / w / h；编辑态也生效，但几何键只在展示态应用）。
 * 返回值：
 *   - undefined            不改动
 *   - null                 清空数值（显示 --）
 *   - 数字                 替换 value（状态 / 公差保持原样）
 *   - 字符串 / 布尔        作为显示文本（value 置 null，组件按 text 显示）
 *   - 对象                 合并进 DataPoint：value / text / name / unit / precision / standard / upper / lower / status / time；
 *                          对象里改了 standard / upper / lower 但没给 status 时，会按新公差重新判定状态
 * 函数抛错时保持原始数据点不变，错误信息通过 transformErrors 反馈到属性面板。
 */
import { reactive } from 'vue'
import type { DataPoint, PointStatus, WidgetInstance } from './types'

export interface TransformContext {
  widget: Pick<WidgetInstance, 'id' | 'type' | 'title' | 'props'>
  history: readonly number[]
  /** 组件专属的持久状态，代码改变时清空 */
  state: Record<string, any>
  /** 上一次处理结果 */
  prev: DataPoint | undefined
  now: number
  /**
   * 监听 / 读取其他数据项：按 key 或名称查找（可选第二参限定数据源 id），返回 DataPoint（含 value / status 等）。
   * 宿主会自动按需订阅被读到的数据项，它的值变化时处理函数会重新执行——即「监听某个参数」
   */
  get?: (keyOrName: string, sourceId?: string) => DataPoint | undefined
  /**
   * 修改本组件的属性（propSchema 里的任意键，以及 hidden / x / y / w / h）。
   * 编辑和展示模式都生效（编辑模式下 x / y / w / h 不应用，避免和拖拽冲突；hidden 按编辑态惯例显示为半透明）。
   * 是临时的运行时覆盖，不写进布局；代码改变时该组件的覆盖会被清掉，进入展示模式时全部重置
   */
  setProp?: (key: string, value: any) => void
}

export type TransformFn = (value: number | null, point: DataPoint | undefined, ctx: TransformContext) => unknown

export interface CompiledTransform {
  source: string
  fn: TransformFn | null
  /** 编译（语法）错误 */
  error: string | null
}

export interface TransformResult {
  point: DataPoint | undefined
  /** 编译或运行时错误 */
  error: string | null
}

/** 属性面板用：每个组件最近一次处理的错误（无错误时不存在该 key） */
export const transformErrors = reactive<Record<string, string>>({})
/** 属性面板用：每个组件最近一次处理的输入 / 输出，方便调试 */
export const transformDebug = reactive<Record<string, { input?: DataPoint; output?: DataPoint }>>({})

export const reportTransform = (id: string, result: TransformResult, input: DataPoint | undefined) => {
  if (result.error) transformErrors[id] = result.error
  else if (id in transformErrors) delete transformErrors[id]
  transformDebug[id] = { input, output: result.point }
}
export const clearTransformReport = (id: string) => {
  delete transformErrors[id]
  delete transformDebug[id]
}

const EMPTY: CompiledTransform = { source: '', fn: null, error: null }
const cache = new Map<string, CompiledTransform>()
const CACHE_MAX = 200
const VALID_STATUS: PointStatus[] = ['ok', 'high', 'low', 'offline', 'none']
/** 以 function / async function / 箭头函数开头 */
const FUNCTION_RE = /^(async\s+)?(function\b|\(?\s*[\w$]*(\s*,\s*[\w$]+)*\s*\)?\s*=>)/

const errorText = (err: unknown) => {
  if (err instanceof Error) return `${err.name}: ${err.message}`
  return String(err)
}

/** 编译（带缓存，按源码字符串命中）；空代码返回 fn 为 null 且无错误 */
export const compileTransform = (code: string | null | undefined): CompiledTransform => {
  const src = (code || '').trim()
  if (!src) return EMPTY
  const hit = cache.get(src)
  if (hit) return hit
  let compiled: CompiledTransform
  try {
    let fn: unknown
    if (FUNCTION_RE.test(src)) {
      // eslint-disable-next-line no-new-func
      fn = new Function(`"use strict";\nreturn (\n${src}\n);`)()
    } else if (/\breturn\b/.test(src)) {
      // eslint-disable-next-line no-new-func
      fn = new Function('value', 'point', 'ctx', `"use strict";\n${src}`)
    } else {
      // eslint-disable-next-line no-new-func
      fn = new Function('value', 'point', 'ctx', `"use strict";\nreturn (\n${src.replace(/;+\s*$/, '')}\n);`)
    }
    if (typeof fn !== 'function') throw new TypeError('code does not evaluate to a function')
    compiled = { source: src, fn: fn as TransformFn, error: null }
  } catch (err) {
    compiled = { source: src, fn: null, error: errorText(err) }
  }
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value
    if (oldest !== undefined) cache.delete(oldest)
  }
  cache.set(src, compiled)
  return compiled
}

const toNumber = (v: unknown): number | undefined => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined
  if (typeof v === 'bigint') return Number(v)
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v)
    return Number.isFinite(n) ? n : undefined
  }
  return undefined
}

const statusByLimits = (value: number | null, upper?: number, lower?: number): PointStatus => {
  if (value === null || !Number.isFinite(value)) return 'offline'
  if (upper === undefined && lower === undefined) return 'none'
  if (upper !== undefined && value > upper) return 'high'
  if (lower !== undefined && value < lower) return 'low'
  return 'ok'
}

/** 把函数返回值合并成新的 DataPoint（纯函数，便于单测） */
export const mergeTransformResult = (point: DataPoint | undefined, result: unknown): DataPoint | undefined => {
  if (result === undefined) return point
  const base: DataPoint = point ? { ...point } : { value: null, status: 'none' }
  if (result === null) {
    base.value = null
    delete base.text
    return base
  }
  switch (typeof result) {
    case 'number':
      base.value = Number.isFinite(result) ? result : null
      return base
    case 'bigint':
      base.value = Number(result)
      return base
    case 'string':
    case 'boolean':
      base.value = null
      base.text = String(result)
      return base
    case 'object': {
      if (Array.isArray(result)) throw new TypeError('array result is not supported')
      if (typeof (result as any).then === 'function') throw new TypeError('async function is not supported')
      const r = result as Record<string, unknown>
      let limitsChanged = false
      if ('value' in r) {
        const v = r.value
        if (v === null || v === undefined) {
          base.value = null
        } else if (typeof v === 'string' && toNumber(v) === undefined) {
          base.value = null
          base.text = v
        } else {
          const n = toNumber(v)
          base.value = n === undefined ? null : n
        }
      }
      if ('text' in r) {
        if (r.text === null || r.text === undefined || r.text === '') delete base.text
        else base.text = String(r.text)
      }
      if ('name' in r && r.name !== undefined && r.name !== null) base.name = String(r.name)
      if ('unit' in r) base.unit = r.unit === null || r.unit === undefined ? undefined : String(r.unit)
      if ('precision' in r) {
        const p = toNumber(r.precision)
        base.precision = p === undefined ? undefined : Math.max(0, Math.min(10, Math.round(p)))
      }
      for (const k of ['standard', 'upper', 'lower'] as const) {
        if (k in r) {
          limitsChanged = true
          const n = toNumber(r[k])
          if (n === undefined) delete base[k]
          else base[k] = n
        }
      }
      if ('time' in r) {
        const t = toNumber(r.time)
        if (t !== undefined) base.time = t
      }
      if ('status' in r && typeof r.status === 'string' && VALID_STATUS.includes(r.status as PointStatus)) {
        base.status = r.status as PointStatus
      } else if (limitsChanged) {
        base.status = statusByLimits(base.value, base.upper, base.lower)
      }
      return base
    }
    default:
      // function / symbol 等：忽略
      return point
  }
}

/** 执行处理函数；任何错误都不会抛出，而是返回原始数据点 + error */
export const runTransform = (compiled: CompiledTransform, point: DataPoint | undefined, ctx: TransformContext): TransformResult => {
  if (compiled.error) return { point, error: compiled.error }
  if (!compiled.fn) return { point, error: null }
  try {
    const out = compiled.fn(point ? point.value : null, point, ctx)
    return { point: mergeTransformResult(point, out), error: null }
  } catch (err) {
    return { point, error: errorText(err) }
  }
}

/** 属性面板「插入示例」用的代码片段（文案在 locales 的 scada.transformExample 下） */
export const TRANSFORM_EXAMPLES: { key: string; code: string }[] = [
  { key: 'scale', code: '// mm -> μm\nreturn value * 1000' },
  { key: 'round', code: 'return Math.round(value * 100) / 100' },
  { key: 'text', code: "if (value === null) return '--'\nreturn value > 10 ? '高' : '低'" },
  {
    key: 'limits',
    code: "// 数值和公差一起换算，状态会按新公差重新判定\nconst k = 1000\nreturn {\n  value: value * k,\n  standard: point.standard * k,\n  upper: point.upper * k,\n  lower: point.lower * k,\n  unit: 'μm'\n}"
  },
  {
    key: 'average',
    code: '// 最近 10 个值的滑动平均（ctx.state 在两次调用之间保留）\nconst buf = ctx.state.buf || (ctx.state.buf = [])\nif (value !== null) buf.push(value)\nif (buf.length > 10) buf.shift()\nif (!buf.length) return null\nreturn buf.reduce((a, b) => a + b, 0) / buf.length'
  },
  { key: 'status', code: "// 自定义报警：大于 5 视为超上限\nreturn { status: value !== null && value > 5 ? 'high' : 'ok' }" },
  {
    key: 'listen',
    code: "// 监听其他参数并修改本组件属性（编辑 / 展示模式都生效）：\n// var1 > 5 时背景变红、var1 > 10 时隐藏本组件（编辑态显示为半透明）\nconst p = ctx.get('var1')          // 按名称或 key 读取，自动订阅\nconst v = p ? p.value : null\nctx.setProp('bg', v !== null && v > 5 ? '#dc2626' : '')\nctx.setProp('hidden', v !== null && v > 10)\nreturn value"
  }
]
