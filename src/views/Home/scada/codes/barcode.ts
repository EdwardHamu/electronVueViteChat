/**
 * 一维条码编码器（无依赖）：Code 128（A / B / C 自动切换，任意 ASCII）、EAN-13 / UPC-A（12 或 13 位数字）、EAN-8（7 或 8 位数字）。
 * encodeBarcode(text, format) 返回模块序列（true = 条），渲染交给组件；EAN 的校验位缺省时自动补上，给了则校验。
 */
export type BarcodeFormat = 'code128' | 'ean13' | 'ean8'

export interface Barcode {
  format: BarcodeFormat
  /** 实际编码的文本（EAN 含校验位） */
  text: string
  /** 模块序列，true = 条 */
  modules: boolean[]
}

// Code 128 各符号的 6 段宽度（条空交替），103/104/105 为 Start A/B/C，106 为 Stop（7 段）
const CODE128 = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112'
]
const START_A = 103
const START_B = 104
const START_C = 105
const CODE_A = 101
const CODE_B = 100
const CODE_C = 99
const STOP = 106

const isDigit = (c: string) => c >= '0' && c <= '9'
/** 从 i 起连续数字的个数 */
const digitRun = (s: string, i: number) => {
  let n = 0
  while (i + n < s.length && isDigit(s[i + n])) n++
  return n
}
/** 字符在 A 表 / B 表里的值（不在表内返回 -1） */
const valueA = (c: string) => {
  const code = c.charCodeAt(0)
  if (code >= 32 && code <= 95) return code - 32
  if (code < 32) return code + 64
  return -1
}
const valueB = (c: string) => {
  const code = c.charCodeAt(0)
  return code >= 32 && code <= 127 ? code - 32 : -1
}

/** Code 128 自动编码：数字段 ≥ 4 位用 C 表，控制字符用 A 表，其余 B 表 */
const encodeCode128 = (text: string): number[] | null => {
  if (!text.length) return null
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) > 127) return null
  const values: number[] = []
  let i = 0
  let set: 'A' | 'B' | 'C'
  const run0 = digitRun(text, 0)
  if (run0 >= 4 || (run0 === text.length && run0 % 2 === 0 && run0 >= 2)) set = 'C'
  else set = valueB(text[0]) >= 0 ? 'B' : 'A'
  values.push(set === 'C' ? START_C : set === 'B' ? START_B : START_A)
  while (i < text.length) {
    if (set === 'C') {
      const run = digitRun(text, i)
      if (run >= 2) {
        values.push(parseInt(text.substr(i, 2), 10))
        i += 2
        continue
      }
      // 不够一对数字：切到 B（或 A）
      const next = text[i]
      set = valueB(next) >= 0 ? 'B' : 'A'
      values.push(set === 'B' ? CODE_B : CODE_A)
      continue
    }
    const run = digitRun(text, i)
    if (run >= 4 && (run % 2 === 0 || run >= 6)) {
      // 奇数长度的数字段先用当前表编一位，剩下偶数位再切 C
      if (run % 2 === 1) {
        values.push(set === 'B' ? valueB(text[i]) : valueA(text[i]))
        i++
      }
      set = 'C'
      values.push(CODE_C)
      continue
    }
    const c = text[i]
    const vb = valueB(c)
    const va = valueA(c)
    if (set === 'B') {
      if (vb >= 0) values.push(vb)
      else if (va >= 0) {
        set = 'A'
        values.push(CODE_A, va)
      } else return null
    } else {
      if (va >= 0) values.push(va)
      else if (vb >= 0) {
        set = 'B'
        values.push(CODE_B, vb)
      } else return null
    }
    i++
  }
  let sum = values[0]
  for (let k = 1; k < values.length; k++) sum += values[k] * k
  values.push(sum % 103, STOP)
  return values
}

const code128Modules = (values: number[]): boolean[] => {
  const out: boolean[] = []
  values.forEach(v => {
    const widths = CODE128[v]
    for (let k = 0; k < widths.length; k++) {
      const w = parseInt(widths[k], 10)
      for (let n = 0; n < w; n++) out.push(k % 2 === 0)
    }
  })
  return out // Stop（2331112）已含最后的终止条
}

// ---------- EAN ----------
const EAN_L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011']
const EAN_G = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111']
const EAN_R = ['1110010', '1100110', '1101100', '1000010', '1011100', '1001110', '1010000', '1000100', '1001000', '1110100']
/** EAN-13 左侧 6 位的编码表（由首位决定），L = 奇 / G = 偶 */
const EAN13_PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL']

/** EAN / UPC 校验位：从右往左交替乘 3、1 */
export const eanCheckDigit = (digits: string) => {
  let sum = 0
  for (let i = 0; i < digits.length; i++) {
    const d = digits.charCodeAt(digits.length - 1 - i) - 48
    sum += i % 2 === 0 ? d * 3 : d
  }
  return String((10 - (sum % 10)) % 10)
}

const bits = (s: string, out: boolean[]) => {
  for (let i = 0; i < s.length; i++) out.push(s[i] === '1')
}

/** 规整 EAN 数字：长度 = len-1 补校验位，= len 时校验；不合法返回 null */
const normalizeEan = (text: string, len: number): string | null => {
  if (!/^\d+$/.test(text)) return null
  if (text.length === len - 1) return text + eanCheckDigit(text)
  if (text.length === len) return eanCheckDigit(text.slice(0, -1)) === text[len - 1] ? text : null
  return null
}

const encodeEan13 = (digits: string): boolean[] => {
  const out: boolean[] = []
  const parity = EAN13_PARITY[digits.charCodeAt(0) - 48]
  bits('101', out)
  for (let i = 1; i <= 6; i++) bits((parity[i - 1] === 'L' ? EAN_L : EAN_G)[digits.charCodeAt(i) - 48], out)
  bits('01010', out)
  for (let i = 7; i <= 12; i++) bits(EAN_R[digits.charCodeAt(i) - 48], out)
  bits('101', out)
  return out
}

const encodeEan8 = (digits: string): boolean[] => {
  const out: boolean[] = []
  bits('101', out)
  for (let i = 0; i < 4; i++) bits(EAN_L[digits.charCodeAt(i) - 48], out)
  bits('01010', out)
  for (let i = 4; i < 8; i++) bits(EAN_R[digits.charCodeAt(i) - 48], out)
  bits('101', out)
  return out
}

/** 编码；内容不符合该格式（EAN 非数字 / 位数不对 / 校验位错，Code 128 非 ASCII 或空）时返回 null */
export const encodeBarcode = (text: string, format: BarcodeFormat): Barcode | null => {
  const str = String(text ?? '')
  if (format === 'ean13') {
    const digits = normalizeEan(str, 13)
    return digits ? { format, text: digits, modules: encodeEan13(digits) } : null
  }
  if (format === 'ean8') {
    const digits = normalizeEan(str, 8)
    return digits ? { format, text: digits, modules: encodeEan8(digits) } : null
  }
  const values = encodeCode128(str)
  return values ? { format: 'code128', text: str, modules: code128Modules(values) } : null
}

/** 把模块序列变成 SVG path（连续的条合并成一个矩形，单位 = 模块，高度 h） */
export const barcodeToPath = (modules: boolean[], h: number): string => {
  const parts: string[] = []
  let x = 0
  while (x < modules.length) {
    if (!modules[x]) {
      x++
      continue
    }
    let x2 = x
    while (x2 < modules.length && modules[x2]) x2++
    parts.push(`M${x} 0h${x2 - x}v${h}h${x - x2}z`)
    x = x2
  }
  return parts.join('')
}
