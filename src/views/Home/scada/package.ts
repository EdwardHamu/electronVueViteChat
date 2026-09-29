/**
 * 组态包：把布局和它引用的资源文件打成一个 zip（导出），或从 zip / JSON 还原布局（导入）。
 *
 * 包结构：
 *   manifest.json   { format, version, exportedAt, widgets, resources: [{ file, url }] }
 *   layout.json     布局（与 localStorage 里保存的结构一致）
 *   resources/…     图片等资源文件
 *
 * 资源引用的处理：
 *   - 宿主 URL（https://pic.nt.local/<guid>.png）：文件按原名放进 resources/，layout.json 保持原 URL；
 *     导入时若本机已有同名文件（同一台机器重新导入）直接复用，否则上传后把 URL 换成新地址。
 *   - data URL（旧版本 / 无宿主时内嵌的图片）：抽成 resources/inline-N.ext，layout.json 里换成 pkg:resources/inline-N.ext 占位；
 *     导入时上传并替换成宿主 URL（没有宿主桥时再内嵌回 data URL）。
 *
 * 有宿主时（SPC_M 91ebedd 起）打包 / 解包由宿主完成（文件末尾的 exportPackageViaHost / previewPackageViaHost / importPackageViaHost）：
 * 宿主弹「另存为 / 打开」对话框，直接读写 Resources/pic，包结构相同（宿主把 data URL 抽成 GUID 文件、导入时兼容 pkg: 占位）。
 * 前端这套 zip 实现留给纯浏览器调试 / 老宿主用。
 * 纯逻辑，不碰 store / UI，方便测试。
 */
import { LAYOUT_VERSION, normalizeLayout } from './layout'
import { callFnName } from '@/utils/enum'
import {
  bytesToDataUrl,
  callHost,
  collectResourceRefs,
  dataUrlToBytes,
  extFromMime,
  fetchResource,
  hasHostBridge,
  isDataUrl,
  isResourceUrl,
  mimeFromExt,
  replaceResourceRefs,
  resourceExists,
  resourceFileName,
  uploadResourceBlob
} from './resource'
import type { ScadaLayout } from './types'
import { createZip, readZip, zipEntryText, type ZipEntry, type ZipInput } from './zip'

export const PACKAGE_FORMAT = 'scada-layout-package'
export const PACKAGE_VERSION = 1
export const LAYOUT_FILE = 'layout.json'
export const MANIFEST_FILE = 'manifest.json'
export const RESOURCE_DIR = 'resources/'
/** layout.json 里指向包内文件的占位引用前缀 */
export const PACKAGE_REF_PREFIX = 'pkg:'

export interface PackageResource {
  /** 包内路径，如 resources/abc.png */
  file: string
  /** 布局里的引用值：宿主 URL 或 pkg:resources/… 占位 */
  url: string
}

export interface PackageManifest {
  format: string
  version: number
  exportedAt: string
  widgets: number
  canvas: { width: number; height: number }
  resources: PackageResource[]
}

export interface ExportResult {
  blob: Blob
  bytes: Uint8Array
  fileName: string
  manifest: PackageManifest
  /** 读取失败、没有进包的资源引用 */
  missing: string[]
}

const pad2 = (n: number) => (n < 10 ? '0' + n : String(n))
export const packageFileName = (d = new Date()) =>
  `scada-layout-${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}-${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}.zip`

const sanitizeZipName = (name: string) => name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim() || 'file'

