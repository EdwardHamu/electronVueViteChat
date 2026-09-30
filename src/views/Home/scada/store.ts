/**
 * 组态页状态：已保存布局 layout、编辑中的草稿 draft、选中项、面板开关。
 * 编辑模式下所有改动都落在 draft 上，保存时整体写回 layout 并持久化；取消则丢弃草稿。
 *
 * 选中项是一个有序的 id 列表 selectedIds（Ctrl / Shift 点击多选）：
 *  - 第一个是「参考对象」（对齐 / 等宽高以它为准，它本身不动）；
 *  - selectedId / selected 只在「恰好选中一个」时有值（属性面板 / 组件库高亮按单选处理），多选走 selectedWidgets。
 * 数组顺序即层级：widgets 越靠后越在上面（图层栏、置顶 / 置底都基于它）。
 * 对齐 / 分布 / 旋转等排列运算是 arrange.ts 里的纯函数，这里只负责取数据、把结果（Patch）落到草稿上并夹紧到画布内。
 */
import { defineStore } from 'pinia'
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
import { clampLayoutRect, cloneDeep, findFreeSpot, normRotate, snap, unionRect, visualRect } from './geometry'
import { createEmptyLayout, LAYOUT_VERSION } from './layout'
import { getWidgetDefinition } from './registry'
import { cleanupUnusedResources } from './resource'
import { getLayoutStorage } from './storage'
import type { CanvasConfig, DataBinding, ScadaLayout, WidgetInstance, WidgetRect } from './types'

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
    saving: false
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
    },
    cancelEdit() {
      this.draft = null
      this.editing = false
      this.selectedIds = []
      this.fullscreen = false
      this.dirty = false
    },
    async save() {
      if (!this.draft) return
      this.saving = true
      try {
        const layout = cloneDeep(this.draft)
        layout.version = LAYOUT_VERSION
        layout.updatedAt = Date.now()
        await getLayoutStorage().save(layout)
        this.layout = layout
        this.draft = null
        this.editing = false
        this.selectedIds = []
        this.fullscreen = false
        this.dirty = false
        // 保存后的布局就是唯一生效的布局：顺手把宿主 Resources/pic 里不再引用的图片删掉（异步、失败不影响保存）
        cleanupUnusedResources(layout)
      } finally {
        this.saving = false
      }
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
    /** 删除 / 替换布局后清掉已经不存在的选中 id */
    pruneSelection() {
      const have = new Set(this.current.widgets.map(w => w.id))
      if (this.selectedIds.some(id => !have.has(id))) this.selectedIds = this.selectedIds.filter(id => have.has(id))
    },

    // ---------------------------------------------------------------- 增删改
    /** 添加组件；pos 为画布逻辑坐标（组件中心），不传则自动找空位 */
    addWidget(type: string, pos?: { x: number; y: number }): WidgetInstance | undefined {
      const def = getWidgetDefinition(type)
      if (!def || !this.draft) return
      const canvas = this.draft.canvas
      const size = { ...def.defaultSize }
      const grid = this.gridOn ? canvas.grid : 1
      const at = pos ? { x: snap(pos.x - size.w / 2, grid), y: snap(pos.y - size.h / 2, grid) } : findFreeSpot(this.draft.widgets, size, canvas)
      const rect = clampLayoutRect({ ...at, ...size }, 0, canvas, def.minSize || DEFAULT_MIN)
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
      // 只复制了组合里的一部分时，落单的副本不算组合
      const size = new Map<string, number>()
      copies.forEach(c => c.groupId && size.set(c.groupId, (size.get(c.groupId) || 0) + 1))
      copies.forEach(c => {
        if (c.groupId && (size.get(c.groupId) || 0) < 2) delete c.groupId
      })
      const u = unionRect(copies.map(visualRect))!
      const dx = Math.max(-u.x, Math.min(step, canvas.width - u.x - u.w))
      const dy = Math.max(-u.y, Math.min(step, canvas.height - u.y - u.h))
      copies.forEach(c => {
        c.x += dx
        c.y += dy
      })
      this.draft.widgets.push(...copies)
      // 选中顺序沿用原来的（参考对象的副本仍排第一）
      this.selectedIds = ids.map(id => idMap.get(id)).filter((id): id is string => !!id)
      this.dirty = true
      return this.selectedIds.slice()
    },
    updateWidget(id: string, patch: Partial<Omit<WidgetInstance, 'id' | 'props'>>) {
      const w = this.draft?.widgets.find(e => e.id === id)
      if (!w) return
      Object.assign(w, patch)
      this.dirty = true
    },
    /** 落实一批位置 / 尺寸 / 旋转 / 翻转改动：按视觉外框夹紧到画布内、不小于最小尺寸 */
    applyPatches(patches: Patch[]) {
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
    clearWidgets() {
      if (!this.draft) return
      this.draft.widgets = []
      this.selectedIds = []
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
