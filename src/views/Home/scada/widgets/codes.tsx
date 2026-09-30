/**
 * 「其他」分类：二维码 / 条形码。内容来自「内容模板」（属性 content）：{value} {text} {name} {unit} {time} {status} {raw}
 * 用绑定的数据点替换（未绑定时占位符为空），其余文字原样保留——所以既能编码固定网址 / 编号，也能把当前测量值编进去。
 * 编码器在 ../codes/（qrcode.ts / barcode.ts，无依赖），这里只负责把模块矩阵画成 SVG：二维码保持正方形居中，
 * 条形码横向铺满（preserveAspectRatio=none，所有条等比拉伸），文字在 SVG 外面单独渲染避免变形。
 */
import { computed, defineComponent } from 'vue'
import { encodeBarcode, type BarcodeFormat, barcodeToPath } from '../codes/barcode'
import { encodeQr, qrToPath, type QrEcc } from '../codes/qrcode'
import type { DataPoint, PropField, WidgetDefinition } from '../types'
import { icons } from './icons'
import { pointText, tt, widgetProps } from './common'

const fmtTime = (t: number) => {
  const d = new Date(t)
  const z = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())} ${z(d.getHours())}:${z(d.getMinutes())}:${z(d.getSeconds())}`
}

/** 内容模板替换；未绑定 / 无值时对应占位符为空串 */
export const resolveTemplate = (tpl: string, point: DataPoint | undefined, decimals?: number | null): string =>
  String(tpl ?? '').replace(/\{(value|text|name|unit|time|status|raw)\}/g, (_m, k: string) => {
    if (!point) return ''
    const hasValue = point.value !== null && point.value !== undefined && !Number.isNaN(point.value)
    switch (k) {
      case 'value':
        return hasValue ? pointText(point, decimals) : ''
      case 'raw':
        return hasValue ? String(point.value) : ''
      case 'text':
        return point.text ?? (hasValue ? pointText(point, decimals) : '')
      case 'name':
        return point.name || ''
      case 'unit':
        return point.unit || ''
      case 'time':
        return point.time ? fmtTime(point.time) : ''
      case 'status':
        return point.status || ''
    }
    return ''
  })

/** 文案里的 {value} {name} … 是模板占位符的字面量，vue-i18n 会把 {x} 当命名参数，所以原样传回去 */
const TPL_LITERALS = Object.fromEntries(['value', 'text', 'name', 'unit', 'time', 'status', 'raw'].map(k => [k, `{${k}}`]))

const decimalsOf = (v: unknown) => (typeof v === 'number' && v >= 0 ? v : null)
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

const emptyHint = (editing: boolean) => tt(editing ? 'scada.widget.codeEmptyEdit' : 'scada.widget.codeEmpty')

// ---------- 二维码 ----------
const QrWidget = defineComponent({
  name: 'ScadaQrCode',
  props: widgetProps,
  setup(props) {
    const p = computed(() => props.widget.props)
    const content = computed(() => resolveTemplate(String(p.value.content ?? ''), props.point, decimalsOf(p.value.decimals)))
    const qr = computed(() => {
      if (!content.value) return null
      const ecc = (['L', 'M', 'Q', 'H'].includes(p.value.ecc) ? p.value.ecc : 'M') as QrEcc
      return encodeQr(content.value, { ecc })
    })
    const path = computed(() => (qr.value ? qrToPath(qr.value) : ''))
    return () => {
      const pv = p.value
      const quiet = clamp(Number(pv.quiet) || 0, 0, 10)
      const fg = pv.fg || '#000000'
      const bg = pv.bg || '#ffffff'
      const q = qr.value
      const captionSize = clamp(Number(pv.captionSize) || 12, 8, 40)
      return (
        <div
          class={'w-full h-full flex flex-col items-center justify-center overflow-hidden'}
          style={{ background: bg, borderRadius: (Number(pv.radius) || 0) + 'px' }}
          data-scada-qr
          data-qr-content={content.value}
          data-qr-version={q ? q.version : ''}
          data-qr-mask={q ? q.mask : ''}
        >
          {q ? (
            <svg class={'block w-full flex-1 min-h-0'} viewBox={`${-quiet} ${-quiet} ${q.size + quiet * 2} ${q.size + quiet * 2}`} preserveAspectRatio="xMidYMid meet" shape-rendering="crispEdges">
              <rect x={-quiet} y={-quiet} width={q.size + quiet * 2} height={q.size + quiet * 2} fill={bg} />
              <path d={path.value} fill={fg} data-qr-path />
            </svg>
          ) : (
            <div class={'text-xs text-gray-400 text-center px-2 leading-5'}>{content.value ? tt('scada.widget.qrTooLong') : emptyHint(props.editing)}</div>
          )}
          {pv.caption && q ? (
            <div class={'shrink-0 w-full text-center truncate px-1'} style={{ fontSize: captionSize + 'px', lineHeight: 1.3, color: fg }} data-qr-caption>
              {content.value}
            </div>
          ) : null}
        </div>
      )
    }
  }
})

// ---------- 条形码 ----------
const BARCODE_FORMATS: { value: BarcodeFormat; label: string }[] = [
  { value: 'code128', label: 'Code 128' },
  { value: 'ean13', label: 'EAN-13 / UPC-A' },
  { value: 'ean8', label: 'EAN-8' }
]
/** 静区宽度（模块）：左 / 右 */
const QUIET_ZONE: Record<BarcodeFormat, [number, number]> = { code128: [10, 10], ean13: [11, 7], ean8: [7, 7] }

const BarcodeWidget = defineComponent({
  name: 'ScadaBarcode',
  props: widgetProps,
  setup(props) {
    const p = computed(() => props.widget.props)
    const format = computed<BarcodeFormat>(() => (BARCODE_FORMATS.some(f => f.value === p.value.format) ? p.value.format : 'code128'))
    const content = computed(() => resolveTemplate(String(p.value.content ?? ''), props.point, decimalsOf(p.value.decimals)))
    const code = computed(() => (content.value ? encodeBarcode(content.value, format.value) : null))
    return () => {
      const pv = p.value
      const fg = pv.fg || '#000000'
      const bg = pv.bg || '#ffffff'
      const c = code.value
      const [ql, qr] = pv.quiet === false ? [0, 0] : QUIET_ZONE[format.value]
      const textSize = clamp(Number(pv.textSize) || 14, 8, 60)
      const total = c ? c.modules.length + ql + qr : 0
      const formatLabel = (BARCODE_FORMATS.find(f => f.value === format.value) || BARCODE_FORMATS[0]).label
      return (
        <div
          class={'w-full h-full flex flex-col overflow-hidden'}
          style={{ background: bg, borderRadius: (Number(pv.radius) || 0) + 'px' }}
          data-scada-barcode
          data-barcode-format={format.value}
          data-barcode-text={c ? c.text : ''}
        >
          {c ? (
            <svg class={'block w-full flex-1 min-h-0'} viewBox={`0 0 ${total} 100`} preserveAspectRatio="none" shape-rendering="crispEdges">
              <rect x="0" y="0" width={total} height="100" fill={bg} />
              <path d={barcodeToPath(c.modules, 100)} transform={`translate(${ql} 0)`} fill={fg} data-barcode-path />
            </svg>
          ) : (
            <div class={'flex-1 min-h-0 flex items-center justify-center text-xs text-gray-400 text-center px-2 leading-5'}>
              {content.value ? tt('scada.widget.barcodeInvalid', { format: formatLabel }) : emptyHint(props.editing)}
            </div>
          )}
          {pv.showText !== false && c ? (
            <div class={'shrink-0 w-full text-center truncate px-1 font-mono'} style={{ fontSize: textSize + 'px', lineHeight: 1.25, color: fg, letterSpacing: '0.08em' }} data-barcode-caption>
              {c.text}
            </div>
          ) : null}
        </div>
      )
    }
  }
})

// ---------- 定义 ----------
const contentField = (): PropField => ({ key: 'content', label: () => tt('scada.prop.content'), type: 'text', placeholder: () => tt('scada.prop.contentPlaceholder', TPL_LITERALS) })
const decimalsField = (): PropField => ({ key: 'decimals', label: () => tt('scada.prop.decimals'), type: 'number', min: 0, max: 8, step: 1, placeholder: 'auto' })

export const qrCodeDefinition: WidgetDefinition = {
  type: 'qrCode',
  label: () => tt('scada.widget.qrCode'),
  description: () => tt('scada.widget.qrCodeDesc', TPL_LITERALS),
  icon: icons.qrCode,
  category: 'other',
  defaultSize: { w: 160, h: 160 },
  minSize: { w: 40, h: 40 },
  needsBinding: false,
  defaultProps: () => ({ content: '{value}', ecc: 'M', fg: '#000000', bg: '#ffffff', quiet: 2, caption: false, captionSize: 12, radius: 0 }),
  propSchema: [
    contentField(),
    decimalsField(),
    { key: 'ecc', label: () => tt('scada.prop.ecc'), type: 'select', options: () => [{ label: 'L · 7%', value: 'L' }, { label: 'M · 15%', value: 'M' }, { label: 'Q · 25%', value: 'Q' }, { label: 'H · 30%', value: 'H' }] },
    { key: 'fg', label: () => tt('scada.prop.fg'), type: 'color' },
    { key: 'bg', label: () => tt('scada.prop.bg'), type: 'color' },
    { key: 'quiet', label: () => tt('scada.prop.quietZone'), type: 'number', min: 0, max: 10, step: 1 },
    { key: 'caption', label: () => tt('scada.prop.caption'), type: 'boolean' },
    { key: 'captionSize', label: () => tt('scada.prop.fontSize'), type: 'number', min: 8, max: 40, step: 1 },
    { key: 'radius', label: () => tt('scada.prop.radius'), type: 'number', min: 0, max: 100, step: 1 }
  ],
  component: QrWidget
}

export const barcodeDefinition: WidgetDefinition = {
  type: 'barcode',
  label: () => tt('scada.widget.barcode'),
  description: () => tt('scada.widget.barcodeDesc'),
  icon: icons.barcode,
  category: 'other',
  defaultSize: { w: 240, h: 100 },
  minSize: { w: 60, h: 30 },
  needsBinding: false,
  defaultProps: () => ({ content: '{value}', format: 'code128', fg: '#000000', bg: '#ffffff', showText: true, textSize: 14, quiet: true, radius: 0 }),
  propSchema: [
    contentField(),
    decimalsField(),
    { key: 'format', label: () => tt('scada.prop.format'), type: 'select', options: () => BARCODE_FORMATS.map(f => ({ label: f.label, value: f.value })) },
    { key: 'fg', label: () => tt('scada.prop.fg'), type: 'color' },
    { key: 'bg', label: () => tt('scada.prop.bg'), type: 'color' },
    { key: 'showText', label: () => tt('scada.prop.showText'), type: 'boolean' },
    { key: 'textSize', label: () => tt('scada.prop.fontSize'), type: 'number', min: 8, max: 60, step: 1 },
    { key: 'quiet', label: () => tt('scada.prop.quietZone'), type: 'boolean' },
    { key: 'radius', label: () => tt('scada.prop.radius'), type: 'number', min: 0, max: 100, step: 1 }
  ],
  component: BarcodeWidget
}

export const codeDefinitions = [qrCodeDefinition, barcodeDefinition]
