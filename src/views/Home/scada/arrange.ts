/**
 * 排列工具（纯函数，便于单测）：对齐 / 画布居中 / 分布 / 等宽高 / 旋转 / 翻转 / 八点缩放选区 / 图层顺序。
 *
 * 输入输出都是普通对象：store 负责取数据、把结果（Patch）落到草稿上并夹紧到画布内；这里不碰 store、不碰 DOM。
 * 位置计算一律基于「视觉外框」（geometry.ts 的 visualRect，旋转 90° / 270° 后宽高互换）——画面上看到什么就对齐什么，
 * 算完再换算回旋转前的 x / y / w / h 写进 Patch。
 *
 * 「参考对象」：对齐、等宽高以它为准，它本身不动。规则：多选时最先选中的那个（store.selectedIds[0]）。
 */
import { isQuarterTurn, layoutFromVisual, normRotate, snap, unionRect, visualRect } from './geometry'
import type { WidgetRect } from './types'

export interface ArrangeItem extends WidgetRect {
  id: string
  rotate?: number
  flipX?: boolean
  flipY?: boolean
  locked?: boolean
  /** 组件定义里的最小尺寸（未旋转口径） */
  min: { w: number; h: number }
}

/** 一次改动：x / y / w / h 是旋转前的外框；rotate / flipX / flipY 只在会变化时带上 */
export interface Patch extends WidgetRect {
  id: string
  rotate?: number
  flipX?: boolean
  flipY?: boolean
}

export type AlignKind = 'left' | 'right' | 'top' | 'bottom' | 'centerX' | 'centerY' | 'center'
export type DistributeMode = 'gap' | 'center'
export type SizeMode = 'w' | 'h' | 'both'
export type CanvasCenterKind = 'x' | 'y' | 'both'

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(v, hi))

/** 视觉外框 → 补丁（换算回旋转前的外框；旋转角度不变） */
const patchOf = (it: ArrangeItem, v: WidgetRect): Patch => ({ id: it.id, ...layoutFromVisual(v, it.rotate) })

/** 组件的最小视觉尺寸：旋转 90° / 270° 时最小宽高互换 */
export const visualMin = (it: { rotate?: number; min: { w: number; h: number } }) => (isQuarterTurn(it.rotate) ? { w: it.min.h, h: it.min.w } : { w: it.min.w, h: it.min.h })

// ---------------------------------------------------------------- 对齐 / 居中 / 分布 / 等宽高

/** 与参考对象对齐：左 / 右 / 上 / 下边缘，垂直中心轴（centerX：中心 x 相同）、水平中心轴（centerY：中心 y 相同）、中心点（两者）。参考对象与锁定的组件不动 */
export const alignItems = (items: ArrangeItem[], refId: string, kind: AlignKind): Patch[] => {
  const ref = items.find(i => i.id === refId)
  if (!ref) return []
  const R = visualRect(ref)
  const out: Patch[] = []
  items.forEach(it => {
    if (it.id === refId || it.locked) return
    const V = visualRect(it)
    let x = V.x
    let y = V.y
    if (kind === 'left') x = R.x
    else if (kind === 'right') x = R.x + R.w - V.w
    else if (kind === 'centerX' || kind === 'center') x = R.x + (R.w - V.w) / 2
    if (kind === 'top') y = R.y
    else if (kind === 'bottom') y = R.y + R.h - V.h
    else if (kind === 'centerY' || kind === 'center') y = R.y + (R.h - V.h) / 2
    out.push(patchOf(it, { x: Math.round(x), y: Math.round(y), w: V.w, h: V.h }))
  })
  return out
}

/**
 * 相对整个画面居中：每个对象各自把几何中心移到画面的中线 / 中心点上。
 *  - x：中心落在画面水平方向的中线（x = 宽 / 2）上，纵向位置不变；y：中心落在垂直方向的中线（y = 高 / 2）上，横向位置不变；both：画面中心点。
 */
export const centerInCanvas = (items: ArrangeItem[], canvas: { width: number; height: number }, kind: CanvasCenterKind): Patch[] => {
  const out: Patch[] = []
  items.forEach(it => {
    if (it.locked) return
    const V = visualRect(it)
    const x = kind === 'y' ? V.x : Math.round((canvas.width - V.w) / 2)
    const y = kind === 'x' ? V.y : Math.round((canvas.height - V.h) / 2)
    out.push(patchOf(it, { x, y, w: V.w, h: V.h }))
  })
  return out
}

