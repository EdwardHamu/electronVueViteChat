/**
 * 组态页状态：已保存布局 layout、编辑中的草稿 draft、选中项、面板开关。
 * 编辑模式下所有改动都落在 draft 上，保存时整体写回 layout 并持久化；取消则丢弃草稿。
 *
 * 选中项是一个有序的 id 列表 selectedIds（Ctrl / Shift 点击多选）：
 *  - 第一个是「参考对象」（对齐 / 等宽高以它为准，它本身不动）；
 *  - selectedId / selected 只在「恰好选中一个」时有值（属性面板 / 组件库高亮按单选处理），多选走 selectedWidgets。
 * 数组顺序即层级：widgets 越靠后越在上面（图层栏、置顶 / 置底都基于它）。
 * 对齐 / 分布 / 旋转等排列运算是 arrange.ts 里的纯函数，这里只负责取数据、把结果（Patch）落到草稿上并夹紧到画布内。
 *
 * 任务 60：
 *  - 撤销 / 重做：对草稿的每个改动 action（见 HISTORY_ACTIONS）都会记一步「操作之前」的快照（history.ts，最多 10 步，连续的同类小改动合并成一步）；
 *    通过 $onAction 统一挂钩，action 本身不用各写反向操作。startEdit 时挂上，进入 / 退出编辑时清空历史。
 *  - 保存有两种：save() 保存并退出编辑；save({ stay: true }) 保存但留在编辑模式（Ctrl + S），历史保留、仍可撤销到保存之前。
 *  - 内部变量的定义（variables / variableSeq）是草稿的一部分（setVariables），本地数据源通过 setLocalVarResolver 读取当前生效的那份。
 *  - 组件剪贴板（复制 / 剪切 / 粘贴）在模块级，退出编辑后仍保留。
 */
import { defineStore } from 'pinia'
import { toRaw } from 'vue'
import { v4 as uuidv4 } from 'uuid'
import {
  alignItems,
  centerInCanvas,
  distributeItems,
  fitPatchesInside,
  flipItems,
  orderBackward,
  orderForward,
  orderRelative,
  orderToBack,
  orderToFront,
  rotateItems,
  scaleItems,
  sizeItems,
  type AlignKind,
  type ArrangeItem,
  type CanvasCenterKind,
  type DistributeMode,
  type Patch,
  type SizeMode
} from './arrange'
import { pruneLocalVarValues, setLocalVarResolver } from './dataSource/localSource'
import { clampLayoutRect, cloneDeep, findFreeSpot, normRotate, snap, unionRect, visualRect } from './geometry'
import { canMerge, createHistory, mergeStep, pushStep, resetHistory, snapshotJson, takeRedo, takeUndo, type HistoryEntry, type HistoryState } from './history'
import { createEmptyLayout, LAYOUT_VERSION } from './layout'
import { getWidgetDefinition } from './registry'
import { cleanupUnusedResources } from './resource'
import { getLayoutStorage } from './storage'
import type { CanvasConfig, DataBinding, LocalVarDef, ScadaLayout, ScadaScripts, WidgetInstance, WidgetRect } from './types'
import { defaultVariables, nextVarSeq, sanitizeVariables, unbindVariables } from './variables'

const DEFAULT_MIN = { w: 20, h: 20 }
const minOf = (type: string) => getWidgetDefinition(type)?.minSize || DEFAULT_MIN

/** 组件实例 → 排列运算用的扁平对象 */
export const toArrangeItem = (w: WidgetInstance): ArrangeItem => ({
  id: w.id,
  x: w.x,
  y: w.y,
  w: w.w,
  h: w.h,
  rotate: w.rotate,
  flipX: w.flipX,
  flipY: w.flipY,
  locked: w.locked,
  min: minOf(w.type)
})

/** id 所在组合的全部成员（数组顺序），id 本人排第一；没有组合就是它自己 */
const withGroupMembers = (widgets: readonly WidgetInstance[], id: string): string[] => {
  const w = widgets.find(e => e.id === id)
  if (!w) return []
  if (!w.groupId) return [id]
  return [id, ...widgets.filter(e => e.groupId === w.groupId && e.id !== id).map(e => e.id)]
}

/**
 * 复制一批组件（副本有新 id）：组合里的成员一起复制时，副本组成一个新的组合（不和原组合混在一起）；
 * 只复制了组合里的一部分时，落单的副本不算组合。返回副本和「原 id → 副本 id」
 */
const cloneWidgets = (sources: readonly WidgetInstance[]) => {
  const groupMap = new Map<string, string>()
  const idMap = new Map<string, string>()
  const copies = sources.map(src => {
    const copy: WidgetInstance = { ...cloneDeep(src), id: uuidv4() }
    idMap.set(src.id, copy.id)
    if (src.groupId) {
      if (!groupMap.has(src.groupId)) groupMap.set(src.groupId, uuidv4())
      copy.groupId = groupMap.get(src.groupId)
    }
    return copy
  })
  const size = new Map<string, number>()
  copies.forEach(c => c.groupId && size.set(c.groupId, (size.get(c.groupId) || 0) + 1))
  copies.forEach(c => {
    if (c.groupId && (size.get(c.groupId) || 0) < 2) delete c.groupId
  })
  return { copies, idMap }
}

