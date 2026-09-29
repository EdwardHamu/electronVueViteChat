/**
 * 组态里的资源文件（目前是图片组件的图片）。
 *
 * 宿主（SPC_M 4cbe92c 起）提供 JsBridge.SaveResourceFile(fileName, base64OrDataUrl)：把文件存到运行目录
 * Resources/pic（GUID 文件名，≤ 20 MiB），并通过 WebView2 虚拟域名 https://pic.nt.local/ 提供静态访问
 * （HostResourceAccessKind.Allow，任意来源都能 fetch，导出打包时靠它把图片读回来）。
 * 布局里只保存这个 URL；没有宿主桥（纯浏览器调试 / 冒烟测试）时退回 data URL 内嵌。
 *
 * 宿主（SPC_M b75fc6e 起）另有 ListResourceFiles / DeleteResourceFile：保存组态、展示模式导入之后调用
 * cleanupUnusedResources 把布局里不再引用的 GUID 文件删掉（换图 / 删组件 / 取消编辑留下的孤儿文件），
 * 只动 <32 位 hex>.<ext> 这种宿主生成的文件名，手工放进去的文件不碰。
 */
import { callBrige } from '@/utils/callm'
import { callFnName } from '@/utils/enum'
import type { ScadaLayout } from './types'

export const RESOURCE_HOST = 'pic.nt.local'
export const RESOURCE_BASE_URL = `https://${RESOURCE_HOST}/`
/** 宿主 ResourceFileHelper.MaxFileSize */
export const RESOURCE_MAX_BYTES = 20 * 1024 * 1024
/** 没有宿主桥时以 data URL 内嵌进布局（存 localStorage），单张上限 */
export const INLINE_MAX_BYTES = 300 * 1024

/** 宿主 SaveResourceFile 的返回 Data */
export interface SavedResource {
  FileName: string
  OriginalFileName: string
  RelativePath: string
  Url: string
  Size: number
}

export const hasHostBridge = () => {
  if (typeof window === 'undefined') return false
  const w = window as any
  return !!(w.chrome && w.chrome.webview && w.chrome.webview.hostObjects)
}

export const isResourceUrl = (v: unknown): v is string => typeof v === 'string' && v.startsWith(RESOURCE_BASE_URL) && v.length > RESOURCE_BASE_URL.length
export const isDataUrl = (v: unknown): v is string => typeof v === 'string' && /^data:/i.test(v)

/** https://pic.nt.local/abc.png → abc.png */
export const resourceFileName = (url: string) => {
  const raw = url.slice(RESOURCE_BASE_URL.length).split(/[?#]/)[0]
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

export const readBlobAsDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => (typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('read failed')))
    reader.onerror = () => reject(reader.error || new Error('read failed'))
    reader.readAsDataURL(blob)
  })

const MIME_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'image/bmp': 'bmp',
  'image/x-icon': 'ico',
  'image/avif': 'avif'
}
export const extFromMime = (mime: string) => MIME_EXT[mime.toLowerCase()] || 'bin'
export const mimeFromExt = (name: string) => {
  const ext = (name.split('.').pop() || '').toLowerCase()
  const hit = Object.keys(MIME_EXT).find(k => MIME_EXT[k] === ext)
  return hit || 'application/octet-stream'
}

/** data URL → 字节 + MIME；不是 base64 data URL 时返回 null */
export const dataUrlToBytes = (dataUrl: string): { bytes: Uint8Array; mime: string } | null => {
  const m = /^data:([^;,]*)((?:;[^;,]*)*),(.*)$/is.exec(dataUrl)
  if (!m) return null
  const mime = m[1] || 'application/octet-stream'
  const isBase64 = /;base64/i.test(m[2] || '')
  try {
    if (isBase64) {
      const bin = atob(m[3])
      const bytes = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
      return { bytes, mime }
    }
    return { bytes: new TextEncoder().encode(decodeURIComponent(m[3])), mime }
  } catch {
    return null
  }
}

