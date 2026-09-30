/**
 * 撤销 / 重做的历史栈（快照式，纯逻辑：不依赖 Vue / Pinia，可单测）。
 *
 * 做法：每一步记录「操作之前」草稿的 JSON 快照 + 当时的选中项；撤销 = 把当前状态压进重做栈、恢复栈顶快照。
 * 好处是任何对草稿的改动（画布属性、组件、内部变量……）都不需要各自写反向操作就能撤销。
 *  - 最多保留最近 HISTORY_LIMIT（10）步，再多就丢掉最早的；
 *  - 合并（merge）：连续的同类小改动算一步——拖一次 = 一步（整个拖动过程共用一个合并键，不限时），
 *    在输入框里连续打字 / 点数字框的加减 / 按住方向键，在窗口期内（默认 1 秒）同键的改动并进上一步；
 *  - 新的改动会清空重做栈；撤销 / 重做之后不再合并（lastKey 清掉），免得把新改动并进已经被撤销的那一步。
 * 快照只包含会被保存的内容（画布配置、组件、内部变量定义）；选中项单独记，视图状态（缩放 / 网格开关 / 面板开关）不在历史里。
 */

export const HISTORY_LIMIT = 10
/** 同键改动并进上一步的默认窗口期（ms） */
export const MERGE_WINDOW = 1000

export interface HistoryEntry {
  /** 这一步「之前」的草稿快照（snapshotJson 的输出） */
  json: string
  /** 这一步「之前」的选中项 */
  selection: string[]
  /** 产生这一步的 store action 名（调试 / 测试用） */
  label: string
}

export interface HistoryState {
  undo: HistoryEntry[]
  redo: HistoryEntry[]
  limit: number
  /** 最近一次记录 / 合并的键与时间 */
  lastKey?: string
  lastTime: number
  /** 进入编辑 / 上次保存时的快照：当前快照与它不同才算「有未保存的修改」 */
  savedJson: string
  /** 正在执行的「被记录的 action」嵌套深度：只有最外层那一层记一步 */
  depth: number
}

export const createHistory = (savedJson = '', limit = HISTORY_LIMIT): HistoryState => ({ undo: [], redo: [], limit, lastKey: undefined, lastTime: 0, savedJson, depth: 0 })

/** 清空历史（进入 / 退出编辑时），并把 savedJson 重设为当前基线 */
export const resetHistory = (h: HistoryState, savedJson = '') => {
  h.undo.length = 0
  h.redo.length = 0
  h.lastKey = undefined
  h.lastTime = 0
  h.savedJson = savedJson
  h.depth = 0
}

/** 草稿（或已保存布局）→ 快照文本。只取会被保存的内容 */
export const snapshotJson = (l: { canvas: unknown; widgets: unknown; variables?: unknown; variableSeq?: unknown }) =>
  JSON.stringify({ canvas: l.canvas, widgets: l.widgets, variables: l.variables, variableSeq: l.variableSeq })

/** 这次改动能否并进上一步：同一个合并键、上一步还在栈顶，且在窗口期内（windowMs = Infinity 表示不限时，拖动手势用） */
export const canMerge = (h: HistoryState, key: string | undefined, now: number, windowMs = MERGE_WINDOW) =>
  !!key && h.undo.length > 0 && h.lastKey === key && (windowMs === Infinity || now - h.lastTime <= windowMs)

const trim = (list: HistoryEntry[], limit: number) => {
  if (list.length > limit) list.splice(0, list.length - limit)
}

/** 记一步（entry = 操作之前的状态）；清空重做栈，超过上限丢掉最早的 */
export const pushStep = (h: HistoryState, entry: HistoryEntry, key: string | undefined, now: number) => {
  h.undo.push(entry)
  trim(h.undo, h.limit)
  h.redo.length = 0
  h.lastKey = key
  h.lastTime = now
}

/** 并进上一步：那一步已经保存了最初的「操作之前」状态，这里只刷新时间 */
export const mergeStep = (h: HistoryState, now: number) => {
  h.redo.length = 0
  h.lastTime = now
}

/** 撤销：current 是当前状态（压进重做栈），返回要恢复的那一步；没有可撤销的返回 null */
export const takeUndo = (h: HistoryState, current: HistoryEntry): HistoryEntry | null => {
  const entry = h.undo.pop()
  if (!entry) return null
  h.redo.push(current)
  trim(h.redo, h.limit)
  h.lastKey = undefined
  return entry
}

/** 重做：current 是当前状态（压回撤销栈），返回要恢复的那一步；没有可重做的返回 null */
export const takeRedo = (h: HistoryState, current: HistoryEntry): HistoryEntry | null => {
  const entry = h.redo.pop()
  if (!entry) return null
  h.undo.push(current)
  trim(h.undo, h.limit)
  h.lastKey = undefined
  return entry
}