/**
 * 分布（至少 3 个）：最靠两端的两个不动，中间的重新摆放。
 *  - gap：相邻对象之间的空隙相等；center：相邻对象的中心距相等。h = 水平方向，v = 垂直方向。锁定的不动
 */
export const distributeItems = (items: ArrangeItem[], axis: 'h' | 'v', mode: DistributeMode): Patch[] => {
  if (items.length < 3) return []
  const horizontal = axis === 'h'
  const rows = items.map(it => ({ it, v: visualRect(it) }))
  const pos = (r: { v: WidgetRect }) => (horizontal ? r.v.x : r.v.y)
  const size = (r: { v: WidgetRect }) => (horizontal ? r.v.w : r.v.h)
  rows.sort((a, b) => (mode === 'center' ? pos(a) + size(a) / 2 - (pos(b) + size(b) / 2) : pos(a) - pos(b)))
  const first = rows[0]
  const last = rows[rows.length - 1]
  const n = rows.length
  const out: Patch[] = []
  const place = (r: (typeof rows)[number], p: number) => {
    if (r.it.locked) return
    out.push(patchOf(r.it, horizontal ? { ...r.v, x: Math.round(p) } : { ...r.v, y: Math.round(p) }))
  }
  if (mode === 'gap') {
    const span = pos(last) + size(last) - pos(first)
    const total = rows.reduce((sum, r) => sum + size(r), 0)
    const gap = (span - total) / (n - 1)
    let cursor = pos(first) + size(first) + gap
    for (let k = 1; k < n - 1; k++) {
      place(rows[k], cursor)
      cursor += size(rows[k]) + gap
    }
  } else {
    const c0 = pos(first) + size(first) / 2
    const c1 = pos(last) + size(last) / 2
    for (let k = 1; k < n - 1; k++) place(rows[k], c0 + ((c1 - c0) * k) / (n - 1) - size(rows[k]) / 2)
  }
  return out
}

/** 等宽 / 等高 / 等宽高：把其它对象的视觉宽 / 高改成参考对象的（左上角不动）。参考对象与锁定的不动 */
export const sizeItems = (items: ArrangeItem[], refId: string, mode: SizeMode): Patch[] => {
  const ref = items.find(i => i.id === refId)
  if (!ref) return []
  const R = visualRect(ref)
  const out: Patch[] = []
  items.forEach(it => {
    if (it.id === refId || it.locked) return
    const V = visualRect(it)
    out.push(patchOf(it, { x: V.x, y: V.y, w: mode === 'h' ? V.w : R.w, h: mode === 'w' ? V.h : R.h }))
  })
  return out
}

// ---------------------------------------------------------------- 旋转 / 翻转

/** 可动（未锁定）组件的视觉外框中心，旋转 / 翻转以它为轴 */
const pivotOf = (items: ArrangeItem[]) => {
  const u = unionRect(items.map(visualRect))
  return u ? { cx: u.x + u.w / 2, cy: u.y + u.h / 2 } : null
}

/**
 * 整体旋转 90°（dir = 1 顺时针 / -1 逆时针）：每个组件的 rotate ± 90，各组件的中心绕选区中心转 90°
 * （单个组件 = 绕自己的中心转；多选 = 像 PPT 那样整体转）。锁定的不动
 */
export const rotateItems = (items: ArrangeItem[], dir: 1 | -1): Patch[] => {
  const movable = items.filter(i => !i.locked)
  const pv = pivotOf(movable)
  if (!pv) return []
  return movable.map(it => {
    const dx = it.x + it.w / 2 - pv.cx
    const dy = it.y + it.h / 2 - pv.cy
    // 屏幕坐标（y 向下）里顺时针 90°：(dx, dy) → (-dy, dx)；逆时针：(dx, dy) → (dy, -dx)
    const ncx = pv.cx + (dir === 1 ? -dy : dy)
    const ncy = pv.cy + (dir === 1 ? dx : -dx)
    return { id: it.id, x: Math.round(ncx - it.w / 2), y: Math.round(ncy - it.h / 2), w: it.w, h: it.h, rotate: normRotate(normRotate(it.rotate) + 90 * dir) }
  })
}

/**
 * 整体翻转：x = 左右翻转（镜像轴是选区中心的竖线），y = 上下翻转。组件中心按镜像移动，flipX / flipY 取反。
 * 画面上的镜像作用在「旋转之后」，而 CSS 是先翻转再旋转，所以 rotate 要取负（M·R(r) = R(-r)·M），这样旋转过的组件翻转后外观才对
 */