/** 把一批组件整体平移 (dx, dy)，但整体（视觉外接框）不越出画布 */
const shiftInside = (copies: WidgetInstance[], canvas: CanvasConfig, dx: number, dy: number) => {
  const u = unionRect(copies.map(visualRect))
  if (!u) return
  const ddx = Math.max(-u.x, Math.min(dx, canvas.width - u.x - u.w))
  const ddy = Math.max(-u.y, Math.min(dy, canvas.height - u.y - u.h))
  copies.forEach(c => {
    c.x += ddx
    c.y += ddy
  })
}

/** 组件剪贴板（模块级：退出编辑后仍保留）。cut = 剪切来的：第一次粘贴回原位；复制来的第一次粘贴错开一格（原件还在） */
interface ClipboardData {
  items: WidgetInstance[]
  pastes: number
  cut: boolean
}
let clipboard: ClipboardData | null = null

// ---------------------------------------------------------------- 撤销 / 重做：挂在 store 的 $onAction 上
interface HistorySpec {
  /** 合并键：同键的连续改动在窗口期内并成一步 */
  merge?: string
  /** 窗口期（ms），默认 1 秒；Infinity = 不限时（拖动手势：整个拖动过程是一步） */
  window?: number
}
const joinIds = (v: unknown) => (Array.isArray(v) ? v.map((e: any) => (typeof e === 'string' ? e : e && e.id)).join(',') : String(v))
const keysOf = (v: unknown) => Object.keys((v as object) || {}).sort().join(',')
const plain = (): HistorySpec => ({})
/**
 * 会改动草稿、需要记一步的 action。列在这里的才会被记录；选择 / 视图开关 / 保存 / 撤销重做本身都不记。
 * 嵌套调用（removeSelected → removeWidgets、alignSelection → applyPatches……）只有最外层记一步。
 */
const HISTORY_ACTIONS: Record<string, (args: any[], store: any) => HistorySpec> = {
  addWidget: plain,
  duplicateWidget: plain,
  duplicateWidgets: plain,
  pasteClipboard: plain,
  cutSelection: plain,
  removeWidget: plain,
  removeWidgets: plain,
  removeSelected: plain,
  clearWidgets: plain,
  replaceDraft: plain,
  batch: plain,
  setVariables: plain,
  setBinding: plain,
  reorder: plain,
  bringToFront: plain,
  sendToBack: plain,
  moveForward: plain,
  moveBackward: plain,
  moveRelative: plain,
  groupSelection: plain,
  ungroupSelection: plain,
  setLocked: plain,
  setHidden: plain,
  alignSelection: plain,
  alignSelectionToCanvas: plain,
  distributeSelection: plain,
  sizeSelection: plain,
  rotateSelection: plain,
  flipSelection: plain,
  setFlip: plain,
  // 连续的小改动合并：输入框打字 / 数字框加减 / 颜色连选 / 按住方向键
  updateWidget: a => ({ merge: `upd:${a[0]}:${keysOf(a[1])}` }),
  setWidgetProp: a => ({ merge: `prop:${a[0]}:${a[1]}` }),
  setCanvas: a => ({ merge: `canvas:${keysOf(a[0])}` }),
  setScripts: a => ({ merge: `scripts:${keysOf(a[0])}` }),
  updateWidgetRect: a => ({ merge: `rect:${a[0]}` }),
  setRotation: a => ({ merge: `rot:${a[0]}` }),
  nudgeSelection: (_a, s) => ({ merge: `nudge:${s.selectedIds.join(',')}`, window: 600 }),
  resizeSelectionTo: (_a, s) => ({ merge: `bounds:${s.selectedIds.join(',')}` }),
  // 画布拖动 / 缩放：传了 merge 键（每次拖动一个）= 整个手势一步；没传（属性面板等）按组件合并
  applyPatches: a => (a[1] && a[1].merge ? { merge: String(a[1].merge), window: Infinity } : { merge: `patch:${joinIds(a[0])}` })
}

/**
 * 历史栈按「store 的原始对象」索引（toRaw）：开发模式下 pinia 给每次 action 调用的 this 包一层新的 Proxy（devtools 的 action 分组），
 * 直接拿 this 当 WeakMap 的键每次都会得到一份新的空历史。
 */
