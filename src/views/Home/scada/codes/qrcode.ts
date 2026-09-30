/**
 * QR 码编码器（无依赖，ISO/IEC 18004 Model 2，版本 1~40，纠错 L / M / Q / H，数字 / 字母数字 / 字节(UTF-8) 三种模式自动选择，
 * 8 种掩码按规范罚分自动挑选）。只做编码：encodeQr(text, ecc) 返回模块矩阵（true = 深色），渲染交给组件。
 * 实现参考 Nayuki 的 QR-Code-generator 结构；冒烟测试之外还用 python qrcode / zxing-cpp 逐模块比对与解码验证过（见 AGENTS.md）。
 */
export type QrEcc = 'L' | 'M' | 'Q' | 'H'

export interface QrCode {
  version: number
  size: number
  ecc: QrEcc
  mask: number
  /** modules[y][x] */
  modules: boolean[][]
}

const ECC_INDEX: Record<QrEcc, number> = { L: 0, M: 1, Q: 2, H: 3 }
/** 格式信息里的纠错等级编码 */
const ECC_FORMAT_BITS: Record<QrEcc, number> = { L: 1, M: 0, Q: 3, H: 2 }

// 每块纠错码字数 / 块数：下标为版本（0 占位），行序 L M Q H
const ECC_CODEWORDS_PER_BLOCK = [
  [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
  [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30]
]
const NUM_ERROR_CORRECTION_BLOCKS = [
  [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
  [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
  [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81]
]

const ALNUM = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:'

type Mode = 'numeric' | 'alnum' | 'byte'
const MODE_BITS: Record<Mode, number> = { numeric: 1, alnum: 2, byte: 4 }
const CHAR_COUNT_BITS: Record<Mode, [number, number, number]> = { numeric: [10, 12, 14], alnum: [9, 11, 13], byte: [8, 16, 16] }

/** 数据区可用的原始模块数（去掉功能图形） */
export const numRawDataModules = (ver: number) => {
  let result = (16 * ver + 128) * ver + 64
  if (ver >= 2) {
    const numAlign = Math.floor(ver / 7) + 2
    result -= (25 * numAlign - 10) * numAlign - 55
    if (ver >= 7) result -= 36
  }
  return result
}

/** 某版本 / 纠错等级下可放的数据码字数 */
export const numDataCodewords = (ver: number, ecc: QrEcc) => {
  const e = ECC_INDEX[ecc]
  return Math.floor(numRawDataModules(ver) / 8) - ECC_CODEWORDS_PER_BLOCK[e][ver] * NUM_ERROR_CORRECTION_BLOCKS[e][ver]
}

/** 对齐图形中心坐标 */
export const alignmentPositions = (ver: number): number[] => {
  if (ver === 1) return []
  const numAlign = Math.floor(ver / 7) + 2
  const size = ver * 4 + 17
  const step = Math.floor((ver * 8 + numAlign * 3 + 5) / (numAlign * 4 - 4)) * 2
  const result = [6]
  for (let pos = size - 7; result.length < numAlign; pos -= step) result.splice(1, 0, pos)
  return result
}

const utf8Bytes = (s: string): number[] => {
  if (typeof TextEncoder !== 'undefined') return Array.from(new TextEncoder().encode(s))
  const out: number[] = []
  const enc = encodeURIComponent(s)
  for (let i = 0; i < enc.length; i++) {
    if (enc[i] === '%') {
      out.push(parseInt(enc.substr(i + 1, 2), 16))
      i += 2
    } else out.push(enc.charCodeAt(i))
  }
  return out
}

class BitBuffer {
  bits: number[] = []
  append(val: number, len: number) {
    for (let i = len - 1; i >= 0; i--) this.bits.push((val >>> i) & 1)
  }
  get length() {
    return this.bits.length
  }
}

const charCountBits = (mode: Mode, ver: number) => CHAR_COUNT_BITS[mode][ver <= 9 ? 0 : ver <= 26 ? 1 : 2]

/** 选模式：全数字 → numeric，全在字母数字表内 → alnum，否则 byte（UTF-8） */
const pickMode = (text: string): Mode => {
  if (/^[0-9]+$/.test(text)) return 'numeric'
  let alnum = text.length > 0
  for (let i = 0; i < text.length && alnum; i++) if (ALNUM.indexOf(text[i]) < 0) alnum = false
  return alnum ? 'alnum' : 'byte'
}

/** 编码数据段（不含模式指示 / 字符数） */
const encodeSegment = (text: string, mode: Mode, bytes: number[]): BitBuffer => {
  const bb = new BitBuffer()
  if (mode === 'numeric') {
    for (let i = 0; i < text.length; i += 3) {
      const chunk = text.substr(i, 3)
      bb.append(parseInt(chunk, 10), chunk.length * 3 + 1)
    }
  } else if (mode === 'alnum') {
    let i = 0
    for (; i + 2 <= text.length; i += 2) bb.append(ALNUM.indexOf(text[i]) * 45 + ALNUM.indexOf(text[i + 1]), 11)
    if (i < text.length) bb.append(ALNUM.indexOf(text[i]), 6)
  } else {
    bytes.forEach(b => bb.append(b, 8))
  }
  return bb
}

// ---------- Reed-Solomon (GF(256), 0x11D) ----------
const gfMul = (x: number, y: number) => {
  let z = 0
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d)
    z ^= ((y >>> i) & 1) * x
  }
  return z & 0xff
}

const rsDivisor = (degree: number): number[] => {
  const result = new Array<number>(degree).fill(0)
  result[degree - 1] = 1
  let root = 1
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      result[j] = gfMul(result[j], root)
      if (j + 1 < degree) result[j] ^= result[j + 1]
    }
    root = gfMul(root, 0x02)
  }
  return result
}

