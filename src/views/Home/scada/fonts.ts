/**
 * 组态组件的「字体」属性（WidgetDefinition.hasText = true 的组件由 registerWidget 自动加上，存在 props.fontFamily，空 = 默认字体）。
 *
 * 系统字体列表的来源：
 *  1. Local Font Access API（window.queryLocalFonts，Chromium / WebView2 ≥ 103）：能拿到本机安装的全部字体，
 *     但需要用户手势 + 权限（WebView2 会走宿主的 PermissionRequested，默认弹权限提示），所以只在用户点开字体下拉时调用一次；
 *  2. 拿不到时（不支持 / 被拒绝）退回「候选字体 + canvas 测宽探测」：逐个比较候选字体与通用字体族的渲染宽度，不同即视为已安装。
 * 宿主 JsBridge 目前没有列字体的接口（调用不存在的方法会弹错误提示），所以不走宿主。
 *
 * 渲染：Canvas.tsx 把 fontFamilyCss() 加在组件外层 wrapper 上并带 data-scada-font 属性，style.scss 里
 * `[data-scada-font] *` 让组件内部所有元素（包括 input / button 和自带 font-family 的 .value-number / font-mono）继承它；
 * 自定义组件（iframe）由 buildCustomDoc() 写进 iframe 自己的样式。
 */
import { reactive } from 'vue'

export const FONT_FAMILY_KEY = 'fontFamily'

/** 默认字体栈：选中的字体缺字 / 没装时的回退 */
export const FONT_FALLBACK = 'system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", "PingFang SC", sans-serif'

/** 常见字体的中文名（下拉里显示「中文名 (英文名)」，值存英文名） */
export const FONT_ZH_NAMES: Record<string, string> = {
  'Microsoft YaHei': '微软雅黑',
  'Microsoft YaHei UI': '微软雅黑 UI',
  SimSun: '宋体',
  NSimSun: '新宋体',
  SimHei: '黑体',
  KaiTi: '楷体',
  FangSong: '仿宋',
  DengXian: '等线',
  'Microsoft JhengHei': '微軟正黑體',
  PMingLiU: '新細明體',
  MingLiU: '細明體',
  YouYuan: '幼圆',
  LiSu: '隶书',
  STXihei: '华文细黑',
  STKaiti: '华文楷体',
  STSong: '华文宋体',
  STFangsong: '华文仿宋',
  STZhongsong: '华文中宋',
  'Source Han Sans SC': '思源黑体',
  'Source Han Serif SC': '思源宋体',
  'Noto Sans SC': '思源黑体 (Noto)',
  'PingFang SC': '苹方',
  'WenQuanYi Micro Hei': '文泉驿微米黑'
}

/** 探测用的候选字体（Windows 自带为主，兼顾常见的中文字体和其它平台） */
export const FONT_CANDIDATES = [
  'Microsoft YaHei', 'Microsoft YaHei UI', 'SimSun', 'NSimSun', 'SimHei', 'KaiTi', 'FangSong', 'DengXian',
  'Microsoft JhengHei', 'PMingLiU', 'MingLiU', 'YouYuan', 'LiSu', 'STXihei', 'STKaiti', 'STSong', 'STFangsong', 'STZhongsong',
  'Source Han Sans SC', 'Source Han Serif SC', 'Noto Sans SC', 'Noto Sans CJK SC', 'PingFang SC', 'Hiragino Sans GB', 'WenQuanYi Micro Hei',
  'Arial', 'Arial Black', 'Arial Narrow', 'Bahnschrift', 'Calibri', 'Cambria', 'Candara', 'Cascadia Code', 'Cascadia Mono', 'Comic Sans MS',
  'Consolas', 'Constantia', 'Corbel', 'Courier New', 'Ebrima', 'Franklin Gothic Medium', 'Gabriola', 'Gadugi', 'Georgia', 'Impact',
  'Ink Free', 'Javanese Text', 'Leelawadee UI', 'Lucida Console', 'Lucida Sans Unicode', 'Malgun Gothic', 'Microsoft Sans Serif',
  'MS Gothic', 'MV Boli', 'Nirmala UI', 'Palatino Linotype', 'Segoe Print', 'Segoe Script', 'Segoe UI', 'Segoe UI Black',
  'Segoe UI Emoji', 'Segoe UI Light', 'Segoe UI Semibold', 'Segoe UI Symbol', 'Sitka Text', 'Sylfaen', 'Tahoma', 'Times New Roman',
  'Trebuchet MS', 'Verdana', 'Yu Gothic', 'Helvetica', 'Helvetica Neue', 'Roboto', 'Noto Sans', 'DejaVu Sans', 'DejaVu Serif',
  'DejaVu Sans Mono', 'Liberation Sans', 'Liberation Serif', 'Liberation Mono', 'Ubuntu'
]