/** 打包：读取布局引用的所有资源，生成 zip */
export const buildPackage = async (layout: ScadaLayout, opts: { fetch?: (url: string) => Promise<Uint8Array>; now?: Date } = {}): Promise<ExportResult> => {
  const now = opts.now || new Date()
  const load = opts.fetch || fetchResource
  const refs = collectResourceRefs(layout)
  const files: ZipInput[] = []
  const resources: PackageResource[] = []
  const missing: string[] = []
  const map: Record<string, string> = {}
  const used = new Set<string>()
  let inlineSeq = 0
  const uniqueName = (base: string) => {
    let name = base
    let i = 1
    while (used.has(name.toLowerCase())) {
      const dot = base.lastIndexOf('.')
      name = dot > 0 ? `${base.slice(0, dot)}-${i}${base.slice(dot)}` : `${base}-${i}`
      i++
    }
    used.add(name.toLowerCase())
    return name
  }
  for (const ref of refs) {
    if (isDataUrl(ref)) {
      const parsed = dataUrlToBytes(ref)
      if (!parsed) {
        missing.push(ref.slice(0, 40) + '…')
        continue
      }
      const name = uniqueName(`inline-${++inlineSeq}.${extFromMime(parsed.mime)}`)
      const file = RESOURCE_DIR + name
      const pkgRef = PACKAGE_REF_PREFIX + file
      files.push({ name: file, data: parsed.bytes })
      resources.push({ file, url: pkgRef })
      map[ref] = pkgRef
    } else if (isResourceUrl(ref)) {
      try {
        const bytes = await load(ref)
        const name = uniqueName(sanitizeZipName(resourceFileName(ref) || `res-${files.length + 1}.bin`))
        const file = RESOURCE_DIR + name
        files.push({ name: file, data: bytes })
        resources.push({ file, url: ref })
      } catch (err) {
        console.warn('[scada] export: read resource failed', ref, err)
        missing.push(ref)
      }
    }
  }
  const exported = replaceResourceRefs(layout, map)
  const manifest: PackageManifest = {
    format: PACKAGE_FORMAT,
    version: PACKAGE_VERSION,
    exportedAt: now.toISOString(),
    widgets: exported.widgets.length,
    canvas: { width: exported.canvas.width, height: exported.canvas.height },
    resources
  }
  const enc = new TextEncoder()
  const bytes = createZip(
    [
      { name: MANIFEST_FILE, data: enc.encode(JSON.stringify(manifest, null, 2)) },
      { name: LAYOUT_FILE, data: enc.encode(JSON.stringify(exported, null, 2)) },
      ...files
    ],
    now
  )
  return { blob: new Blob([bytes], { type: 'application/zip' }), bytes, fileName: packageFileName(now), manifest, missing }
}

export interface ParsedPackage {
  kind: 'zip' | 'json'
  layout: ScadaLayout
  manifest: PackageManifest | null
  resources: PackageResource[]
  entries: Map<string, ZipEntry>
}

const normalizeEntryName = (name: string) => name.replace(/^\.?\//, '')

const parseLayoutText = (text: string): ScadaLayout => {
  let raw: any
  try {
    raw = JSON.parse(text)
  } catch {
    throw new Error('invalid-json')
  }
  // 兼容直接把整个包的 layout.json / 旧的 exportLayoutText 文本导入；
  // normalizeLayout 对缺字段很宽容（会补默认值），这里至少要求是带 widgets 数组的对象，免得随便一个 JSON 都被当成空布局导入
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !Array.isArray(raw.widgets)) throw new Error('invalid-layout')
  const layout = normalizeLayout(raw)
  if (!layout) throw new Error('invalid-layout')
  return layout
}