const rsRemainder = (data: number[], divisor: number[]): number[] => {
  const result = new Array<number>(divisor.length).fill(0)
  for (const b of data) {
    const factor = b ^ (result.shift() as number)
    result.push(0)
    divisor.forEach((coef, i) => (result[i] ^= gfMul(coef, factor)))
  }
  return result
}

/** 数据码字分块加纠错并交织 */
const addEccAndInterleave = (data: number[], ver: number, ecc: QrEcc): number[] => {
  const e = ECC_INDEX[ecc]
  const numBlocks = NUM_ERROR_CORRECTION_BLOCKS[e][ver]
  const blockEccLen = ECC_CODEWORDS_PER_BLOCK[e][ver]
  const rawCodewords = Math.floor(numRawDataModules(ver) / 8)
  const numShortBlocks = numBlocks - (rawCodewords % numBlocks)
  const shortBlockLen = Math.floor(rawCodewords / numBlocks)
  const blocks: number[][] = []
  const rsDiv = rsDivisor(blockEccLen)
  for (let i = 0, k = 0; i < numBlocks; i++) {
    const datLen = shortBlockLen - blockEccLen + (i < numShortBlocks ? 0 : 1)
    const dat = data.slice(k, k + datLen)
    k += datLen
    const eccBytes = rsRemainder(dat, rsDiv)
    if (i < numShortBlocks) dat.push(0) // 短块补一个占位，交织时跳过
    blocks.push(dat.concat(eccBytes))
  }
  const result: number[] = []
  for (let i = 0; i < blocks[0].length; i++) {
    blocks.forEach((block, j) => {
      if (i !== shortBlockLen - blockEccLen || j >= numShortBlocks) result.push(block[i])
    })
  }
  return result
}

