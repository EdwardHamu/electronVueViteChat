/**
 * 属性面板的颜色字段：一行「标签 + 当前色块」，点击后在色块上方弹出浮动面板（Teleport 到 body 的 fixed 浮层，不挤占属性面板的布局）。
 *  - 向上弹出：面板底边贴在色块上边缘之上，面板高度不够时向上长；头顶放不下（< 220px）而下方明显更宽裕时才翻到下方；
 *    水平方向以色块中心为基准，夹在窗口内（右侧属性栏贴着窗口边时自动左移），小箭头始终指向色块；
 *    属性面板滚动 / 窗口缩放时面板跟着色块重新定位。
 *  - 第一界面是「预设颜色」网格：点色块直接选色；「＋ 加入预设」把当前颜色存进去；「管理」进入删除模式，可「恢复默认」。
 *    预设表所有颜色字段共用并持久化（colorPresets.ts，localStorage）。
 *  - 点「调色盘」切换到 HSV 调色盘：饱和度 / 明度面板 + 色相条 + hex 输入，同样可以把当前颜色加入预设。
 *  - clearable 时提供「清除」（写回空字符串 = 使用组件默认色）。
 *  - 自动收起：同一时间只展开一个颜色字段（打开另一个时旧的收起）；点按 / 焦点落到面板和色块之外的任何地方、按 Esc、点面板右上角 ✕ 都会收起
 *    （浮层和行内面板不同，点外面就该关）。面板内部（含 hex 输入框）的操作不收起。
 */
import { NButton, NInput } from 'naive-ui'
import { computed, defineComponent, onBeforeUnmount, reactive, ref, Teleport, watch, type PropType } from 'vue'
import { clamp01, hexToHsv, hsvToHex, isLightColor, normalizeHex } from './color'
import { addColorPreset, COLOR_PRESETS_MAX, removeColorPreset, resetColorPresets, useColorPresets } from './colorPresets'
import { tt } from './widgets/common'

type View = 'presets' | 'palette'

/** 空值（使用默认色）时色块显示棋盘格 */
const EMPTY_BG = 'repeating-conic-gradient(#e5e7eb 0 25%, #ffffff 0 50%) 0 0 / 8px 8px'
const HUE_BG = 'linear-gradient(to right, #f00 0%, #ff0 16.7%, #0f0 33.3%, #0ff 50%, #00f 66.7%, #f0f 83.3%, #f00 100%)'

/** 当前展开的颜色字段实例 id（模块级：所有 ColorField 共用，保证同时只展开一个） */
let fieldSeq = 0
export const activeColorField = ref<number | null>(null)
/** 浮动面板的宽度、与窗口边缘 / 色块的间距，头顶至少要有这么多空间才向上弹（否则翻到下方） */
const POPUP_W = 272
const POPUP_MARGIN = 8
const POPUP_GAP = 8
const MIN_SPACE_ABOVE = 220