/** 解析 zip（或纯 JSON 文本）为布局 + 资源清单；格式不对时抛 Error('invalid-*') */
export const parsePackage = async (input: ArrayBuffer | Uint8Array | string): Promise<ParsedPackage> => {
  if (typeof input === 'string') return { kind: 'json', layout: parseLayoutText(input), manifest: null, resources: [], entries: new Map() }
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input)
  const isZip = bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b
  if (!isZip) return { kind: 'json', layout: parseLayoutText(new TextDecoder().decode(bytes)), manifest: null, resources: [], entries: new Map() }

  let list: ZipEntry[]
  try {
    list = readZip(bytes)
  } catch (err) {
    console.warn('[scada] import: bad zip', err)
    throw new Error('invalid-zip')
  }
  const entries = new Map<string, ZipEntry>()
  list.forEach(e => entries.set(normalizeEntryName(e.name), e))
  let layoutEntry = entries.get(LAYOUT_FILE)
  if (!layoutEntry) {
    // 允许包里只有一个别名的 json（不含 manifest）
    const jsons = [...entries.keys()].filter(n => n.toLowerCase().endsWith('.json') && n !== MANIFEST_FILE)
    if (jsons.length === 1) layoutEntry = entries.get(jsons[0])
  }
  if (!layoutEntry) throw new Error('invalid-package')
  const layout = parseLayoutText(await zipEntryText(layoutEntry))

  let manifest: PackageManifest | null = null
  const manifestEntry = entries.get(MANIFEST_FILE)
  if (manifestEntry) {
    try {
      const m = JSON.parse(await zipEntryText(manifestEntry))
      if (m && typeof m === 'object' && Array.isArray(m.resources)) manifest = m as PackageManifest
    } catch (err) {
      console.warn('[scada] import: bad manifest, ignored', err)
    }
  }
  let resources: PackageResource[] = manifest
    ? manifest.resources.filter(r => r && typeof r.file === 'string' && typeof r.url === 'string').map(r => ({ file: normalizeEntryName(r.file), url: r.url }))
    : []
  if (!manifest) {
    // 没有清单：按布局里的宿主 URL 到 resources/ 下找同名文件
    resources = collectResourceRefs(layout)
      .filter(isResourceUrl)
      .map(url => ({ file: RESOURCE_DIR + resourceFileName(url), url }))
      .filter(r => entries.has(r.file))
  }
  return { kind: 'zip', layout, manifest, resources, entries }
}

export interface ImportPlan {
  /** 本机已有同名资源，直接复用 */
  reusable: PackageResource[]
  /** 需要上传（或内嵌）的资源 */
  toUpload: PackageResource[]
  /** 清单里有、包里却没有的文件 */
  missing: PackageResource[]
}

/** 导入前的清点：哪些资源可复用、哪些要上传、哪些缺失 */
export const planImport = async (pkg: ParsedPackage, exists: (url: string) => Promise<boolean> = resourceExists): Promise<ImportPlan> => {
  const plan: ImportPlan = { reusable: [], toUpload: [], missing: [] }
  for (const r of pkg.resources) {
    if (!pkg.entries.has(r.file)) plan.missing.push(r)
    else if (isResourceUrl(r.url) && (await exists(r.url))) plan.reusable.push(r)
    else plan.toUpload.push(r)
  }
  return plan
}

export interface ImportResult {
  layout: ScadaLayout
  uploaded: number
  reused: number
  /** 没有宿主桥时以 data URL 内嵌的数量 */
  inlined: number
  failed: PackageResource[]
}

export interface ApplyOptions {
  /** 上传实现（默认走宿主 SaveResourceFile）；返回新 URL */
  upload?: (fileName: string, blob: Blob, bytes: Uint8Array) => Promise<string>
  /** 是否有宿主桥；没有时内嵌 data URL */
  bridge?: boolean
  onProgress?: (done: number, total: number) => void
}

