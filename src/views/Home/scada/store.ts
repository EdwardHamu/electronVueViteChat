/**
 * 组态页状态：已保存布局 layout、编辑中的草稿 draft、选中项、面板开关。
 * 编辑模式下所有改动都落在 draft 上，保存时整体写回 layout 并持久化；取消则丢弃 draft。
 */
import { defineStore } from 'pinia'
import { v4 as uuidv4 } from 'uuid'
import { clampRect, cloneDeep, findFreeSpot, snap } from './geometry'
import { createEmptyLayout, LAYOUT_VERSION } from './layout'
import { getWidgetDefinition } from './registry'
import { cleanupUnusedResources } from './resource'
import { getLayoutStorage } from './storage'
import type { CanvasConfig, DataBinding, ScadaLayout, WidgetInstance, WidgetRect } from './types'

const DEFAULT_MIN = { w: 20, h: 20 }

export const useScadaStore = defineStore('scada', {
  state: () => ({
    layout: createEmptyLayout() as ScadaLayout,
    draft: null as ScadaLayout | null,
    loaded: false,
    editing: false,
    selectedId: null as string | null,
    paletteShow: true,
    propsShow: true,
    dirty: false,
    saving: false
  }),
  getters: {
    /** 当前应当渲染的布局：编辑中为草稿，否则为已保存布局 */
    current(state): ScadaLayout {
      return state.editing && state.draft ? state.draft : state.layout
    },
    selected(state): WidgetInstance | undefined {
      const l = state.editing && state.draft ? state.draft : state.layout
      return state.selectedId ? l.widgets.find(w => w.id === state.selectedId) : undefined
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
      this.selectedId = null
      this.dirty = false
    },
    cancelEdit() {
      this.draft = null
      this.editing = false
      this.selectedId = null
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
        this.selectedId = null
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
      this.selectedId = null
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
      this.selectedId = null
      cleanupUnusedResources(next)
    },
    select(id: string | null) {
      this.selectedId = id
    },
    /** 添加组件；pos 为画布逻辑坐标（组件中心），不传则自动找空位 */
    addWidget(type: string, pos?: { x: number; y: number }): WidgetInstance | undefined {
      const def = getWidgetDefinition(type)
      if (!def || !this.draft) return
      const canvas = this.draft.canvas
      const size = { ...def.defaultSize }
      const at = pos
        ? { x: snap(pos.x - size.w / 2, canvas.grid), y: snap(pos.y - size.h / 2, canvas.grid) }
        : findFreeSpot(this.draft.widgets, size, canvas)
      const rect = clampRect({ ...at, ...size }, canvas, def.minSize || DEFAULT_MIN)
      const widget: WidgetInstance = {
        id: uuidv4(),
        type,
        title: '',
        binding: null,
        ...rect,
        props: def.defaultProps()
      }
      this.draft.widgets.push(widget)
      this.selectedId = widget.id
      this.dirty = true
      return widget
    },
    duplicateWidget(id: string) {
      if (!this.draft) return
      const src = this.draft.widgets.find(w => w.id === id)
      if (!src) return
      const def = getWidgetDefinition(src.type)
      const canvas = this.draft.canvas
      const step = canvas.grid * 2
      const rect = clampRect({ x: src.x + step, y: src.y + step, w: src.w, h: src.h }, canvas, def?.minSize || DEFAULT_MIN)
      const copy: WidgetInstance = { ...cloneDeep(src), ...rect, id: uuidv4() }
      this.draft.widgets.push(copy)
      this.selectedId = copy.id
      this.dirty = true
    },
    updateWidget(id: string, patch: Partial<Omit<WidgetInstance, 'id' | 'props'>>) {
      const w = this.draft?.widgets.find(e => e.id === id)
      if (!w) return
      Object.assign(w, patch)
      this.dirty = true
    },
    updateWidgetRect(id: string, rect: WidgetRect) {
      if (!this.draft) return
      const w = this.draft.widgets.find(e => e.id === id)
      if (!w) return
      const def = getWidgetDefinition(w.type)
      const r = clampRect(rect, this.draft.canvas, def?.minSize || DEFAULT_MIN)
      w.x = r.x
      w.y = r.y
      w.w = r.w
      w.h = r.h
      this.dirty = true
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
      if (!this.draft) return
      const idx = this.draft.widgets.findIndex(e => e.id === id)
      if (idx > -1) this.draft.widgets.splice(idx, 1)
      if (this.selectedId === id) this.selectedId = null
      this.dirty = true
    },
    /** 数组顺序即层级：越靠后越在上面 */
    bringToFront(id: string) {
      if (!this.draft) return
      const idx = this.draft.widgets.findIndex(e => e.id === id)
      if (idx < 0 || idx === this.draft.widgets.length - 1) return
      const [w] = this.draft.widgets.splice(idx, 1)
      this.draft.widgets.push(w)
      this.dirty = true
    },
    sendToBack(id: string) {
      if (!this.draft) return
      const idx = this.draft.widgets.findIndex(e => e.id === id)
      if (idx <= 0) return
      const [w] = this.draft.widgets.splice(idx, 1)
      this.draft.widgets.unshift(w)
      this.dirty = true
    },
    clearWidgets() {
      if (!this.draft) return
      this.draft.widgets = []
      this.selectedId = null
      this.dirty = true
    },
    setCanvas(patch: Partial<CanvasConfig>) {
      if (!this.draft) return
      Object.assign(this.draft.canvas, patch)
      // 画布变小后把越界的组件收回来
      this.draft.widgets.forEach(w => {
        const def = getWidgetDefinition(w.type)
        const r = clampRect(w, this.draft!.canvas, def?.minSize || DEFAULT_MIN)
        w.x = r.x
        w.y = r.y
        w.w = r.w
        w.h = r.h
      })
      this.dirty = true
    }
  }
})