export default defineComponent({
  name: 'ScadaColorField',
  props: {
    label: { type: String, default: '' },
    value: { type: String, default: '' },
    /** 允许清空（空字符串 = 组件默认色） */
    clearable: { type: Boolean, default: false },
    onUpdateValue: { type: Function as PropType<(v: string) => void>, required: true }
  },
  setup(props) {
    const presets = useColorPresets()
    const id = ++fieldSeq
    /** 整行（标签 + 色块按钮）；浮动面板在 body 里，不在它里面 */
    const rootRef = ref<HTMLElement>()
    const triggerRef = ref<HTMLElement>()
    const popupRef = ref<HTMLElement>()
    const open = ref(false)
    /** 浮动面板的定位：placement = top 时 edge 是面板底边到窗口底边的距离，bottom 时 edge 是面板顶边到窗口顶边的距离 */
    const pos = reactive({ left: 0, width: POPUP_W, edge: 0, maxHeight: 360, placement: 'top' as 'top' | 'bottom', arrow: 24 })
    const view = ref<View>('presets')
    const manage = ref(false)
    const svRef = ref<HTMLElement>()
    const hueRef = ref<HTMLElement>()
    /** 调色盘状态：单独保存色相，灰色（s = 0）时 hex 里没有色相信息，不能每次都从 value 反推 */
    const hsv = reactive({ h: 210, s: 0, v: 1 })
    const hexDraft = ref('')
    /** hex 输入框聚焦期间不用外部值覆盖草稿，否则输入到一半会被归一化后的值打断 */
    const hexFocused = ref(false)

    const current = computed(() => normalizeHex(props.value))
    const paletteHex = computed(() => hsvToHex(hsv))

    const syncFromValue = () => {
      const n = current.value
      if (!hexFocused.value) hexDraft.value = n || props.value || ''
      if (!n || n === paletteHex.value) return
      const p = hexToHsv(n)
      if (!p) return
      // 纯灰 / 纯黑 / 纯白没有色相，保留用户在色相条上选的值
      if (p.s > 0 && p.v > 0) hsv.h = p.h
      hsv.s = p.s
      hsv.v = p.v
    }
    watch(() => props.value, syncFromValue, { immediate: true })

    const emit = (v: string) => props.onUpdateValue(v)
    const close = () => {
      if (!open.value) return
      open.value = false
      // 面板连同 hex 输入框一起被卸载时浏览器不会补发 blur，这里手动复位
      hexFocused.value = false
      if (activeColorField.value === id) activeColorField.value = null
    }
    /** 按色块当前的屏幕位置重新计算浮动面板的位置（打开时、滚动 / 缩放窗口时调用） */
    const place = () => {
      const t = triggerRef.value
      if (!t || typeof window === 'undefined') return
      const r = t.getBoundingClientRect()
      const vw = window.innerWidth || document.documentElement.clientWidth || 0
      const vh = window.innerHeight || document.documentElement.clientHeight || 0
      const width = Math.min(POPUP_W, Math.max(160, vw - POPUP_MARGIN * 2))
      const cx = r.left + r.width / 2
      const left = Math.max(POPUP_MARGIN, Math.min(cx - width / 2, vw - width - POPUP_MARGIN))
      const above = r.top - POPUP_GAP - POPUP_MARGIN
      const below = vh - r.bottom - POPUP_GAP - POPUP_MARGIN
      const flip = above < MIN_SPACE_ABOVE && below > above
      pos.placement = flip ? 'bottom' : 'top'
      pos.edge = flip ? r.bottom + POPUP_GAP : vh - r.top + POPUP_GAP
      pos.maxHeight = Math.max(120, flip ? below : above)
      pos.left = left
      pos.width = width
      pos.arrow = Math.max(14, Math.min(cx - left, width - 14))
    }
    const toggle = () => {
      if (open.value) {
        close()
        return
      }
      place()
      open.value = true
      // 记为当前展开的字段：别的颜色字段会因此收起
      activeColorField.value = id
      // 每次打开都回到预设表
      view.value = 'presets'
      manage.value = false
      syncFromValue()
    }
    // 别的颜色字段展开了 → 自己收起
    watch(activeColorField, v => {
      if (v !== id) close()
    })

    // ---------------------------------------------------------------- 点按 / 焦点落到面板和色块之外、Esc 时收起；滚动 / 缩放窗口时跟随色块
    const isInside = (t: EventTarget | null) =>
      !!(t && t instanceof Node && ((rootRef.value && rootRef.value.contains(t)) || (popupRef.value && popupRef.value.contains(t))))
    const onDocFocusIn = (e: FocusEvent) => {
      if (!isInside(e.target)) close()
    }
    const onDocPointerDown = (e: PointerEvent) => {
      if (!isInside(e.target)) close()
    }
    const onDocKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    const onReposition = () => place()
    const attach = () => {
      if (typeof document === 'undefined') return
      document.addEventListener('focusin', onDocFocusIn, true)
      document.addEventListener('pointerdown', onDocPointerDown, true)
      document.addEventListener('keydown', onDocKeyDown, true)
      window.addEventListener('resize', onReposition)
      // 属性面板（NScrollbar 内部容器）滚动不冒泡，要在捕获阶段监听
      window.addEventListener('scroll', onReposition, true)
    }
    const detach = () => {
      if (typeof document === 'undefined') return
      document.removeEventListener('focusin', onDocFocusIn, true)
      document.removeEventListener('pointerdown', onDocPointerDown, true)
      document.removeEventListener('keydown', onDocKeyDown, true)
      window.removeEventListener('resize', onReposition)
      window.removeEventListener('scroll', onReposition, true)
    }
    watch(open, v => (v ? attach() : detach()))
    onBeforeUnmount(() => {
      detach()
      if (activeColorField.value === id) activeColorField.value = null
    })
    const pick = (hex: string) => emit(hex)
    const canAdd = computed(() => !!current.value && !presets.colors.includes(current.value!) && presets.colors.length < COLOR_PRESETS_MAX)
    const addCurrent = () => {
      if (current.value) addColorPreset(current.value)
    }

    // ---------------------------------------------------------------- 调色盘拖动
    const capture = (el: HTMLElement | undefined, id: number) => {
      try {
        el?.setPointerCapture?.(id)
      } catch {
        /* ignore */
      }
    }
    const release = (el: HTMLElement | undefined, id: number) => {
      try {
        if (el && el.releasePointerCapture && (!el.hasPointerCapture || el.hasPointerCapture(id))) el.releasePointerCapture(id)
      } catch {
        /* ignore */
      }
    }
    /** 把指针位置换算成面板内 0 ~ 1 的比例 */
    const fraction = (el: HTMLElement | undefined, e: PointerEvent) => {
      if (!el) return null
      const r = el.getBoundingClientRect()
      if (!r.width || !r.height) return null
      return { fx: clamp01((e.clientX - r.left) / r.width), fy: clamp01((e.clientY - r.top) / r.height) }
    }
    const applyPalette = () => emit(paletteHex.value)
    let svPointer: number | null = null
    let huePointer: number | null = null
    const setSvFrom = (e: PointerEvent) => {
      const f = fraction(svRef.value, e)
      if (!f) return
      hsv.s = f.fx
      hsv.v = 1 - f.fy
      applyPalette()
    }
    const setHueFrom = (e: PointerEvent) => {
      const f = fraction(hueRef.value, e)
      if (!f) return
      hsv.h = Math.round(f.fx * 360) % 360
      applyPalette()
    }
    const onSvDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      e.preventDefault()
      svPointer = e.pointerId
      capture(svRef.value, e.pointerId)
      setSvFrom(e)
    }
    const onSvMove = (e: PointerEvent) => {
      if (svPointer === e.pointerId) setSvFrom(e)
    }
    const onSvUp = (e: PointerEvent) => {
      if (svPointer !== e.pointerId) return
      svPointer = null
      release(svRef.value, e.pointerId)
    }
    const onHueDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      e.preventDefault()
      huePointer = e.pointerId
      capture(hueRef.value, e.pointerId)
      setHueFrom(e)
    }
    const onHueMove = (e: PointerEvent) => {
      if (huePointer === e.pointerId) setHueFrom(e)
    }
    const onHueUp = (e: PointerEvent) => {
      if (huePointer !== e.pointerId) return
      huePointer = null
      release(hueRef.value, e.pointerId)
    }
    /** hex 输入：输满 6 位立即生效；失焦时 3 位简写也接受，非法则恢复为当前值 */
    const onHexInput = (v: string) => {
      hexDraft.value = v
      if (v.trim().replace(/^#/, '').length !== 6) return
      const n = normalizeHex(v)
      if (n && n !== current.value) emit(n)
    }
    const commitHex = () => {
      hexFocused.value = false
      const n = normalizeHex(hexDraft.value)
      if (n) {
        if (n !== current.value) emit(n)
        hexDraft.value = n
      } else {
        hexDraft.value = current.value || props.value || ''
      }
    }

    // ---------------------------------------------------------------- 渲染
    const renderPresets = () => (
      <>
        <div class={'grid grid-cols-8 gap-1.5'} data-color-presets>
          {presets.colors.map(c => {
            const selected = c === current.value
            return (
              <button
                type="button"
                key={c}
                title={c}
                data-color={c}
                class={'relative h-7 min-w-0 rounded border border-solid cursor-pointer p-0 outline-none'}
                style={{
                  background: c,
                  borderColor: selected ? '#2563eb' : 'rgba(0,0,0,.15)',
                  boxShadow: selected ? '0 0 0 2px #2563eb' : 'none'
                }}
                onClick={() => (manage.value ? removeColorPreset(c) : pick(c))}
              >
                {selected && !manage.value && (
                  <span class={'absolute inset-0 flex items-center justify-center text-xs font-bold'} style={{ color: isLightColor(c) ? '#111827' : '#ffffff' }}>✓</span>
                )}
                {manage.value && (
                  <span class={'absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-red-500 text-white text-[10px] leading-[14px] text-center shadow'}>×</span>
                )}
              </button>
            )
          })}
        </div>
        {presets.colors.length === 0 && <div class={'text-xs text-gray-400 py-1'}>{tt('scada.color.emptyPresets')}</div>}
        <div class={'flex flex-wrap items-center gap-1.5 mt-2'}>
          <NButton size="tiny" disabled={!canAdd.value} onClick={addCurrent}>＋ {tt('scada.color.addPreset')}</NButton>
          <NButton size="tiny" secondary={manage.value} type={manage.value ? 'primary' : 'default'} onClick={() => (manage.value = !manage.value)}>
            {manage.value ? tt('scada.color.done') : tt('scada.color.manage')}
          </NButton>
          {manage.value && <NButton size="tiny" quaternary onClick={() => resetColorPresets()}>{tt('scada.color.resetPresets')}</NButton>}
          <span class={'ml-auto text-[11px] text-gray-400'}>{presets.colors.length}/{COLOR_PRESETS_MAX}</span>
        </div>
        {manage.value && <div class={'text-[11px] text-gray-500 mt-1'}>{tt('scada.color.manageHint')}</div>}
      </>
    )

    const renderPalette = () => (
      <>
        <div
          ref={svRef}
          data-color-sv
          class={'relative w-full h-28 rounded cursor-crosshair select-none'}
          style={{
            background: `linear-gradient(to top, #000, rgba(0,0,0,0)), linear-gradient(to right, #fff, hsl(${hsv.h}, 100%, 50%))`,
            touchAction: 'none'
          }}
          onPointerdown={onSvDown}
          onPointermove={onSvMove}
          onPointerup={onSvUp}
          onPointercancel={onSvUp}
        >
          <div
            class={'absolute w-3.5 h-3.5 rounded-full border-2 border-solid border-white shadow pointer-events-none'}
            style={{ left: `calc(${hsv.s * 100}% - 7px)`, top: `calc(${(1 - hsv.v) * 100}% - 7px)`, background: paletteHex.value }}
          />
        </div>
        <div
          ref={hueRef}
          data-color-hue
          class={'relative w-full h-3.5 rounded mt-2.5 cursor-pointer select-none'}
          style={{ background: HUE_BG, touchAction: 'none' }}
          onPointerdown={onHueDown}
          onPointermove={onHueMove}
          onPointerup={onHueUp}
          onPointercancel={onHueUp}
        >
          <div
            class={'absolute top-1/2 w-3.5 h-3.5 rounded-full border-2 border-solid border-white shadow pointer-events-none'}
            style={{ left: `calc(${(hsv.h / 360) * 100}% - 7px)`, transform: 'translateY(-50%)', background: `hsl(${hsv.h}, 100%, 50%)` }}
          />
        </div>
        <div class={'flex items-center gap-1.5 mt-2'}>
          <span class={'w-7 h-7 rounded border border-solid border-gray-300 shrink-0'} style={{ background: current.value || paletteHex.value }} />
          <NInput
            class={'flex-1 min-w-0'}
            size="small"
            value={hexDraft.value}
            placeholder="#RRGGBB"
            inputProps={{ spellcheck: false, autocomplete: 'off' }}
            onUpdateValue={onHexInput}
            onFocus={() => (hexFocused.value = true)}
            onBlur={commitHex}
          />
          <NButton size="tiny" disabled={!canAdd.value} onClick={addCurrent}>＋ {tt('scada.color.addPreset')}</NButton>
        </div>
      </>
    )

    /** 浮动面板：固定定位在 body 下；小箭头指向色块 */
    const renderPopup = (v: string) => (
      <div
        ref={popupRef}
        data-color-popup
        data-placement={pos.placement}
        class={'fixed'}
        style={{ left: pos.left + 'px', width: pos.width + 'px', zIndex: 2500, ...(pos.placement === 'top' ? { bottom: pos.edge + 'px' } : { top: pos.edge + 'px' }) }}
      >
        <div class={'p-2.5 rounded-lg border border-solid border-gray-200 bg-white shadow-2xl overflow-y-auto'} style={{ maxHeight: pos.maxHeight + 'px' }} data-color-panel>
          <div class={'flex items-center gap-1.5 mb-2'}>
            <span class={'flex-1 min-w-0 truncate text-xs text-gray-500'}>{props.label ? `${props.label} · ` : ''}{view.value === 'presets' ? tt('scada.color.presets') : tt('scada.color.palette')}</span>
            {props.clearable && (
              <NButton size="tiny" quaternary disabled={!v} onClick={() => emit('')}>{tt('scada.color.clear')}</NButton>
            )}
            <NButton size="tiny" secondary type="primary" data-color-switch onClick={() => (view.value = view.value === 'presets' ? 'palette' : 'presets')}>
              {view.value === 'presets' ? tt('scada.color.palette') : tt('scada.color.presets')}
            </NButton>
            <NButton size="tiny" quaternary data-color-close onClick={close}>✕</NButton>
          </div>
          {view.value === 'presets' ? renderPresets() : renderPalette()}
        </div>
        <div
          class={'absolute w-2.5 h-2.5 bg-white border-solid border-gray-200 pointer-events-none'}
          style={{
            left: pos.arrow - 5 + 'px',
            transform: 'rotate(45deg)',
            ...(pos.placement === 'top' ? { bottom: '-6px', borderWidth: '0 1px 1px 0' } : { top: '-6px', borderWidth: '1px 0 0 1px' })
          }}
        />
      </div>
    )

    return () => {
      const v = props.value
      return (
        <div ref={rootRef} class={'py-1'} data-color-field>
          <div class={'flex items-center gap-2'}>
            <div class={'w-[88px] shrink-0 text-xs text-gray-600 truncate'} title={props.label}>{props.label}</div>
            <button
              ref={triggerRef}
              type="button"
              data-color-trigger
              class={'flex-1 min-w-0 h-7 flex items-center gap-2 px-1.5 rounded border border-solid bg-white cursor-pointer outline-none'}
              style={{ borderColor: open.value ? '#2563eb' : '#d1d5db' }}
              onClick={toggle}
            >
              <span class={'w-5 h-5 rounded-sm border border-solid border-gray-300 shrink-0'} style={{ background: v || EMPTY_BG }} />
              <span class={'flex-1 min-w-0 text-left text-xs text-gray-700 truncate font-mono'}>{v || tt('scada.color.none')}</span>
              <span class={'text-[10px] text-gray-400'}>{open.value ? '▼' : '▲'}</span>
            </button>
          </div>
          {/* 注意：Teleport 的唯一子节点不能是布尔值，要用三元返回 null */}
          <Teleport to="body">{open.value ? renderPopup(v) : null}</Teleport>
        </div>
      )
    }
  }
})
