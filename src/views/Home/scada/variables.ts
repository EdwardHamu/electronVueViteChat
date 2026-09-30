/**
 * 内部变量（数据源 local）的定义与纯函数（不依赖 Vue / i18n，可单测）。
 *
 *  - 定义跟着布局走（ScadaLayout.variables）：增 / 删 / 改名都是对草稿的改动——可撤销、随「保存」持久化、随组态包导出 / 导入；
 *  - 变量的「值」是运行期数据，不在布局里（dataSource/localSource.ts 把它存在 localStorage `scadaLocalVars`）；
 *  - 标识 key 形如 var17，自动编号且不复用：layout.variableSeq 记「下一个编号」，删掉 var17 再新增得到 var18，
 *    这样还留着旧标识的地方（饼图数据项、别处导入的布局）不会悄悄绑到一个新变量上；
 *  - name 为空表示用默认名「变量 N」（随语言切换），用户起过名字就原样显示。
 */
import type { LocalVarDef, WidgetInstance } from './types'

export const LOCAL_SOURCE_ID = 'local'
/** 老版本固定的变量个数：新建布局 / 读入没有 variables 字段的老布局时补上 var1 ~ var16 */
export const DEFAULT_VAR_COUNT = 16
export const MAX_VARIABLES = 200
export const MAX_VAR_NAME = 40

const KEY_RE = /^[A-Za-z_][A-Za-z0-9_-]{0,31}$/
const NUM_RE = /^var(\d+)$/

export const isValidVarKey = (key: unknown): key is string => typeof key === 'string' && KEY_RE.test(key)

/** var17 → 17；不是 var<数字> 形式返回 null */
export const varNumber = (key: string): number | null => {
  const m = NUM_RE.exec(key)
  return m ? Number(m[1]) : null
}

export const defaultVariables = (): LocalVarDef[] => Array.from({ length: DEFAULT_VAR_COUNT }, (_, i) => ({ key: `var${i + 1}`, name: '' }))

/** 默认名：「<前缀> N」（前缀是 i18n 的「变量」），标识不是 var<数字> 时直接用标识 */
export const defaultVarName = (key: string, prefix: string) => `${prefix} ${varNumber(key) ?? key}`

/** 显示名：用户起的名字优先，没起名用默认名 */
export const varDisplayName = (v: { key: string; name?: string }, prefix: string) => {
  const n = (v.name || '').trim()
  return n || defaultVarName(v.key, prefix)
}

/** 下一个自动编号：不小于给定的 seq，也一定大于现有所有 var<数字> 的编号 */
export const nextVarSeq = (list: readonly { key: string }[], seq?: unknown) => {
  const s = Number(seq)
  let next = Number.isFinite(s) && s >= 1 ? Math.floor(s) : 1
  list.forEach(v => {
    const n = varNumber(v.key)
    if (n !== null && n + 1 > next) next = n + 1
  })
  return next
}

/** 名字整理：去首尾空白、限长 */
export const cleanVarName = (name: unknown) => (typeof name === 'string' ? name.trim().slice(0, MAX_VAR_NAME) : '')

/**
 * 整理任意来源的变量列表：丢弃不合法 / 重复的 key，名字去空白限长。不是数组返回 null（调用方决定用默认值还是保持原样）
 */
export const sanitizeVariables = (raw: unknown): LocalVarDef[] | null => {
  if (!Array.isArray(raw)) return null
  const seen = new Set<string>()
  const out: LocalVarDef[] = []
  raw.forEach(item => {
    if (!item || typeof item !== 'object') return
    const key = (item as any).key
    if (!isValidVarKey(key) || seen.has(key) || out.length >= MAX_VARIABLES) return
    seen.add(key)
    out.push({ key, name: cleanVarName((item as any).name) })
  })
  return out
}

/** 某个变量被哪些组件用到：数据绑定，或（饼图这类）数据源选了内部变量并把它列进了数据项 */
export const variableUsers = <T extends Pick<WidgetInstance, 'binding' | 'props'>>(widgets: readonly T[], key: string): T[] =>
  widgets.filter(w => {
    if (w.binding && w.binding.source === LOCAL_SOURCE_ID && w.binding.key === key) return true
    const p = w.props
    return !!p && p.source === LOCAL_SOURCE_ID && Array.isArray(p.items) && p.items.includes(key)
  })

/** 变量被删除后：绑着它的组件解除绑定（其余引用保持原样——key 不会被复用，残留的只是不显示） */
export const unbindVariables = (widgets: WidgetInstance[], removed: ReadonlySet<string>) => {
  let n = 0
  widgets.forEach(w => {
    if (w.binding && w.binding.source === LOCAL_SOURCE_ID && removed.has(w.binding.key)) {
      w.binding = null
      n++
    }
  })
  return n
}