export const bytesToDataUrl = (bytes: Uint8Array, mime: string) => {
  let bin = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)))
  return `data:${mime};base64,${btoa(bin)}`
}

/**
 * 通过宿主保存资源，返回 https://pic.nt.local/… 地址。
 * callBrige 在 Code != 0 时已弹出错误提示并返回 null，这里统一抛错交给调用方处理。
 */
export const uploadResource = async (fileName: string, base64OrDataUrl: string): Promise<SavedResource> => {
  if (!hasHostBridge()) throw new Error('no host bridge')
  const safeName = (fileName || 'file').replace(/[\\/:*?"<>|]/g, '_').slice(-200) || 'file'
  const res = (await callBrige(callFnName.SaveResourceFile, [safeName, base64OrDataUrl], true)) as SavedResource | null | undefined
  if (!res || typeof res !== 'object' || typeof res.Url !== 'string' || !res.Url) throw new Error('save resource failed')
  return res
}

export const uploadResourceBlob = async (fileName: string, blob: Blob) => uploadResource(fileName, await readBlobAsDataUrl(blob))

/** 读取资源文件内容（导出打包用）；失败抛错 */
export const fetchResource = async (url: string): Promise<Uint8Array> => {
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) throw new Error(`fetch ${url} failed: ${res.status}`)
  return new Uint8Array(await res.arrayBuffer())
}

/** 资源是否已存在于本机（导入时同名 GUID 文件直接复用，不重复上传） */
export const resourceExists = async (url: string) => {
  if (!isResourceUrl(url) || typeof fetch === 'undefined') return false
  try {
    const res = await fetch(url, { cache: 'no-store' })
    return res.ok
  } catch {
    return false
  }
}

/**
 * 深度遍历一个 JSON 结构里的所有字符串值（对象 / 数组任意嵌套），replace 返回非 undefined 时原地替换。
 * 资源引用可能藏在组件属性的子对象里（如表格列配置），与宿主 ScadaPackageHelper 的做法一致：不限定字段名，只看值。
 */
export const walkStrings = (node: any, visit: (value: string) => string | undefined) => {
  if (Array.isArray(node)) {
    node.forEach((v, i) => {
      if (typeof v === 'string') {
        const next = visit(v)
        if (next !== undefined) node[i] = next
      } else walkStrings(v, visit)
    })
  } else if (node && typeof node === 'object') {
    Object.keys(node).forEach(k => {
      const v = node[k]
      if (typeof v === 'string') {
        const next = visit(v)
        if (next !== undefined) node[k] = next
      } else walkStrings(v, visit)
    })
  }
}

/** 遍历布局里所有资源引用（宿主 URL 或 data URL，含嵌套属性），去重、保持出现顺序 */
export const collectResourceRefs = (layout: ScadaLayout): string[] => {
  const out: string[] = []
  const seen = new Set<string>()
  walkStrings(layout.widgets, v => {
    if ((isResourceUrl(v) || isDataUrl(v)) && !seen.has(v)) {
      seen.add(v)
      out.push(v)
    }
    return undefined
  })
  return out
}

/** 按映射表替换布局里的资源引用（含嵌套属性），返回新布局（不改原对象） */
export const replaceResourceRefs = (layout: ScadaLayout, map: Record<string, string>): ScadaLayout => {
  const copy: ScadaLayout = JSON.parse(JSON.stringify(layout))
  if (!Object.keys(map).length) return copy
  walkStrings(copy.widgets, v => (Object.prototype.hasOwnProperty.call(map, v) ? map[v] : undefined))
  return copy
}

// ---------------------------------------------------------------- 宿主资源目录：列举 / 删除 / 清理孤儿文件

/** 宿主 ListResourceFiles 的返回项 */
export interface HostResourceFile {
  FileName: string
  RelativePath: string
  Url: string
  Size: number
  LastModifiedUtc: string
}

/** 宿主 SaveResourceFile 生成的文件名：32 位 hex GUID + 扩展名；清理时只认这种名字 */
export const HOST_GENERATED_NAME = /^[0-9a-f]{32}\.[a-z0-9]+$/i

/**
 * 统一处理 callBrige 的三种结果：
 *  - undefined：老宿主没有这个接口 / 调用抛错（callBrige 已提示）→ 调用方按“不支持”处理；
 *  - null：宿主返回 Code != 0（callBrige 已弹出宿主的错误信息）；
 *  - 其它：Data（Data 为 null 时 callBrige 返回 1）。
 */
export const callHost = async <T>(fn: string, args?: any[]): Promise<T | null | undefined> => {
  if (!hasHostBridge()) return undefined
  try {
    const res = args ? await callBrige(fn, args, true) : await callBrige(fn)
    return res as T | null | undefined
  } catch (err) {
    console.warn(`[scada] host call ${fn} failed`, err)
    return undefined
  }
}

/** Resources/pic 里的文件列表；宿主不支持或出错时返回 null（调用方不得据此删除任何东西） */
export const listResourceFiles = async (): Promise<HostResourceFile[] | null> => {
  const res = await callHost<HostResourceFile[] | number>(callFnName.ListResourceFiles)
  if (res === undefined || res === null) return null
  return Array.isArray(res) ? res : []
}

/** 删除 Resources/pic 里的一个文件（纯文件名）；成功（含文件本来就不存在）返回 true */
export const deleteResourceFile = async (fileName: string): Promise<boolean> => {
  if (!fileName || !HOST_GENERATED_NAME.test(fileName)) return false
  const res = await callHost<{ FileName: string; Deleted: boolean }>(callFnName.DeleteResourceFile, [fileName])
  return !!res && typeof res === 'object'
}

export interface CleanupResult {
  /** 宿主目录里的文件数（宿主不支持时为 -1） */
  total: number
  deleted: string[]
  failed: string[]
}

let cleanupChain: Promise<CleanupResult> = Promise.resolve({ total: -1, deleted: [], failed: [] })

/**
 * 删除宿主 Resources/pic 里布局不再引用的 GUID 文件。保存组态 / 展示模式导入后调用（此时 layout 就是唯一生效的布局），
 * 编辑草稿里新上传的图片在保存前不会被清（清理只在保存后跑）。串行执行、不抛错。
 */
export const cleanupUnusedResources = (layout: ScadaLayout): Promise<CleanupResult> => {
  const run = async (): Promise<CleanupResult> => {
    if (!hasHostBridge()) return { total: -1, deleted: [], failed: [] }
    const files = await listResourceFiles()
    if (!files) return { total: -1, deleted: [], failed: [] }
    const referenced = new Set<string>()
    collectResourceRefs(layout).forEach(ref => {
      if (isResourceUrl(ref)) referenced.add(resourceFileName(ref).toLowerCase())
    })
    const result: CleanupResult = { total: files.length, deleted: [], failed: [] }
    for (const f of files) {
      const name = f && typeof f.FileName === 'string' ? f.FileName : ''
      if (!HOST_GENERATED_NAME.test(name) || referenced.has(name.toLowerCase())) continue
      if (await deleteResourceFile(name)) result.deleted.push(name)
      else result.failed.push(name)
    }
    if (result.deleted.length || result.failed.length) console.info('[scada] resource cleanup', result)
    return result
  }
  cleanupChain = cleanupChain.then(run, run).catch(err => {
    console.warn('[scada] resource cleanup failed', err)
    return { total: -1, deleted: [], failed: [] }
  })
  return cleanupChain
}

/** 触发浏览器下载（WebView2 走默认下载流程，文件落在系统下载目录） */
export const downloadBlob = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Chromium / WebView2 在 click 时就已把 blob 交给下载流程，稍后释放即可
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
