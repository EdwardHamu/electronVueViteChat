/**
 * 排列工具栏 / 图层栏的小图标：24×24 viewBox 的线条 SVG，颜色跟随 currentColor（可用时深灰蓝，不可用时由按钮整体变淡）。
 * 画法参考 HMI 组态软件的对齐工具栏：带轴线的对齐、两端 + 双向箭头的分布、带 90 的旋转箭头、镜像三角、虚线框的组合、挂锁、叠放的方块 / 图层。
 */
import type { VNodeChild } from 'vue'

const S = { fill: 'none', stroke: 'currentColor', 'stroke-width': 1.6, 'stroke-linecap': 'round' as const, 'stroke-linejoin': 'round' as const }
/** 对象：淡淡的填充 + 描边 */
const F = { ...S, fill: 'currentColor', 'fill-opacity': 0.16 }
/** 实心强调的对象 */
const G = { ...S, fill: 'currentColor', 'fill-opacity': 0.55 }
/** 虚线描边（组合框、镜像轴） */
const D = { ...S, 'stroke-dasharray': '2.4 2' }

const svg = (children: VNodeChild) => (
  <svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden="true">
    {children}
  </svg>
)

export const toolIcons: Record<string, () => VNodeChild> = {
  // ---------------------------------------------------------------- 与参考对象对齐
  alignLeft: () => svg(<><path d="M4 3.5v17" {...S} /><rect x="7" y="6" width="13" height="4.2" rx="1" {...F} /><rect x="7" y="13.8" width="7.5" height="4.2" rx="1" {...F} /></>),
  alignRight: () => svg(<><path d="M20 3.5v17" {...S} /><rect x="4" y="6" width="13" height="4.2" rx="1" {...F} /><rect x="9.5" y="13.8" width="7.5" height="4.2" rx="1" {...F} /></>),
  alignTop: () => svg(<><path d="M3.5 4h17" {...S} /><rect x="6" y="7" width="4.2" height="13" rx="1" {...F} /><rect x="13.8" y="7" width="4.2" height="7.5" rx="1" {...F} /></>),
  alignBottom: () => svg(<><path d="M3.5 20h17" {...S} /><rect x="6" y="4" width="4.2" height="13" rx="1" {...F} /><rect x="13.8" y="9.5" width="4.2" height="7.5" rx="1" {...F} /></>),
  /** 垂直中心轴：竖线穿过各对象中心 */
  alignCenterX: () => svg(<><path d="M12 3v18" {...S} /><rect x="4.5" y="5.5" width="15" height="4.2" rx="1" {...F} /><rect x="8" y="14.3" width="8" height="4.2" rx="1" {...F} /></>),
  /** 水平中心轴：横线穿过各对象中心 */
  alignCenterY: () => svg(<><path d="M3 12h18" {...S} /><rect x="5.5" y="4.5" width="4.2" height="15" rx="1" {...F} /><rect x="14.3" y="8" width="4.2" height="8" rx="1" {...F} /></>),
  alignCenter: () => svg(<><rect x="3.5" y="3.5" width="17" height="17" rx="2" {...S} /><rect x="9" y="9" width="6" height="6" {...F} /><path d="M12 3.5V9M12 15v5.5M3.5 12H9M15 12h5.5" {...S} /></>),
  /** 相对整个画面：竖条居中（水平方向居中，纵向位置不变） */
  pageCenterX: () => svg(<><rect x="3.5" y="3.5" width="17" height="17" rx="2" {...S} /><rect x="9.5" y="7" width="5" height="10" rx="1" {...F} /><path d="M12 3.5v3M12 17.5v3" {...D} /></>),
  /** 相对整个画面：横条居中（垂直方向居中，横向位置不变） */
  pageCenterY: () => svg(<><rect x="3.5" y="3.5" width="17" height="17" rx="2" {...S} /><rect x="7" y="9.5" width="10" height="5" rx="1" {...F} /><path d="M3.5 12h3M17.5 12h3" {...D} /></>),
  pageCenter: () => svg(<><rect x="3.5" y="3.5" width="17" height="17" rx="2" {...S} /><rect x="8.5" y="8.5" width="7" height="7" rx="1" {...F} /><path d="M12 3.5v2.5M12 18v2.5M3.5 12H6M18 12h2.5" {...D} /></>),

  // ---------------------------------------------------------------- 分布 / 等宽高
  distributeH: () => svg(<><rect x="3" y="5" width="3.6" height="14" rx="1" {...F} /><rect x="17.4" y="5" width="3.6" height="14" rx="1" {...F} /><path d="M8.6 12h6.8M8.6 12l1.9-1.9M8.6 12l1.9 1.9M15.4 12l-1.9-1.9M15.4 12l-1.9 1.9" {...S} /></>),
  distributeV: () => svg(<><rect x="5" y="3" width="14" height="3.6" rx="1" {...F} /><rect x="5" y="17.4" width="14" height="3.6" rx="1" {...F} /><path d="M12 8.6v6.8M12 8.6l-1.9 1.9M12 8.6l1.9 1.9M12 15.4l-1.9-1.9M12 15.4l1.9-1.9" {...S} /></>),
  sameWidth: () => svg(<><rect x="3.5" y="4" width="17" height="8" rx="1" {...F} /><path d="M3.5 17.5h17M3.5 17.5l2.4-2M3.5 17.5l2.4 2M20.5 17.5l-2.4-2M20.5 17.5l-2.4 2" {...S} /></>),
  sameHeight: () => svg(<><rect x="12.5" y="3.5" width="8" height="17" rx="1" {...F} /><path d="M6 3.5v17M6 3.5l-2 2.4M6 3.5l2 2.4M6 20.5l-2-2.4M6 20.5l2-2.4" {...S} /></>),
  sameSize: () => svg(<><rect x="3.5" y="3.5" width="11" height="11" rx="1" {...F} /><path d="M13 13l7.5 7.5M20.5 14.5v6h-6" {...S} /></>),

  // ---------------------------------------------------------------- 旋转 / 翻转
  rotateCw: () => svg(<><path d="M19.5 12.5a7.5 7.5 0 1 1-2.7-5.8" {...S} /><path d="M19.8 3.2v4.4h-4.4" {...S} /><text x="12" y="15" font-size="7.5" font-weight="700" font-family="Arial, sans-serif" text-anchor="middle" fill="currentColor" stroke="none">90</text></>),
  rotateCcw: () => svg(<><path d="M4.5 12.5a7.5 7.5 0 1 0 2.7-5.8" {...S} /><path d="M4.2 3.2v4.4h4.4" {...S} /><text x="12" y="15" font-size="7.5" font-weight="700" font-family="Arial, sans-serif" text-anchor="middle" fill="currentColor" stroke="none">90</text></>),
  flipH: () => svg(<><path d="M12 2.5v19" {...D} /><path d="M9.5 7L3.5 12l6 5z" {...G} /><path d="M14.5 7l6 5-6 5z" {...S} /></>),
  flipV: () => svg(<><path d="M2.5 12h19" {...D} /><path d="M7 9.5l5-6 5 6z" {...G} /><path d="M7 14.5l5 6 5-6z" {...S} /></>),

  // ---------------------------------------------------------------- 组合 / 锁定
  group: () => svg(<><rect x="3" y="3" width="18" height="18" rx="2" {...D} /><rect x="6.5" y="6.5" width="7" height="7" rx="1" {...S} /><rect x="10.5" y="10.5" width="7" height="7" rx="1" {...F} /></>),
  ungroup: () => svg(<><rect x="3.5" y="3.5" width="8" height="8" rx="1" {...D} /><rect x="12.5" y="12.5" width="8" height="8" rx="1" {...F} /><path d="M14.5 7.5h3.5v3.5M9.5 16.5H6V13" {...S} /></>),
  lock: () => svg(<><rect x="5.5" y="11" width="13" height="9.5" rx="2" {...F} /><path d="M8.5 11V8a3.5 3.5 0 0 1 7 0v3" {...S} /><circle cx="12" cy="15.7" r="1.3" fill="currentColor" stroke="none" /></>),
  unlock: () => svg(<><rect x="5.5" y="11" width="13" height="9.5" rx="2" {...F} /><path d="M8.5 11V8a3.5 3.5 0 0 1 6.7-1.5" {...S} /><circle cx="12" cy="15.7" r="1.3" fill="currentColor" stroke="none" /></>),

  // ---------------------------------------------------------------- 层次
  /** 置于顶层：实心方块压在另一个上面 */
  toFront: () => svg(<><rect x="3.5" y="9.5" width="11" height="11" rx="1" {...S} /><rect x="9.5" y="3.5" width="11" height="11" rx="1" fill="currentColor" fill-opacity="0.6" stroke="currentColor" stroke-width="1.6" /></>),
  /** 置于底层：实心方块被另一个盖住 */
  toBack: () => svg(<><rect x="3.5" y="9.5" width="11" height="11" rx="1" fill="currentColor" fill-opacity="0.6" stroke="currentColor" stroke-width="1.6" /><rect x="9.5" y="3.5" width="11" height="11" rx="1" fill="#fff" stroke="currentColor" stroke-width="1.6" /></>),
  /** 上移一层：三层叠放，最上一层高亮 + 向上箭头 */
  forward: () => svg(<><path d="M3 14.5l7.5 3.8 7.5-3.8M3 18.3l7.5 3.7 7.5-3.7" {...S} /><path d="M10.5 4.5l7.5 3.8-7.5 3.8L3 8.3z" {...F} /><path d="M21 11V4.5M21 4.5l-2.2 2.4M21 4.5l2.2 2.4" {...S} /></>),
  backward: () => svg(<><path d="M3 7.5l7.5 3.8 7.5-3.8" {...S} /><path d="M3 11.3l7.5 3.7 7.5-3.7" {...S} /><path d="M10.5 13.5l7.5 3.8-7.5 3.8L3 17.3z" {...F} /><path d="M21 13v6.5M21 19.5l-2.2-2.4M21 19.5l2.2-2.4" {...S} /></>),

  // ---------------------------------------------------------------- 视图
  grid: () => svg(<path d="M8.5 3.5v17M15.5 3.5v17M3.5 8.5h17M3.5 15.5h17" {...S} />),
  fullscreen: () => svg(<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" {...S} />),
  exitFullscreen: () => svg(<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" {...S} />),

  // ---------------------------------------------------------------- 图层栏（小图标）
  eye: () => svg(<><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" {...S} /><circle cx="12" cy="12" r="3" {...S} /></>),
  eyeOff: () => svg(<><path d="M2.5 12S6 5.5 12 5.5c1.6 0 3 .5 4.3 1.2M21.5 12S18 18.5 12 18.5c-1.6 0-3-.5-4.3-1.2" {...S} /><path d="M4 4l16 16" {...S} /></>),
  lockSmall: () => svg(<><rect x="5.5" y="11" width="13" height="9.5" rx="2" {...F} /><path d="M8.5 11V8a3.5 3.5 0 0 1 7 0v3" {...S} /></>),
  unlockSmall: () => svg(<><rect x="5.5" y="11" width="13" height="9.5" rx="2" {...S} /><path d="M8.5 11V8a3.5 3.5 0 0 1 6.7-1.5" {...S} /></>),
  grip: () => svg(<><circle cx="9" cy="6" r="1.5" fill="currentColor" stroke="none" /><circle cx="15" cy="6" r="1.5" fill="currentColor" stroke="none" /><circle cx="9" cy="12" r="1.5" fill="currentColor" stroke="none" /><circle cx="15" cy="12" r="1.5" fill="currentColor" stroke="none" /><circle cx="9" cy="18" r="1.5" fill="currentColor" stroke="none" /><circle cx="15" cy="18" r="1.5" fill="currentColor" stroke="none" /></>),
  flag: () => svg(<><path d="M6 21V4" {...S} /><path d="M6 4.5h11.5l-2.5 4 2.5 4H6z" {...F} /></>),
  toTop: () => svg(<path d="M5 4.5h14M12 20V9.5M12 9.5l-5 5M12 9.5l5 5" {...S} />),
  toBottom: () => svg(<path d="M5 19.5h14M12 4v10.5M12 14.5l-5-5M12 14.5l5-5" {...S} />),
  up: () => svg(<path d="M12 19V6M12 6l-5.5 5.5M12 6l5.5 5.5" {...S} />),
  down: () => svg(<path d="M12 5v13M12 18l-5.5-5.5M12 18l5.5-5.5" {...S} />),
  groupSmall: () => svg(<><rect x="3" y="3" width="18" height="18" rx="2" {...D} /><rect x="7" y="7" width="10" height="10" rx="1" {...F} /></>)
}
