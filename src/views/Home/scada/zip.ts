/**
 * 极简 zip 读写（不引第三方库；组态导入 / 导出打包用）。
 *  - 写：仅 STORE（不压缩）。图片本身已是压缩格式，layout.json 很小，不值得为 deflate 引依赖；
 *       文件名按 UTF-8 写入并置位 bit 11，Windows 资源管理器 / 7-Zip 都能正常打开。
 *  - 读：支持 STORE 与 DEFLATE（用浏览器 / Node 18+ 自带的 DecompressionStream('deflate-raw')），
 *       所以用户解包修改后用系统自带压缩重新打包也能导入。不支持 ZIP64（> 4 GB）与加密。
 */

export interface ZipInput {
  name: string
  data: Uint8Array
}

export interface ZipEntry {
  name: string
  size: number
  compressedSize: number
  method: number
  /** 读取并解压该项内容 */
  data(): Promise<Uint8Array>
}

// TS 4.9 的 lib.dom 还没有 DecompressionStream 的声明，这里只声明用到的部分
declare const DecompressionStream:
  | { new (format: string): { readonly readable: ReadableStream<Uint8Array>; readonly writable: WritableStream<Uint8Array> } }
  | undefined

const SIG_LOCAL = 0x04034b50
const SIG_CENTRAL = 0x02014b50
const SIG_EOCD = 0x06054b50
const FLAG_UTF8 = 0x0800
const METHOD_STORE = 0
const METHOD_DEFLATE = 8

let crcTable: Uint32Array | null = null
const getCrcTable = () => {
  if (crcTable) return crcTable
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  crcTable = t
  return t
}

export const crc32 = (bytes: Uint8Array) => {
  const t = getCrcTable()
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i++) c = t[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

const encoder = new TextEncoder()
const decoder = new TextDecoder('utf-8')

/** MS-DOS 时间 / 日期（zip 的时间戳格式，2 秒精度） */
const dosDateTime = (d: Date) => {
  const time = ((d.getHours() & 0x1f) << 11) | ((d.getMinutes() & 0x3f) << 5) | ((d.getSeconds() >> 1) & 0x1f)
  const year = Math.max(1980, d.getFullYear())
  const date = (((year - 1980) & 0x7f) << 9) | (((d.getMonth() + 1) & 0x0f) << 5) | (d.getDate() & 0x1f)
  return { time, date }
}

/** 生成 zip 文件（STORE，无压缩） */
export const createZip = (inputs: ZipInput[], now = new Date()): Uint8Array => {
  const { time, date } = dosDateTime(now)
  const locals: Uint8Array[] = []
  const centrals: Uint8Array[] = []
  let offset = 0
  inputs.forEach(input => {
    const name = encoder.encode(input.name)
    const data = input.data
    const crc = crc32(data)

    const local = new Uint8Array(30 + name.length)
    const lv = new DataView(local.buffer)
    lv.setUint32(0, SIG_LOCAL, true)
    lv.setUint16(4, 20, true) // version needed
    lv.setUint16(6, FLAG_UTF8, true)
    lv.setUint16(8, METHOD_STORE, true)
    lv.setUint16(10, time, true)
    lv.setUint16(12, date, true)
    lv.setUint32(14, crc, true)
    lv.setUint32(18, data.length, true)
    lv.setUint32(22, data.length, true)
    lv.setUint16(26, name.length, true)
    lv.setUint16(28, 0, true)
    local.set(name, 30)

    const central = new Uint8Array(46 + name.length)
    const cv = new DataView(central.buffer)
    cv.setUint32(0, SIG_CENTRAL, true)
    cv.setUint16(4, 20, true) // version made by (MS-DOS, 2.0)
    cv.setUint16(6, 20, true) // version needed
    cv.setUint16(8, FLAG_UTF8, true)
    cv.setUint16(10, METHOD_STORE, true)
    cv.setUint16(12, time, true)
    cv.setUint16(14, date, true)
    cv.setUint32(16, crc, true)
    cv.setUint32(20, data.length, true)
    cv.setUint32(24, data.length, true)
    cv.setUint16(28, name.length, true)
    cv.setUint16(30, 0, true) // extra
    cv.setUint16(32, 0, true) // comment
    cv.setUint16(34, 0, true) // disk
    cv.setUint16(36, 0, true) // internal attrs
    cv.setUint32(38, 0, true) // external attrs
    cv.setUint32(42, offset, true)
    central.set(name, 46)

    locals.push(local, data)
    centrals.push(central)
    offset += local.length + data.length
  })
  const cdSize = centrals.reduce((s, c) => s + c.length, 0)
  const eocd = new Uint8Array(22)
  const ev = new DataView(eocd.buffer)
  ev.setUint32(0, SIG_EOCD, true)
  ev.setUint16(4, 0, true)
  ev.setUint16(6, 0, true)
  ev.setUint16(8, inputs.length, true)
  ev.setUint16(10, inputs.length, true)
  ev.setUint32(12, cdSize, true)
  ev.setUint32(16, offset, true)
  ev.setUint16(20, 0, true)

  const out = new Uint8Array(offset + cdSize + 22)
  let p = 0
  for (const part of [...locals, ...centrals, eocd]) {
    out.set(part, p)
    p += part.length
  }
  return out
}

const inflateRaw = async (bytes: Uint8Array): Promise<Uint8Array> => {
  if (typeof DecompressionStream === 'undefined') throw new Error('DecompressionStream unavailable')
  const ds = new DecompressionStream('deflate-raw')
  const writer = ds.writable.getWriter()
  // 写入端出错（数据损坏）时 read() 也会抛错；这里先接住写入端的 rejection，避免变成 unhandled rejection
  let writeError: unknown = null
  const writing = writer
    .write(bytes)
    .then(() => writer.close())
    .catch(err => (writeError = err || new Error('inflate failed')))
  const reader = ds.readable.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    if (value) {
      chunks.push(value)
      total += value.length
    }
  }
  await writing
  if (writeError) throw writeError
  const out = new Uint8Array(total)
  let p = 0
  chunks.forEach(c => {
    out.set(c, p)
    p += c.length
  })
  return out
}

