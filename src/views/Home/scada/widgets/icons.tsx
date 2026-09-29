/**
 * 组件库小图标：24×24 viewBox 的线条 SVG，颜色跟随 currentColor（组件库里统一为灰蓝色，选中时变蓝）。
 * 每个组件 definition.icon 引用这里的一个渲染函数；没有图标的组件在组件库里显示名称首字。
 */
import type { VNodeChild } from 'vue'

const S = { fill: 'none', stroke: 'currentColor', 'stroke-width': 1.5, 'stroke-linecap': 'round' as const, 'stroke-linejoin': 'round' as const }
/** 闭合图形：淡淡的填充 + 描边 */
const F = { ...S, fill: 'currentColor', 'fill-opacity': 0.15 }

const svg = (children: VNodeChild) => (
  <svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden="true">
    {children}
  </svg>
)
/** 小号等宽文字（IO 域 / 按钮上的 0.01 / ABC 之类） */
const txt = (x: number, y: number, s: string, size = 6) => (
  <text x={x} y={y} font-size={size} font-family="ui-monospace, Consolas, monospace" fill="currentColor" text-anchor="middle" stroke="none">{s}</text>
)

export const icons: Record<string, () => VNodeChild> = {
  // ---------------- 基础图素
  line: () => svg(<path d="M4 20 L20 4" {...S} />),
  polyline: () => svg(<path d="M5 20 V5 H20" {...S} />),
  arc: () => svg(<path d="M5 20 A15 15 0 0 1 20 5" {...S} />),
  rect: () => svg(<rect x="3.5" y="6" width="17" height="12" rx="0.5" {...F} />),
  circle: () => svg(<circle cx="12" cy="12" r="8" {...F} />),
  ellipse: () => svg(<ellipse cx="12" cy="12" rx="9" ry="6" {...F} />),
  sector: () => svg(<path d="M12 18 L4.5 9 A11 11 0 0 1 19.5 9 Z" {...F} />),
  segment: () => svg(<path d="M3.5 16 A8.5 8.5 0 0 1 20.5 16 Z" {...F} />),
  polygon: () => svg(<path d="M12 3.5 L20.5 9.7 L17.3 19.5 H6.7 L3.5 9.7 Z" {...F} />),
  textLabel: () => svg(<path d="M5 20 L12 4 L19 20 M7.6 14 H16.4" {...S} />),
  image: () => svg(
    <>
      <rect x="3" y="5" width="18" height="14" rx="1" {...F} />
      <circle cx="8.5" cy="9.5" r="1.5" fill="currentColor" stroke="none" />
      <path d="M4 18 L10 12 L14 16 L16.5 13.5 L20 17" {...S} />
    </>
  ),
  pipe: () => svg(
    <>
      <path d="M6 4 V13 A5 5 0 0 0 11 18 H20" {...S} stroke-width={5} stroke-opacity={0.25} />
      <path d="M6 4 V13 A5 5 0 0 0 11 18 H20" {...S} />
      <path d="M3.5 4.5 H8.5 M19.5 15.5 V20.5" {...S} />
    </>
  ),
  // ---------------- 控制与显示
  numericIO: () => svg(
    <>
      <rect x="2.5" y="7" width="19" height="10" rx="1" {...S} />
      {txt(12, 14.3, '0.01', 6.5)}
    </>
  ),
  stringIO: () => svg(
    <>
      <rect x="2.5" y="7" width="19" height="10" rx="1" {...S} />
      {txt(12, 14.3, 'ABC', 6.5)}
    </>
  ),
  datetime: () => svg(
    <>
      <rect x="2.5" y="7" width="19" height="10" rx="1" {...S} />
      {txt(12, 14.3, '12:00', 6)}
    </>
  ),
  button: () => svg(
    <>
      <rect x="3" y="5" width="18" height="9" rx="1.5" {...F} />
      <path d="M8 9.5 H16" {...S} />
      <path d="M13 12 V20 L15 17.5 H18.5 Z" fill="currentColor" stroke="none" />
    </>
  ),
  bitButton: () => svg(
    <>
      {txt(12, 8.5, '0 1', 7)}
      <rect x="4" y="11" width="16" height="8" rx="1" {...F} />
      <path d="M8 15 H16" {...S} />
    </>
  ),
  wordButton: () => svg(
    <>
      {txt(12, 8.5, '123', 7)}
      <rect x="4" y="11" width="16" height="8" rx="1" {...F} />
      <path d="M8 15 H16" {...S} />
    </>
  ),
  bitStatus: () => svg(
    <>
      {txt(12, 8.5, '0 1', 7)}
      <circle cx="8.5" cy="15.5" r="3" {...S} />
      <circle cx="15.5" cy="15.5" r="3" fill="currentColor" stroke="none" />
    </>
  ),
  wordStatus: () => svg(
    <>
      {txt(12, 8.5, '123', 7)}
      <circle cx="6.5" cy="15.5" r="2.6" fill="currentColor" stroke="none" />
      <circle cx="12" cy="15.5" r="2.6" fill="currentColor" fill-opacity="0.55" stroke="none" />
      <circle cx="17.5" cy="15.5" r="2.6" {...S} />
    </>
  ),
  textList: () => svg(
    <>
      <rect x="3" y="4" width="18" height="16" rx="1" {...S} />
      <rect x="3" y="4" width="18" height="5" fill="currentColor" fill-opacity="0.25" stroke="none" />
      <path d="M6 12.5 H13 M6 16 H13" {...S} />
      {txt(17, 18, 'A', 7)}
    </>
  ),
  textSwitch: () => svg(
    <>
      <rect x="3" y="8" width="18" height="8" rx="4" {...F} />
      <circle cx="8" cy="12" r="2.6" fill="#fff" stroke="currentColor" stroke-width="1.2" />
    </>
  ),
  radio: () => svg(
    <>
      <circle cx="7" cy="8" r="2.8" {...S} />
      <circle cx="7" cy="8" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="7" cy="16" r="2.8" {...S} />
      <path d="M12 8 H19 M12 16 H19" {...S} />
    </>
  ),
  checkbox: () => svg(
    <>
      <rect x="4" y="5" width="6" height="6" rx="0.8" {...S} />
      <path d="M5.5 8 L7 9.5 L9 6.5" {...S} stroke-width={1.3} />
      <rect x="4" y="13" width="6" height="6" rx="0.8" {...S} />
      <path d="M13 8 H19.5 M13 16 H19.5" {...S} />
    </>
  ),
  table: () => svg(
    <>
      <rect x="3" y="4" width="18" height="16" rx="1" {...S} />
      <path d="M3 9.5 H21 M3 14.5 H21 M9 4 V20 M15 4 V20" {...S} stroke-width={1.2} />
    </>
  ),
  // ---------------- 数据看板
  valueCard: () => svg(
    <>
      <rect x="3" y="4.5" width="18" height="15" rx="1.5" {...F} />
      {txt(12, 14.8, '1.52', 6.5)}
    </>
  ),
  gauge: () => svg(
    <>
      <path d="M4 17 A8.5 8.5 0 0 1 20 17" {...S} stroke-width={2.2} />
      <path d="M12 17 L16 10" {...S} />
      <circle cx="12" cy="17" r="1.4" fill="currentColor" stroke="none" />
    </>
  ),
  sparkline: () => svg(<path d="M3 16 L7.5 10 L11 14 L15 7 L18 12 L21 9" {...S} />),
  statusLamp: () => svg(
    <>
      <circle cx="12" cy="12" r="5.5" fill="currentColor" fill-opacity="0.35" stroke="currentColor" stroke-width="1.5" />
      <circle cx="12" cy="12" r="8.5" {...S} stroke-opacity={0.35} />
    </>
  )
}

export const widgetIcon = (type: string) => icons[type]
