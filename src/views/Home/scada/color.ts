/**
 * 颜色工具（纯函数，便于单测）：hex 归一化、RGB / HSV 互转、明暗判断。供 ColorField 的调色盘与预设色块使用。
 */
export interface Hsv {
  /** 色相 0 ~ 360 */
  h: number
  /** 饱和度 0 ~ 1 */
  s: number
  /** 明度 0 ~ 1 */
  v: number
}

const HEX_RE = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i

/** 任意写法的 hex（#abc / #aabbcc / 不带 #）归一化为小写 #rrggbb；不是 hex 返回 null */
export const normalizeHex = (input: unknown): string | null => {
  if (typeof input !== 'string') return null
  const m = HEX_RE.exec(input.trim())
  if (!m) return null
  let h = m[1].toLowerCase()
  if (h.length === 3) h = h.split('').map(c => c + c).join('')
  return '#' + h
}

export const hexToRgb = (hex: string): { r: number; g: number; b: number } | null => {
  const n = normalizeHex(hex)
  if (!n) return null
  return { r: parseInt(n.slice(1, 3), 16), g: parseInt(n.slice(3, 5), 16), b: parseInt(n.slice(5, 7), 16) }
}

const to2 = (n: number) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0')

export const rgbToHex = (r: number, g: number, b: number) => `#${to2(r)}${to2(g)}${to2(b)}`

export const rgbToHsv = (r: number, g: number, b: number): Hsv => {
  const rr = r / 255
  const gg = g / 255
  const bb = b / 255
  const max = Math.max(rr, gg, bb)
  const min = Math.min(rr, gg, bb)
  const d = max - min
  let h = 0
  if (d > 0) {
    if (max === rr) h = ((gg - bb) / d) % 6
    else if (max === gg) h = (bb - rr) / d + 2
    else h = (rr - gg) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  return { h, s: max === 0 ? 0 : d / max, v: max }
}

export const hsvToRgb = (h: number, s: number, v: number): { r: number; g: number; b: number } => {
  const hh = (((h % 360) + 360) % 360) / 60
  const c = v * s
  const x = c * (1 - Math.abs((hh % 2) - 1))
  const m = v - c
  let r = 0
  let g = 0
  let b = 0
  if (hh < 1) [r, g, b] = [c, x, 0]
  else if (hh < 2) [r, g, b] = [x, c, 0]
  else if (hh < 3) [r, g, b] = [0, c, x]
  else if (hh < 4) [r, g, b] = [0, x, c]
  else if (hh < 5) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 }
}

export const hexToHsv = (hex: string): Hsv | null => {
  const rgb = hexToRgb(hex)
  return rgb ? rgbToHsv(rgb.r, rgb.g, rgb.b) : null
}

export const hsvToHex = (hsv: Hsv): string => {
  const { r, g, b } = hsvToRgb(hsv.h, hsv.s, hsv.v)
  return rgbToHex(r, g, b)
}

/** 亮色（true）还是暗色，用于决定色块上的选中标记 / 文字用深色还是浅色；非 hex 当作亮色 */
export const isLightColor = (hex: string): boolean => {
  const rgb = hexToRgb(hex)
  if (!rgb) return true
  return (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255 > 0.6
}

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)