const histories = new WeakMap<object, HistoryState>()
const historyOf = (store: object) => {
  const key = toRaw(store)
  let h = histories.get(key)
  if (!h) {
    h = createHistory()
    histories.set(key, h)
  }
  return h
}
/** 把栈深度同步到响应式状态（撤销 / 重做按钮的可用状态） */
const syncHistory = (store: any, h: HistoryState) => {
  store.historyUndo = h.undo.length
  store.historyRedo = h.redo.length
}
const hooked = new WeakSet<object>()
const installHistory = (self: any) => {
  if (hooked.has(toRaw(self))) return
  hooked.add(toRaw(self))
  self.$onAction((ctx: { name: string; args: any[]; store: any; after: (cb: (r: any) => void) => void; onError: (cb: (e: unknown) => void) => void }) => {
    // 长期持有的引用用 ctx.store（稳定的 store），不用 action 里的 this（开发模式下每次调用都是新 Proxy）
    const store = ctx.store
    const spec = HISTORY_ACTIONS[ctx.name]
    if (!spec || !store.draft) return
    const h = historyOf(store)
    // 嵌套调用：外层那个 action 已经在记了
    if (h.depth > 0) return
    h.depth++
    const info = spec(ctx.args, store)
    const now = Date.now()
    const merge = canMerge(h, info.merge, now, info.window)
    // 并入上一步时不需要再拍「操作之前」的快照（那一步已经保存了最初的状态）——拖动过程中的每次 pointermove 因此几乎零开销
    const before: HistoryEntry | null = merge ? null : { json: snapshotJson(store.draft), selection: store.selectedIds.slice(), label: ctx.name }
    let closed = false
    const close = (ok: boolean) => {
      if (closed) return
      closed = true
      h.depth = Math.max(0, h.depth - 1)
      if (!ok || !store.draft) return
      if (merge) {
        mergeStep(h, now)
        syncHistory(store, h)
        return
      }
      const after = snapshotJson(store.draft)
      if (after === before!.json) return // 没有实际改动：不占历史
      pushStep(h, before!, info.merge, now)
      store.dirty = after !== h.savedJson
      syncHistory(store, h)
    }
    ctx.after(() => close(true))
    ctx.onError(() => close(false))
  }, true)
}
/** 恢复一份快照到草稿（原地替换数组内容，保持 draft / widgets 的引用不变）+ 选中项 */
const restoreSnapshot = (store: any, entry: HistoryEntry, h: HistoryState) => {
  const d = store.draft as ScadaLayout
  const data = JSON.parse(entry.json)
  d.canvas = data.canvas
  d.widgets.splice(0, d.widgets.length, ...data.widgets)
  d.variables = data.variables
  d.variableSeq = data.variableSeq
  const have = new Set(d.widgets.map(w => w.id))
  store.selectedIds = entry.selection.filter(id => have.has(id))
  store.dirty = entry.json !== h.savedJson
}