// ---------- 矩阵 ----------
class Matrix {
  size: number
  modules: boolean[][]
  isFunction: boolean[][]
  constructor(size: number) {
    this.size = size
    this.modules = Array.from({ length: size }, () => new Array<boolean>(size).fill(false))
    this.isFunction = Array.from({ length: size }, () => new Array<boolean>(size).fill(false))
  }
  setFunction(x: number, y: number, dark: boolean) {
    this.modules[y][x] = dark
    this.isFunction[y][x] = true
  }
  drawFinder(cx: number, cy: number) {
    for (let dy = -4; dy <= 4; dy++)
      for (let dx = -4; dx <= 4; dx++) {
        const dist = Math.max(Math.abs(dx), Math.abs(dy))
        const x = cx + dx
        const y = cy + dy
        if (x >= 0 && x < this.size && y >= 0 && y < this.size) this.setFunction(x, y, dist !== 2 && dist !== 4)
      }
  }
  drawAlignment(cx: number, cy: number) {
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) this.setFunction(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1)
  }
  drawFormatBits(ecc: QrEcc, mask: number) {
    const data = (ECC_FORMAT_BITS[ecc] << 3) | mask
    let rem = data
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537)
    const bits = ((data << 10) | rem) ^ 0x5412
    const bit = (i: number) => ((bits >>> i) & 1) !== 0
    for (let i = 0; i <= 5; i++) this.setFunction(8, i, bit(i))
    this.setFunction(8, 7, bit(6))
    this.setFunction(8, 8, bit(7))
    this.setFunction(7, 8, bit(8))
    for (let i = 9; i < 15; i++) this.setFunction(14 - i, 8, bit(i))
    for (let i = 0; i < 8; i++) this.setFunction(this.size - 1 - i, 8, bit(i))
    for (let i = 8; i < 15; i++) this.setFunction(8, this.size - 15 + i, bit(i))
    this.setFunction(8, this.size - 8, true)
  }
  drawVersion(ver: number) {
    if (ver < 7) return
    let rem = ver
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25)
    const bits = (ver << 12) | rem
    for (let i = 0; i < 18; i++) {
      const bit = ((bits >>> i) & 1) !== 0
      const a = this.size - 11 + (i % 3)
      const b = Math.floor(i / 3)
      this.setFunction(a, b, bit)
      this.setFunction(b, a, bit)
    }
  }
  drawFunctionPatterns(ver: number, ecc: QrEcc) {
    for (let i = 0; i < this.size; i++) {
      this.setFunction(6, i, i % 2 === 0)
      this.setFunction(i, 6, i % 2 === 0)
    }
    this.drawFinder(3, 3)
    this.drawFinder(this.size - 4, 3)
    this.drawFinder(3, this.size - 4)
    const align = alignmentPositions(ver)
    const n = align.length
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        if ((i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0)) continue
        this.drawAlignment(align[i], align[j])
      }
    this.drawFormatBits(ecc, 0)
    this.drawVersion(ver)
  }
  drawCodewords(data: number[]) {
    let i = 0
    const total = data.length * 8
    for (let right = this.size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5
      for (let vert = 0; vert < this.size; vert++) {
        for (let j = 0; j < 2; j++) {
          const x = right - j
          const upward = ((right + 1) & 2) === 0
          const y = upward ? this.size - 1 - vert : vert
          if (!this.isFunction[y][x] && i < total) {
            this.modules[y][x] = ((data[i >>> 3] >>> (7 - (i & 7))) & 1) !== 0
            i++
          }
        }
      }
    }
  }
  applyMask(mask: number) {
    for (let y = 0; y < this.size; y++)
      for (let x = 0; x < this.size; x++) {
        let invert = false
        switch (mask) {
          case 0:
            invert = (x + y) % 2 === 0
            break
          case 1:
            invert = y % 2 === 0
            break
          case 2:
            invert = x % 3 === 0
            break
          case 3:
            invert = (x + y) % 3 === 0
            break
          case 4:
            invert = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0
            break
          case 5:
            invert = ((x * y) % 2) + ((x * y) % 3) === 0
            break
          case 6:
            invert = (((x * y) % 2) + ((x * y) % 3)) % 2 === 0
            break
          default:
            invert = (((x + y) % 2) + ((x * y) % 3)) % 2 === 0
        }
        if (!this.isFunction[y][x] && invert) this.modules[y][x] = !this.modules[y][x]
      }
  }
  /** 规范里的四条罚分规则 */
  penalty(): number {
    const n = this.size
    let result = 0
    const finderPenalty = (history: number[]) => {
      const core = history[1] > 0 && history[2] === history[1] && history[3] === history[1] * 3 && history[4] === history[1] && history[5] === history[1]
      return (core && history[0] >= history[1] * 4 && history[6] >= history[1] ? 1 : 0) + (core && history[6] >= history[1] * 4 && history[0] >= history[1] ? 1 : 0)
    }
    const addHistory = (run: number, history: number[]) => {
      if (history[0] === 0) run += n // 边缘按浅色处理
      history.pop()
      history.unshift(run)
    }
    const terminate = (color: boolean, run: number, history: number[]) => {
      if (color) {
        addHistory(run, history)
        run = 0
      }
      run += n
      addHistory(run, history)
      return finderPenalty(history)
    }
    for (let y = 0; y < n; y++) {
      let runColor = false
      let runX = 0
      const history = [0, 0, 0, 0, 0, 0, 0]
      for (let x = 0; x < n; x++) {
        if (this.modules[y][x] === runColor) {
          runX++
          if (runX === 5) result += 3
          else if (runX > 5) result++
        } else {
          addHistory(runX, history)
          if (!runColor) result += finderPenalty(history) * 40
          runColor = this.modules[y][x]
          runX = 1
        }
      }
      result += terminate(runColor, runX, history) * 40
    }
    for (let x = 0; x < n; x++) {
      let runColor = false
      let runY = 0
      const history = [0, 0, 0, 0, 0, 0, 0]
      for (let y = 0; y < n; y++) {
        if (this.modules[y][x] === runColor) {
          runY++
          if (runY === 5) result += 3
          else if (runY > 5) result++
        } else {
          addHistory(runY, history)
          if (!runColor) result += finderPenalty(history) * 40
          runColor = this.modules[y][x]
          runY = 1
        }
      }
      result += terminate(runColor, runY, history) * 40
    }
    for (let y = 0; y < n - 1; y++)
      for (let x = 0; x < n - 1; x++) {
        const c = this.modules[y][x]
        if (c === this.modules[y][x + 1] && c === this.modules[y + 1][x] && c === this.modules[y + 1][x + 1]) result += 3
      }
    let dark = 0
    for (const row of this.modules) for (const c of row) if (c) dark++
    const total = n * n
    const k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1
    result += k * 10
    return result
  }
}