const toBytes = (input: ArrayBuffer | Uint8Array) => (input instanceof Uint8Array ? input : new Uint8Array(input))

/** 解析 zip，返回条目列表（目录项已过滤）；不是 zip 或结构损坏时抛错 */
export const readZip = (input: ArrayBuffer | Uint8Array): ZipEntry[] => {
  const bytes = toBytes(input)
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (bytes.length < 22) throw new Error('not a zip file')
  // 从末尾往前找 EOCD（允许尾部有注释，最长 65535）
  let eocd = -1
  const min = Math.max(0, bytes.length - 22 - 65535)
  for (let i = bytes.length - 22; i >= min; i--) {
    if (view.getUint32(i, true) === SIG_EOCD) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new Error('not a zip file')
  const total = view.getUint16(eocd + 10, true)
  const cdSize = view.getUint32(eocd + 12, true)
  const cdOffset = view.getUint32(eocd + 16, true)
  if (total === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) throw new Error('zip64 not supported')
  if (cdOffset + cdSize > bytes.length) throw new Error('zip central directory out of range')

  const entries: ZipEntry[] = []
  let p = cdOffset
  for (let i = 0; i < total; i++) {
    if (p + 46 > bytes.length || view.getUint32(p, true) !== SIG_CENTRAL) throw new Error('bad central directory')
    const flags = view.getUint16(p + 8, true)
    const method = view.getUint16(p + 10, true)
    const compressedSize = view.getUint32(p + 20, true)
    const size = view.getUint32(p + 24, true)
    const nameLen = view.getUint16(p + 28, true)
    const extraLen = view.getUint16(p + 30, true)
    const commentLen = view.getUint16(p + 32, true)
    const localOffset = view.getUint32(p + 42, true)
    const nameBytes = bytes.subarray(p + 46, p + 46 + nameLen)
    const name = decoder.decode(nameBytes) // 没置 UTF-8 位的旧工具按代码页编码，这里仍按 UTF-8 尽力解码
    p += 46 + nameLen + extraLen + commentLen
    if (name.endsWith('/')) continue // 目录
    if (flags & 0x0001) throw new Error('encrypted zip not supported')
    if (compressedSize === 0xffffffff || size === 0xffffffff) throw new Error('zip64 not supported')
    entries.push({
      name,
      size,
      compressedSize,
      method,
      data: async () => {
        if (localOffset + 30 > bytes.length || view.getUint32(localOffset, true) !== SIG_LOCAL) throw new Error('bad local header: ' + name)
        const ln = view.getUint16(localOffset + 26, true)
        const le = view.getUint16(localOffset + 28, true)
        const start = localOffset + 30 + ln + le
        if (start + compressedSize > bytes.length) throw new Error('entry out of range: ' + name)
        const raw = bytes.slice(start, start + compressedSize)
        if (method === METHOD_STORE) return raw
        if (method === METHOD_DEFLATE) {
          const out = await inflateRaw(raw)
          if (out.length !== size) throw new Error('size mismatch: ' + name)
          return out
        }
        throw new Error('unsupported compression method ' + method + ': ' + name)
      }
    })
  }
  return entries
}

export const zipEntryText = async (entry: ZipEntry) => decoder.decode(await entry.data())