/** 执行导入：上传 / 复用 / 内嵌资源，返回引用已替换的布局 */
export const applyPackage = async (pkg: ParsedPackage, plan: ImportPlan, opts: ApplyOptions = {}): Promise<ImportResult> => {
  const bridge = opts.bridge === undefined ? hasHostBridge() : opts.bridge
  const upload = opts.upload || ((fileName: string, blob: Blob) => uploadResourceBlob(fileName, blob).then(r => r.Url))
  const map: Record<string, string> = {}
  const failed: PackageResource[] = []
  let uploaded = 0
  let inlined = 0
  const total = plan.toUpload.length
  let done = 0
  for (const r of plan.toUpload) {
    const entry = pkg.entries.get(r.file)
    try {
      if (!entry) throw new Error('missing entry')
      const bytes = await entry.data()
      const fileName = r.file.split('/').pop() || 'file'
      const mime = mimeFromExt(fileName)
      if (bridge) {
        map[r.url] = await upload(fileName, new Blob([bytes], { type: mime }), bytes)
        uploaded++
      } else {
        map[r.url] = bytesToDataUrl(bytes, mime)
        inlined++
      }
    } catch (err) {
      console.warn('[scada] import: resource failed', r, err)
      failed.push(r)
      // 包内占位引用没法用了，清空让图片显示占位；宿主 URL 保留原值（也许稍后可用）
      if (r.url.startsWith(PACKAGE_REF_PREFIX)) map[r.url] = ''
    }
    done++
    opts.onProgress && opts.onProgress(done, total)
  }
  plan.missing.forEach(r => {
    if (r.url.startsWith(PACKAGE_REF_PREFIX)) map[r.url] = ''
  })
  const layout = replaceResourceRefs(pkg.layout, map)
  layout.version = LAYOUT_VERSION
  layout.updatedAt = Date.now()
  return { layout, uploaded, reused: plan.reusable.length, inlined, failed: [...failed, ...plan.missing] }
}

// ---------------------------------------------------------------- 宿主打包（JsBridge.ExportScadaPackage / PreviewScadaPackage / ImportScadaPackage）

/** ExportScadaPackage 的 Data */
export interface HostExportResult {
  /** 用户在「另存为」里点了取消 */
  Cancelled: boolean
  Path?: string
  FileName?: string
  Size?: number
  Widgets?: number
  /** 打进包里的资源数 */
  Resources?: number
  /** 布局引用、但本机 Resources/pic 里没有的地址 */
  Missing?: string[]
}

export interface HostPackageFile {
  File: string
  Url: string
  Size: number
  InPackage: boolean
  Exists: boolean
}

/** PreviewScadaPackage 的 Data：只清点、宿主还没写任何文件 */
export interface HostPackagePreview {
  Cancelled: boolean
  Path?: string
  FileName?: string
  Size?: number
  Widgets?: number
  Canvas?: { Width: number; Height: number }
  /** 布局里引用的资源数（去重） */
  Resources?: number
  /** 包里有、本机没有 → 导入时解压 */
  ToCopy?: number
  /** 本机已有同名文件 → 直接复用 */
  Reusable?: number
  /** 包里没有、本机也没有 */
  Missing?: string[]
  Files?: HostPackageFile[]
}

/** ImportScadaPackage 的 Data */
export interface HostImportResult {
  Path: string
  FileName: string
  /** 资源引用在本机已可用的布局（结构同 layout.json，仍需 normalizeLayout） */
  Layout: any
  Widgets: number
  Copied: number
  Reused: number
  Missing: string[]
  Failed: string[]
}

/**
 * 三个宿主调用的返回约定同 callHost：
 *  undefined = 老宿主没有该接口（调用方退回前端 zip 实现）；null = 宿主返回失败（已弹提示）；否则为 Data。
 */
export const exportPackageViaHost = (layout: ScadaLayout, targetPath = '') =>
  callHost<HostExportResult>(callFnName.ExportScadaPackage, [JSON.stringify(layout), targetPath])

export const previewPackageViaHost = (packagePath = '') => callHost<HostPackagePreview>(callFnName.PreviewScadaPackage, [packagePath])

export const importPackageViaHost = (packagePath: string) => callHost<HostImportResult>(callFnName.ImportScadaPackage, [packagePath])

/** 把宿主 ImportScadaPackage 返回的 Layout 规范成前端布局；不像布局时抛 Error('invalid-layout') */
export const layoutFromHostImport = (result: HostImportResult): ScadaLayout => {
  const raw = result && result.Layout
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !Array.isArray(raw.widgets)) throw new Error('invalid-layout')
  const layout = normalizeLayout(raw)
  if (!layout) throw new Error('invalid-layout')
  layout.version = LAYOUT_VERSION
  layout.updatedAt = Date.now()
  return layout
}