export interface QrOptions {
  ecc?: QrEcc
  /** 指定掩码 0~7（测试用），缺省自动选罚分最低的 */
  mask?: number
  /** 最小版本（缺省 1） */
  minVersion?: number
}

/** 编码；文本太长放不下 40 版时返回 null */
export const encodeQr = (text: string, options: QrOptions = {}): QrCode | null => {
  const ecc: QrEcc = options.ecc || 'M'
  const str = String(text ?? '')
  const mode = pickMode(str)
  const bytes = mode === 'byte' ? utf8Bytes(str) : []
  const charCount = mode === 'byte' ? bytes.length : str.length
  const seg = encodeSegment(str, mode, bytes)
  // 选最小版本
  let version = -1
  for (let v = Math.max(1, options.minVersion || 1); v <= 40; v++) {
    const bitsNeeded = 4 + charCountBits(mode, v) + seg.length
    if (charCount >= 1 << charCountBits(mode, v)) continue
    if (bitsNeeded <= numDataCodewords(v, ecc) * 8) {
      version = v
      break
    }
  }
  if (version < 0) return null
  const capacityBits = numDataCodewords(version, ecc) * 8
  const bb = new BitBuffer()
  bb.append(MODE_BITS[mode], 4)
  bb.append(charCount, charCountBits(mode, version))
  bb.bits.push(...seg.bits)
  bb.append(0, Math.min(4, capacityBits - bb.length))
  bb.append(0, (8 - (bb.length % 8)) % 8)
  for (let pad = 0xec; bb.length < capacityBits; pad ^= 0xec ^ 0x11) bb.append(pad, 8)
  const data: number[] = []
  for (let i = 0; i < bb.length; i += 8) {
    let b = 0
    for (let j = 0; j < 8; j++) b = (b << 1) | bb.bits[i + j]
    data.push(b)
  }
  const codewords = addEccAndInterleave(data, version, ecc)
  const size = version * 4 + 17
  const m = new Matrix(size)
  m.drawFunctionPatterns(version, ecc)
  m.drawCodewords(codewords)
  let mask = options.mask ?? -1
  if (mask < 0 || mask > 7) {
    let best = Infinity
    for (let i = 0; i < 8; i++) {
      m.applyMask(i)
      m.drawFormatBits(ecc, i)
      const p = m.penalty()
      if (p < best) {
        best = p
        mask = i
      }
      m.applyMask(i) // 掩码是异或，再来一次即撤销
    }
  }
  m.applyMask(mask)
  m.drawFormatBits(ecc, mask)
  return { version, size, ecc, mask, modules: m.modules }
}

/** 把模块矩阵变成一条 SVG path（每个深色模块一个 1×1 方块，单位 = 模块） */
export const qrToPath = (qr: QrCode): string => {
  const parts: string[] = []
  for (let y = 0; y < qr.size; y++) {
    let x = 0
    while (x < qr.size) {
      if (!qr.modules[y][x]) {
        x++
        continue
      }
      let x2 = x
      while (x2 < qr.size && qr.modules[y][x2]) x2++
      parts.push(`M${x} ${y}h${x2 - x}v1h${x - x2}z`)
      x = x2
    }
  }
  return parts.join('')
}