export const flipItems = (items: ArrangeItem[], axis: 'x' | 'y'): Patch[] => {
  const movable = items.filter(i => !i.locked)
  const pv = pivotOf(movable)
  if (!pv) return []
  return movable.map(it => {
    const cx = it.x + it.w / 2
    const cy = it.y + it.h / 2
    const ncx = axis === 'x' ? 2 * pv.cx - cx : cx
    const ncy = axis === 'y' ? 2 * pv.cy - cy : cy
    const p: Patch = { id: it.id, x: Math.round(ncx - it.w / 2), y: Math.round(ncy - it.h / 2), w: it.w, h: it.h, rotate: normRotate(-normRotate(it.rotate)) }
    if (axis === 'x') p.flipX = !it.flipX
    else p.flipY = !it.flipY
    return p
  })
}

/**
 * 旋转 / 翻转之后选区可能伸出画布：整体平移回来（保持彼此相对位置）；选区比画布还大的方向不动，交给 store 逐个夹紧。
 * rotates：各组件当前的旋转角度（补丁里没带 rotate 时用它）
 */
export const fitPatchesInside = (patches: Patch[], items: ArrangeItem[], canvas: { width: number; height: number }): Patch[] => {
  const rotOf = new Map(items.map(i => [i.id, i.rotate] as const))
  const u = unionRect(patches.map(p => visualRect({ x: p.x, y: p.y, w: p.w, h: p.h, rotate: p.rotate !== undefined ? p.rotate : rotOf.get(p.id) })))
  if (!u) return patches
  let dx = 0
  let dy = 0
  if (u.w <= canvas.width) dx = u.x < 0 ? -u.x : u.x + u.w > canvas.width ? canvas.width - (u.x + u.w) : 0
  if (u.h <= canvas.height) dy = u.y < 0 ? -u.y : u.y + u.h > canvas.height ? canvas.height - (u.y + u.h) : 0
  if (!dx && !dy) return patches
  return patches.map(p => ({ ...p, x: p.x + dx, y: p.y + dy }))
}

// ---------------------------------------------------------------- 八点缩放（选区外接框）

/** 缩放手柄：四角 + 四边中点；字母是被拖动的边（n 上 / s 下 / w 左 / e 右） */
export const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const
export type Handle = (typeof HANDLES)[number]

export const HANDLE_CURSORS: Record<Handle, string> = {
  nw: 'nwse-resize',
  se: 'nwse-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
  n: 'ns-resize',
  s: 'ns-resize',
  e: 'ew-resize',
  w: 'ew-resize'
}

/** 手柄在外接框上的位置（0 ~ 1 的比例） */
export const HANDLE_POS: Record<Handle, { fx: number; fy: number }> = {
  nw: { fx: 0, fy: 0 },
  n: { fx: 0.5, fy: 0 },
  ne: { fx: 1, fy: 0 },
  e: { fx: 1, fy: 0.5 },
  se: { fx: 1, fy: 1 },
  s: { fx: 0.5, fy: 1 },
  sw: { fx: 0, fy: 1 },
  w: { fx: 0, fy: 0.5 }
}

export interface ResizeOptions {
  /** 吸附步长（<= 1 = 只取整） */
  grid: number
  canvas: { width: number; height: number }
  /** 外接框允许的最小宽 / 高（多选时由各组件的最小尺寸折算） */
  minW: number
  minH: number
  /** 拖角点时等比缩放（按住 Shift） */
  keepAspect?: boolean
}

/**
 * 拖动某个手柄 (dx, dy)（画布逻辑像素）后外接框的新位置 / 尺寸：只有被拖的边移动，对边不动；
 * 被拖的边吸附到网格，不能越出画布，也不能小于最小尺寸。keepAspect 仅对四角有效：按较大的缩放比例等比缩放，以对角为锚点
 */