type LocalFontState = 'idle' | 'loading' | 'granted' | 'denied' | 'unsupported'

export const fontState = reactive({
  /** 可选的系统字体（family 名，已排序去重） */
  list: [] as string[],
  /** 探测过了（canvas 探测只做一次） */
  detected: false,
  /** Local Font Access API 的状态 */
  local: 'idle' as LocalFontState
})

/** CSS font-family 值：选中的字体在前，默认字体栈兜底；空 = 不设置 */
export const fontFamilyCss = (name: unknown) => {
  const n = typeof name === 'string' ? name.trim().replace(/["\\;{}<>]/g, '') : ''
  return n ? `"${n}", ${FONT_FALLBACK}` : ''
}

/** 下拉里显示的名字 */
export const fontLabel = (name: string) => (FONT_ZH_NAMES[name] ? `${FONT_ZH_NAMES[name]} (${name})` : name)

const sortFonts = (names: Iterable<string>) => {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of names) {
    const n = String(raw || '').trim()
    if (!n || seen.has(n.toLowerCase())) continue
    seen.add(n.toLowerCase())
    out.push(n)
  }
  // 有中文名的（常用中文字体）排前面，其余按字母
  return out.sort((a, b) => {
    const za = FONT_ZH_NAMES[a] ? 0 : 1
    const zb = FONT_ZH_NAMES[b] ? 0 : 1
    return za - zb || a.localeCompare(b)
  })
}

const mergeFonts = (names: string[]) => {
  fontState.list = sortFonts([...fontState.list, ...names])
}

/**
 * canvas 测宽探测：同一段文字分别用「候选字体, 通用族」和「通用族」渲染，任一通用族下宽度不同即视为已安装。
 * 没有 canvas（jsdom 等测试环境）时无法判断，返回 null。
 */
export const detectInstalledFonts = (candidates: string[] = FONT_CANDIDATES): string[] | null => {
  if (typeof document === 'undefined') return null
  let ctx: CanvasRenderingContext2D | null = null
  try {
    ctx = document.createElement('canvas').getContext('2d')
  } catch {
    ctx = null
  }
  if (!ctx || typeof ctx.measureText !== 'function') return null
  const sample = 'mmmmmmmmmmlliWwQq@#中文字体测试０１'
  const bases = ['monospace', 'serif', 'sans-serif']
  const width = (font: string) => {
    ctx!.font = `72px ${font}`
    return ctx!.measureText(sample).width
  }
  const baseWidths = bases.map(width)
  return candidates.filter(name => bases.some((b, i) => width(`"${name}", ${b}`) !== baseWidths[i]))
}

/** 确保有一份字体列表（canvas 探测，只做一次；测不了就把候选全部列出来） */
export const ensureFonts = () => {
  if (fontState.detected) return
  fontState.detected = true
  const found = detectInstalledFonts()
  mergeFonts(found === null ? FONT_CANDIDATES : found)
}

/**
 * 用 Local Font Access API 读取本机全部字体（需在用户手势里调用，例如点开字体下拉时）。
 * 成功后合并进列表；不支持 / 被拒绝时保持探测结果。重复调用只会在还没成功过时再试。
 */
export const requestLocalFonts = async () => {
  if (fontState.local === 'granted' || fontState.local === 'loading' || fontState.local === 'unsupported') return
  const query = typeof window !== 'undefined' ? (window as any).queryLocalFonts : undefined
  if (typeof query !== 'function') {
    fontState.local = 'unsupported'
    return
  }
  fontState.local = 'loading'
  try {
    const fonts: { family?: string }[] = await query.call(window)
    const families = (fonts || []).map(f => f && f.family).filter((f): f is string => !!f)
    if (families.length) {
      mergeFonts(families)
      fontState.local = 'granted'
    } else {
      // 权限被拒时有的实现返回空数组
      fontState.local = 'denied'
    }
  } catch {
    fontState.local = 'denied'
  }
}