export const useScadaStore = defineStore('scada', {
  state: () => ({
    layout: createEmptyLayout() as ScadaLayout,
    draft: null as ScadaLayout | null,
    loaded: false,
    editing: false,
    /** 选中的组件 id（有序，第一个是参考对象） */
    selectedIds: [] as string[],
    paletteShow: true,
    propsShow: true,
    /** 图层栏 */
    layersShow: true,
    /** 网格：显示网格线并吸附（关闭后只按整数像素取整） */
    gridOn: true,
    /** 编辑器全屏（盖住整个应用窗口；只在编辑模式有效） */
    fullscreen: false,
    dirty: false,
    saving: false,
    /** 撤销 / 重做栈的深度（栈本身在模块级，不进响应式状态；这里只给按钮判断可用） */
    historyUndo: 0,
    historyRedo: 0,
    /** 组件剪贴板里的组件数 */
    clipboardSize: 0,
    /** 「内部变量」管理弹窗（工具栏按钮 / 属性面板的入口共用） */
    varsShow: false
  }),
  getters: {
    /** 当前应当渲染的布局：编辑中为草稿，否则为已保存布局 */
    current(state): ScadaLayout {
      return state.editing && state.draft ? state.draft : state.layout
    },
    /** 选中的组件，按选中顺序（第一个是参考对象） */
    selectedWidgets(state): WidgetInstance[] {
      const l = state.editing && state.draft ? state.draft : state.layout
      const byId = new Map(l.widgets.map(w => [w.id, w] as const))
      return state.selectedIds.map(id => byId.get(id)).filter((w): w is WidgetInstance => !!w)
    },
    /** 仅在恰好选中一个组件时有值 */
    selectedId(state): string | null {
      return state.selectedIds.length === 1 ? state.selectedIds[0] : null
    },
    selected(state): WidgetInstance | undefined {
      if (state.selectedIds.length !== 1) return undefined
      const l = state.editing && state.draft ? state.draft : state.layout
      return l.widgets.find(w => w.id === state.selectedIds[0])
    },
    /** 参考对象：最先选中的那个 */
    referenceId(state): string | null {
      return state.selectedIds.length ? state.selectedIds[0] : null
    },
    canUndo(state): boolean {
      return state.editing && state.historyUndo > 0
    },
    canRedo(state): boolean {
      return state.editing && state.historyRedo > 0
    },
    /** 当前生效的内部变量定义（编辑中为草稿里的，否则是已保存布局里的） */
    variables(state): LocalVarDef[] {
      const l = state.editing && state.draft ? state.draft : state.layout
      // 没有 variables 字段的布局（没经过 normalizeLayout 的外部数据）按老版本处理：固定的 var1 ~ var16
      return l.variables || defaultVariables()
    }
  },
  actions: {
    /** 首次进入时从存储加载；没有保存过则按传入尺寸建空布局 */
    async load(defaultSize?: { width: number; height: number }) {
      if (this.loaded) return
      const saved = await getLayoutStorage().load()
      this.layout = saved || createEmptyLayout(defaultSize?.width, defaultSize?.height)
      this.loaded = true
    },
    startEdit() {
      this.draft = cloneDeep(this.layout)
      this.editing = true
      this.selectedIds = []
      this.fullscreen = false
      this.dirty = false
      this.varsShow = false
      installHistory(this)
      const h = historyOf(this)
      resetHistory(h, snapshotJson(this.draft))
      syncHistory(this, h)
    },
    cancelEdit() {
      this.draft = null
      this.editing = false
      this.selectedIds = []
      this.fullscreen = false
      this.dirty = false
      this.varsShow = false
      const h = historyOf(this)
      resetHistory(h)
      syncHistory(this, h)
    },
    /**
     * 保存草稿。默认保存并退出编辑；stay = true（Ctrl + S）保存后留在编辑模式：草稿和撤销历史都保留，之后仍可撤销到保存之前。
     * 留在编辑模式时不清理宿主里不再引用的图片 / 已删变量的值——否则撤销把它们找回来时资源已经没了，这些清理推迟到「保存并退出」。
     */
    async save(opts?: { stay?: boolean }) {
      if (!this.draft) return
      this.saving = true
      try {
        const layout = cloneDeep(this.draft)
        layout.version = LAYOUT_VERSION
        layout.updatedAt = Date.now()
        await getLayoutStorage().save(layout)
        this.layout = layout
        const h = historyOf(this)
        if (opts?.stay && this.editing && this.draft) {
          // 基线换成「刚保存的内容」（保存期间若又改了草稿，仍然算未保存）；之后的改动不与保存前的那一步合并
          h.savedJson = snapshotJson(layout)
          h.lastKey = undefined
          this.dirty = snapshotJson(this.draft) !== h.savedJson
          return
        }
        this.draft = null
        this.editing = false
        this.selectedIds = []
        this.fullscreen = false
        this.dirty = false
        this.varsShow = false
        resetHistory(h)
        syncHistory(this, h)
        // 保存后的布局就是唯一生效的布局：顺手把宿主 Resources/pic 里不再引用的图片、已删除变量的值清掉（异步 / 失败都不影响保存）
        cleanupUnusedResources(layout)
        pruneLocalVarValues((layout.variables || []).map(v => v.key))
      } finally {
        this.saving = false
      }
    },
    /** 撤销一步（最多回溯最近 10 步）；返回是否执行 */
    undo(): boolean {
      if (!this.editing || !this.draft) return false
      const h = historyOf(this)
      if (!h.undo.length) return false
      const top = h.undo[h.undo.length - 1]
      const entry = takeUndo(h, { json: snapshotJson(this.draft), selection: this.selectedIds.slice(), label: top.label })
      if (!entry) return false
      restoreSnapshot(this, entry, h)
      syncHistory(this, h)
      return true
    },
    /** 重做一步（撤销之后、做新改动之前有效）；返回是否执行 */
    redo(): boolean {
      if (!this.editing || !this.draft) return false
      const h = historyOf(this)
      if (!h.redo.length) return false
      const top = h.redo[h.redo.length - 1]
      const entry = takeRedo(h, { json: snapshotJson(this.draft), selection: this.selectedIds.slice(), label: top.label })
      if (!entry) return false
      restoreSnapshot(this, entry, h)
      syncHistory(this, h)
      return true
    },
    /** 把几个连续的改动并成撤销历史里的一步（例如代码弹窗「确定」同时改了 HTML 和 CSS） */
    batch<T>(fn: () => T): T {
      return fn()
    },
    /** 用外部布局（导入 / 后端下发）整体替换草稿 */
    replaceDraft(layout: ScadaLayout) {
      if (!this.editing) return
      this.draft = cloneDeep(layout)
      this.selectedIds = []
      this.dirty = true
    },
    /** 展示模式下导入：直接替换已保存布局并持久化；编辑中则等同 replaceDraft（保存后才生效） */
    async applyLayout(layout: ScadaLayout) {
      if (this.editing) {
        this.replaceDraft(layout)
        return
      }
      const next = cloneDeep(layout)
      next.version = LAYOUT_VERSION
      next.updatedAt = Date.now()
      await getLayoutStorage().save(next)
      this.layout = next
      this.loaded = true
      this.selectedIds = []
      cleanupUnusedResources(next)
      // 新布局的变量定义可能比原来少：已不存在的变量的值一并清掉（否则之后新增同编号的变量会带着旧值）
      pruneLocalVarValues((next.variables || []).map(v => v.key))
    },
    setFullscreen(v: boolean) {
      this.fullscreen = v && this.editing
    },

    // ---------------------------------------------------------------- 选择
    /**
     * 选中一个组件（替换当前选择）；null 取消选择。group = true 时连同它所在组合的全部成员一起选中（画布点击用；
     * 图层栏点击只选这一个，这样组合里的单个成员也能单独选中、改属性）
     */
    select(id: string | null, opts?: { group?: boolean }) {
      if (!id) {
        this.selectedIds = []
        return
      }
      const l = this.current
      if (!l.widgets.some(w => w.id === id)) {
        this.selectedIds = []
        return
      }
      this.selectedIds = opts?.group ? withGroupMembers(l.widgets, id) : [id]
    },
    /** Ctrl / Shift 点击：已选中的取消，未选中的加到末尾（group = true 时按整个组合加减） */
    toggleSelect(id: string, opts?: { group?: boolean }) {
      const l = this.current
      const ids = opts?.group ? withGroupMembers(l.widgets, id) : l.widgets.some(w => w.id === id) ? [id] : []
      if (!ids.length) return
      if (this.selectedIds.includes(id)) {
        const drop = new Set(ids)
        this.selectedIds = this.selectedIds.filter(e => !drop.has(e))
      } else {
        this.selectedIds = [...this.selectedIds, ...ids.filter(e => !this.selectedIds.includes(e))]
      }
    },
    /** 直接设定选择（按给定顺序，忽略不存在的 id） */
    setSelection(ids: string[]) {
      const have = new Set(this.current.widgets.map(w => w.id))
      const seen = new Set<string>()
      this.selectedIds = ids.filter(id => have.has(id) && !seen.has(id) && !!seen.add(id))
    },
    selectAll() {
      this.selectedIds = this.current.widgets.map(w => w.id)
    },
    /** 把已选中的某个组件设为参考对象（移到选择列表最前） */
    setReference(id: string) {
      if (!this.selectedIds.includes(id)) return
      this.selectedIds = [id, ...this.selectedIds.filter(e => e !== id)]
    },
    /** Tab / Shift + Tab：按层级顺序切换选中下一个 / 上一个组件（单选，不带组合）；没有选中时 Tab 取最底层、Shift + Tab 取最顶层 */
    selectNext(dir: 1 | -1 = 1) {
      const list = this.current.widgets
      if (!list.length) return
      const cur = this.selectedIds.length ? list.findIndex(w => w.id === this.selectedIds[this.selectedIds.length - 1]) : -1
      const i = cur < 0 ? (dir > 0 ? 0 : list.length - 1) : (cur + dir + list.length) % list.length
      this.selectedIds = [list[i].id]
    },
    /** 删除 / 替换布局后清掉已经不存在的选中 id */
    pruneSelection() {
      const have = new Set(this.current.widgets.map(w => w.id))
      if (this.selectedIds.some(id => !have.has(id))) this.selectedIds = this.selectedIds.filter(id => have.has(id))
    },

    // ---------------------------------------------------------------- 增删改
    /**
     * 添加组件；pos 为画布逻辑坐标（组件中心），不传则自动找空位。
     * opts.cascade：放在 pos 处，但那里已经有一个一模一样的（同位置同大小）时依次向右下错开两格，不叠成一个（组件库点按用）
     */
    addWidget(type: string, pos?: { x: number; y: number }, opts?: { cascade?: boolean }): WidgetInstance | undefined {
      const def = getWidgetDefinition(type)
      if (!def || !this.draft) return
      const canvas = this.draft.canvas
      const size = { ...def.defaultSize }
      const grid = this.gridOn ? canvas.grid : 1
      const min = def.minSize || DEFAULT_MIN
      const at = pos ? { x: snap(pos.x - size.w / 2, grid), y: snap(pos.y - size.h / 2, grid) } : findFreeSpot(this.draft.widgets, size, canvas)
      let rect = clampLayoutRect({ ...at, ...size }, 0, canvas, min)
      if (opts?.cascade) {
        const step = Math.max(1, canvas.grid) * 2
        const taken = (r: WidgetRect) => this.draft!.widgets.some(w => Math.abs(w.x - r.x) < 1 && Math.abs(w.y - r.y) < 1 && Math.abs(w.w - r.w) < 1 && Math.abs(w.h - r.h) < 1)
        if (taken(rect)) {
          // 沿右下方向找第一个「完整放得下、且没被同样的占着」的位置；都没有就叠在原处
          for (let k = 1; k <= 40; k++) {
            const r = { x: rect.x + step * k, y: rect.y + step * k, w: rect.w, h: rect.h }
            if (r.x + r.w > canvas.width || r.y + r.h > canvas.height) break
            if (!taken(r)) {
              rect = r
              break
            }
          }
        }
      }
      const widget: WidgetInstance = {
        id: uuidv4(),
        type,
        title: '',
        binding: null,
        ...rect,
        props: def.defaultProps()
      }
      this.draft.widgets.push(widget)
      this.selectedIds = [widget.id]
      this.dirty = true
      return widget
    },
    duplicateWidget(id: string) {
      this.duplicateWidgets([id])
    },
    /**
     * 复制一批组件（整体偏移两格，尽量不出画布）：副本追加到最上层并成为新的选中项；
     * 组合里的成员一起复制时，副本组成一个新的组合（不和原组合混在一起）
     */
    duplicateWidgets(ids: string[]): string[] {
      if (!this.draft) return []
      const want = new Set(ids)
      const sources = this.draft.widgets.filter(w => want.has(w.id))
      if (!sources.length) return []
      const canvas = this.draft.canvas
      const step = Math.max(1, canvas.grid) * 2
      const { copies, idMap } = cloneWidgets(sources)
      shiftInside(copies, canvas, step, step)
      this.draft.widgets.push(...copies)
      // 选中顺序沿用原来的（参考对象的副本仍排第一）
      this.selectedIds = ids.map(id => idMap.get(id)).filter((id): id is string => !!id)
      this.dirty = true
      return this.selectedIds.slice()
    },

    // ---------------------------------------------------------------- 剪贴板：复制 / 剪切 / 粘贴（Ctrl + C / X / V）
    /** 复制选中的组件（按层级顺序存一份快照）；返回复制的个数 */
    copySelection(): number {
      const want = new Set(this.selectedIds)
      const items = this.current.widgets.filter(w => want.has(w.id)).map(w => cloneDeep(w))
      if (!items.length) return 0
      clipboard = { items, pastes: 0, cut: false }
      this.clipboardSize = items.length
      return items.length
    },
    /** 剪切：复制未锁定的选中组件并把它们删掉（锁定的不动）。返回剪掉的个数与被锁定拦下的个数 */
    cutSelection(): { cut: number; locked: number } {
      const sel = this.selectedWidgets
      const free = new Set(sel.filter(w => !w.locked).map(w => w.id))
      if (free.size && this.draft) {
        clipboard = { items: this.draft.widgets.filter(w => free.has(w.id)).map(w => cloneDeep(w)), pastes: 0, cut: true }
        this.clipboardSize = clipboard.items.length
        this.removeWidgets(Array.from(free))
      }
      return { cut: free.size, locked: sel.length - free.size }
    },
    /** 粘贴剪贴板里的组件：追加到最上层并选中；连续粘贴每次多错开两格（整体不越出画布）。返回新组件的 id */
    pasteClipboard(): string[] {
      if (!this.draft || !clipboard || !clipboard.items.length) return []
      const canvas = this.draft.canvas
      const step = Math.max(1, canvas.grid) * 2
      const n = clipboard.pastes + (clipboard.cut ? 0 : 1)
      clipboard.pastes++
      const { copies } = cloneWidgets(clipboard.items)
      shiftInside(copies, canvas, step * n, step * n)
      this.draft.widgets.push(...copies)
      this.selectedIds = copies.map(c => c.id)
      this.dirty = true
      return this.selectedIds.slice()
    },
    updateWidget(id: string, patch: Partial<Omit<WidgetInstance, 'id' | 'props'>>) {
      const w = this.draft?.widgets.find(e => e.id === id)
      if (!w) return
      Object.assign(w, patch)
      this.dirty = true
    },
    /**
     * 落实一批位置 / 尺寸 / 旋转 / 翻转改动：按视觉外框夹紧到画布内、不小于最小尺寸。
     * opts.merge：撤销历史的合并键——画布上一次拖动 / 缩放手势里的所有调用共用一个键，整个手势只占一步
     */
    applyPatches(patches: Patch[], opts?: { merge?: string }) {
      if (!this.draft) return
      const canvas = this.draft.canvas
      const byId = new Map(this.draft.widgets.map(w => [w.id, w] as const))
      let changed = false
      patches.forEach(p => {
        const w = byId.get(p.id)
        if (!w) return
        const rotate = p.rotate !== undefined ? normRotate(p.rotate) : normRotate(w.rotate)
        const r = clampLayoutRect({ x: p.x, y: p.y, w: p.w, h: p.h }, rotate, canvas, minOf(w.type))
        w.x = r.x
        w.y = r.y
        w.w = r.w
        w.h = r.h
        if (p.rotate !== undefined) {
          if (rotate) w.rotate = rotate
          else delete w.rotate
        }
        if (p.flipX !== undefined) {
          if (p.flipX) w.flipX = true
          else delete w.flipX
        }
        if (p.flipY !== undefined) {
          if (p.flipY) w.flipY = true
          else delete w.flipY
        }
        changed = true
      })
      if (changed) this.dirty = true
    },
    updateWidgetRect(id: string, rect: WidgetRect) {
      this.applyPatches([{ id, x: rect.x, y: rect.y, w: rect.w, h: rect.h }])
    },
    setWidgetProp(id: string, key: string, value: any) {
      const w = this.draft?.widgets.find(e => e.id === id)
      if (!w) return
      w.props[key] = value
      this.dirty = true
    },
    setBinding(id: string, binding: DataBinding | null) {
      const w = this.draft?.widgets.find(e => e.id === id)
      if (!w) return
      w.binding = binding
      this.dirty = true
    },
    removeWidget(id: string) {
      this.removeWidgets([id])
    },
    removeWidgets(ids: string[]) {
      if (!this.draft) return
      const drop = new Set(ids)
      const before = this.draft.widgets.length
      const keep = this.draft.widgets.filter(e => !drop.has(e.id))
      if (keep.length === before) return
      this.draft.widgets.splice(0, before, ...keep)
      this.dropLonelyGroups()
      this.pruneSelection()
      this.dirty = true
    },
    /** 组合至少要有两个成员：删除组件后落单的 groupId 清掉（反序列化时 normalizeLayout 也做同样的清理） */
    dropLonelyGroups() {
      if (!this.draft) return
      const size = new Map<string, number>()
      this.draft.widgets.forEach(w => w.groupId && size.set(w.groupId, (size.get(w.groupId) || 0) + 1))
      this.draft.widgets.forEach(w => {
        if (w.groupId && (size.get(w.groupId) || 0) < 2) delete w.groupId
      })
    },
    /** 删除选中的组件；锁定的不删。返回实际删除数与被锁定拦下的数量 */
    removeSelected(): { removed: number; locked: number } {
      const sel = this.selectedWidgets
      const free = sel.filter(w => !w.locked)
      if (free.length) this.removeWidgets(free.map(w => w.id))
      return { removed: free.length, locked: sel.length - free.length }
    },

    // ---------------------------------------------------------------- 图层顺序（数组顺序即层级：越靠后越在上面）
    reorder(fn: (list: readonly WidgetInstance[], ids: ReadonlySet<string>) => WidgetInstance[], ids: string | string[]) {
      if (!this.draft) return
      const set = new Set(Array.isArray(ids) ? ids : [ids])
      const list = this.draft.widgets
      const next = fn(list, set)
      if (next.length === list.length && next.every((w, i) => w.id === list[i].id)) return
      list.splice(0, list.length, ...next)
      this.dirty = true
    },
    bringToFront(ids: string | string[]) {
      this.reorder(orderToFront, ids)
    },
    sendToBack(ids: string | string[]) {
      this.reorder(orderToBack, ids)
    },
    moveForward(ids: string | string[]) {
      this.reorder(orderForward, ids)
    },
    moveBackward(ids: string | string[]) {
      this.reorder(orderBackward, ids)
    },
    /** 图层栏拖动排序：把 ids 放到目标组件的上面 / 下面 */
    moveRelative(ids: string[], targetId: string, placement: 'above' | 'below') {
      this.reorder((list, set) => orderRelative(list, set, targetId, placement), ids)
    },

    // ---------------------------------------------------------------- 组合 / 锁定 / 隐藏
    /** 组合选中的组件（至少两个）；涉及的旧组合一并并入新组合。返回是否执行 */
    groupSelection(): boolean {
      if (!this.draft) return false
      const widgets = this.draft.widgets
      const involved = new Set(this.selectedIds)
      const touched = new Set(this.selectedWidgets.map(w => w.groupId).filter((g): g is string => !!g))
      widgets.forEach(w => {
        if (w.groupId && touched.has(w.groupId)) involved.add(w.id)
      })
      if (involved.size < 2) return false
      const gid = uuidv4()
      widgets.forEach(w => {
        if (involved.has(w.id)) w.groupId = gid
      })
      // 选中按原顺序，补上被并入的成员
      this.selectedIds = [...this.selectedIds, ...widgets.filter(w => involved.has(w.id) && !this.selectedIds.includes(w.id)).map(w => w.id)]
      this.dirty = true
      return true
    },
    /** 取消组合：选中组件所在的组合整个拆散（没选中的成员也一并脱离）。返回是否执行 */
    ungroupSelection(): boolean {
      if (!this.draft) return false
      const touched = new Set(this.selectedWidgets.map(w => w.groupId).filter((g): g is string => !!g))
      if (!touched.size) return false
      this.draft.widgets.forEach(w => {
        if (w.groupId && touched.has(w.groupId)) delete w.groupId
      })
      this.dirty = true
      return true
    },
    setLocked(ids: string[], locked: boolean) {
      if (!this.draft) return
      const set = new Set(ids)
      let changed = false
      this.draft.widgets.forEach(w => {
        if (!set.has(w.id) || !!w.locked === locked) return
        if (locked) w.locked = true
        else delete w.locked
        changed = true
      })
      if (changed) this.dirty = true
    },
    setHidden(ids: string[], hidden: boolean) {
      if (!this.draft) return
      const set = new Set(ids)
      let changed = false
      this.draft.widgets.forEach(w => {
        if (!set.has(w.id) || !!w.hidden === hidden) return
        if (hidden) w.hidden = true
        else delete w.hidden
        changed = true
      })
      if (changed) this.dirty = true
    },

    // ---------------------------------------------------------------- 排列：对齐 / 分布 / 等宽高 / 旋转 / 翻转 / 微调
    /** 选中组件的排列输入（选择顺序；第一个是参考对象） */
    arrangeItems(): ArrangeItem[] {
      return this.selectedWidgets.map(toArrangeItem)
    },
    /** 与参考对象对齐 */
    alignSelection(kind: AlignKind) {
      const ref = this.referenceId
      if (!ref) return
      this.applyPatches(alignItems(this.arrangeItems(), ref, kind))
    },
    /** 相对整个画面居中（每个对象各自居中） */
    alignSelectionToCanvas(kind: CanvasCenterKind) {
      if (!this.draft) return
      this.applyPatches(centerInCanvas(this.arrangeItems(), this.draft.canvas, kind))
    },
    distributeSelection(axis: 'h' | 'v', mode: DistributeMode) {
      this.applyPatches(distributeItems(this.arrangeItems(), axis, mode))
    },
    /** 等宽 / 等高 / 等宽高（以参考对象为准） */
    sizeSelection(mode: SizeMode) {
      const ref = this.referenceId
      if (!ref) return
      this.applyPatches(sizeItems(this.arrangeItems(), ref, mode))
    },
    rotateSelection(dir: 1 | -1) {
      if (!this.draft) return
      const items = this.arrangeItems()
      this.applyPatches(fitPatchesInside(rotateItems(items, dir), items, this.draft.canvas))
    },
    flipSelection(axis: 'x' | 'y') {
      if (!this.draft) return
      const items = this.arrangeItems()
      this.applyPatches(fitPatchesInside(flipItems(items, axis), items, this.draft.canvas))
    },
    /** 属性面板：直接设定旋转角度（保持中心不变） */
    setRotation(id: string, degrees: number) {
      const w = this.draft?.widgets.find(e => e.id === id)
      if (!w || w.locked) return
      const r = normRotate(degrees)
      if (r === normRotate(w.rotate)) return
      const cx = w.x + w.w / 2
      const cy = w.y + w.h / 2
      this.applyPatches([{ id, x: Math.round(cx - w.w / 2), y: Math.round(cy - w.h / 2), w: w.w, h: w.h, rotate: r }])
    },
    /** 属性面板：设定左右 / 上下翻转开关（只改外观，不改位置） */
    setFlip(id: string, axis: 'x' | 'y', value: boolean) {
      const w = this.draft?.widgets.find(e => e.id === id)
      if (!w || w.locked) return
      this.applyPatches([{ id, x: w.x, y: w.y, w: w.w, h: w.h, ...(axis === 'x' ? { flipX: value } : { flipY: value }) }])
    },
    /** 方向键微调：未锁定的选中组件整体平移，整体不越出画布。返回是否有组件可动 */
    nudgeSelection(dx: number, dy: number): boolean {
      if (!this.draft) return false
      const items = this.arrangeItems().filter(i => !i.locked)
      const u = unionRect(items.map(visualRect))
      if (!u) return false
      const c = this.draft.canvas
      const ddx = Math.max(-u.x, Math.min(dx, c.width - u.x - u.w))
      const ddy = Math.max(-u.y, Math.min(dy, c.height - u.y - u.h))
      this.applyPatches(items.map(i => ({ id: i.id, x: i.x + ddx, y: i.y + ddy, w: i.w, h: i.h })))
      return true
    },
    /** 属性面板（多选）：把未锁定的选中组件整体缩放 / 平移到 bounds */
    resizeSelectionTo(bounds: WidgetRect) {
      const items = this.arrangeItems().filter(i => !i.locked)
      const from = unionRect(items.map(visualRect))
      if (!from) return
      this.applyPatches(scaleItems(items, from, bounds))
    },
    /**
     * 整体设定内部变量列表（变量管理弹窗「确定」时调用，一步可撤销）：增 / 删 / 改名都在这里落到草稿上。
     * 被删掉的变量：绑着它的组件解除绑定；key 不会被复用（variableSeq 只增不减），残留的引用只是不再显示。
     */
    setVariables(list: LocalVarDef[], seq?: number) {
      if (!this.draft) return
      const next = sanitizeVariables(list) || []
      const keep = new Set(next.map(v => v.key))
      const removed = new Set((this.draft.variables || []).filter(v => !keep.has(v.key)).map(v => v.key))
      this.draft.variables = next
      this.draft.variableSeq = nextVarSeq(next, Math.max(Number(this.draft.variableSeq) || 0, Number(seq) || 0))
      if (removed.size) unbindVariables(this.draft.widgets, removed)
      this.dirty = true
    },
    clearWidgets() {
      if (!this.draft) return
      this.draft.widgets = []
      this.selectedIds = []
      this.dirty = true
    },
    /** 画布级全局脚本（启动 / 循环 / 结束 / 循环间隔）：存在布局里，随保存 / 导出 / 撤销 */
    setScripts(patch: Partial<ScadaScripts>) {
      if (!this.draft) return
      this.draft.scripts = { ...(this.draft.scripts || {}), ...patch }
      this.dirty = true
    },
    setCanvas(patch: Partial<CanvasConfig>) {
      if (!this.draft) return
      Object.assign(this.draft.canvas, patch)
      // 画布变小后把越界的组件收回来
      this.draft.widgets.forEach(w => {
        const r = clampLayoutRect(w, w.rotate, this.draft!.canvas, minOf(w.type))
        w.x = r.x
        w.y = r.y
        w.w = r.w
        w.h = r.h
      })
      this.dirty = true
    }
  }
})

// 本地数据源（内部变量）读「当前生效的变量定义」：编辑中是草稿里的，否则是已保存布局里的。没有激活的 pinia 时抛错 → 数据源退回默认的 16 个
setLocalVarResolver(() => useScadaStore().variables)