export const resizeBounds = (b: WidgetRect, handle: Handle, dx: number, dy: number, o: ResizeOptions): WidgetRect => {
  let left = b.x
  let right = b.x + b.w
  let top = b.y
  let bottom = b.y + b.h
  const hasW = handle.includes('w')
  const hasE = handle.includes('e')
  const hasN = handle.includes('n')
  const hasS = handle.includes('s')
  if (hasW) left = clamp(snap(left + dx, o.grid), 0, right - o.minW)
  if (hasE) right = clamp(snap(right + dx, o.grid), left + o.minW, o.canvas.width)
  if (hasN) top = clamp(snap(top + dy, o.grid), 0, bottom - o.minH)
  if (hasS) bottom = clamp(snap(bottom + dy, o.grid), top + o.minH, o.canvas.height)
  if (o.keepAspect && (hasW || hasE) && (hasN || hasS) && b.w > 0 && b.h > 0) {
    const minS = Math.max(o.minW / b.w, o.minH / b.h)
    const maxW = hasE ? o.canvas.width - left : right
    const maxH = hasS ? o.canvas.height - top : bottom
    const maxS = Math.min(maxW / b.w, maxH / b.h)
    const s = clamp(Math.max((right - left) / b.w, (bottom - top) / b.h), minS, Math.max(minS, maxS))
    const nw = Math.max(Math.ceil(o.minW - 1e-9), Math.round(b.w * s))
    const nh = Math.max(Math.ceil(o.minH - 1e-9), Math.round(b.h * s))
    if (hasW) left = right - nw
    else right = left + nw
    if (hasN) top = bottom - nh
    else bottom = top + nh
  }
  return { x: left, y: top, w: right - left, h: bottom - top }
}

/** 选区外接框允许的最小宽 / 高：每个组件缩放后都不能小于自己的最小视觉尺寸 */
export const boundsMin = (items: ArrangeItem[], bounds: WidgetRect) => {
  let sx = 0
  let sy = 0
  items.forEach(it => {
    const v = visualRect(it)
    const m = visualMin(it)
    if (v.w > 0) sx = Math.max(sx, m.w / v.w)
    if (v.h > 0) sy = Math.max(sy, m.h / v.h)
  })
  return { minW: Math.max(1, Math.ceil(bounds.w * sx - 1e-9)), minH: Math.max(1, Math.ceil(bounds.h * sy - 1e-9)) }
}

/** 把选区外接框 from 变成 to：每个组件的视觉外框按同样的比例缩放 / 平移（边对边取整，相邻组件不会出缝） */
export const scaleItems = (items: ArrangeItem[], from: WidgetRect, to: WidgetRect): Patch[] => {
  const sx = from.w ? to.w / from.w : 1
  const sy = from.h ? to.h / from.h : 1
  return items.map(it => {
    const v = visualRect(it)
    const x0 = Math.round(to.x + (v.x - from.x) * sx)
    const x1 = Math.round(to.x + (v.x + v.w - from.x) * sx)
    const y0 = Math.round(to.y + (v.y - from.y) * sy)
    const y1 = Math.round(to.y + (v.y + v.h - from.y) * sy)
    return patchOf(it, { x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) })
  })
}

// ---------------------------------------------------------------- 图层顺序（数组顺序即层级：越靠后越在上面）

type Ided = { id: string }

/** 置于顶层：选中的移到最后（彼此顺序不变） */
export const orderToFront = <T extends Ided>(list: readonly T[], ids: ReadonlySet<string>): T[] => [...list.filter(w => !ids.has(w.id)), ...list.filter(w => ids.has(w.id))]

/** 置于底层 */
export const orderToBack = <T extends Ided>(list: readonly T[], ids: ReadonlySet<string>): T[] => [...list.filter(w => ids.has(w.id)), ...list.filter(w => !ids.has(w.id))]

/** 上移一层：每个选中的组件越过它上面紧邻的一个未选中组件 */
export const orderForward = <T extends Ided>(list: readonly T[], ids: ReadonlySet<string>): T[] => {
  const a = list.slice()
  for (let i = a.length - 2; i >= 0; i--) {
    if (ids.has(a[i].id) && !ids.has(a[i + 1].id)) [a[i], a[i + 1]] = [a[i + 1], a[i]]
  }
  return a
}

/** 下移一层 */
export const orderBackward = <T extends Ided>(list: readonly T[], ids: ReadonlySet<string>): T[] => {
  const a = list.slice()
  for (let i = 1; i < a.length; i++) {
    if (ids.has(a[i].id) && !ids.has(a[i - 1].id)) [a[i], a[i - 1]] = [a[i - 1], a[i]]
  }
  return a
}

/** 把选中的一批（保持彼此顺序）放到目标组件的上面（above）或下面（below）；目标本身在选中里则不动 */
export const orderRelative = <T extends Ided>(list: readonly T[], ids: ReadonlySet<string>, targetId: string, placement: 'above' | 'below'): T[] => {
  if (ids.has(targetId) || !list.some(w => w.id === targetId)) return list.slice()
  const moving = list.filter(w => ids.has(w.id))
  const rest = list.filter(w => !ids.has(w.id))
  const at = rest.findIndex(w => w.id === targetId)
  rest.splice(placement === 'above' ? at + 1 : at, 0, ...moving)
  return rest
}
