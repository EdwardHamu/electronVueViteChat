/**
 * 属性面板的颜色字段：一行「标签 + 当前色块」，点开后在下方展开面板（不用弹层，避免与属性面板滚动 / 竖屏两栏互相遮挡）。
 *  - 第一界面是「预设颜色」网格：点色块直接选色；「＋ 加入预设」把当前颜色存进去；「管理」进入删除模式，可「恢复默认」。
 *    预设表所有颜色字段共用并持久化（colorPresets.ts，localStorage）。
 *  - 点「调色盘」切换到 HSV 调色盘：饱和度 / 明度面板 + 色相条 + hex 输入，同样可以把当前颜色加入预设。
 *  - clearable 时提供「清除」（写回空字符串 = 使用组件默认色）。
 */
import { NButton, NInput } from 'naive-ui'
import { computed, defineComponent, reactive, ref, watch, type PropType } from 'vue'
import { clamp01, hexToHsv, hsvToHex, isLightColor, normalizeHex } from './color'
import { addColorPreset, COLOR_PRESETS_MAX, removeColorPreset, resetColorPresets, useColorPresets } from './colorPresets'
import { tt } from './widgets/common'

type View = 'presets' | 'palette'

/** 空值（使用默认色）时色块显示棋盘格 */
const EMPTY_BG = 'repeating-conic-gradient(#e5e7eb 0 25%, #ffffff 0 50%) 0 0 / 8px 8px'
const HUE_BG = 'linear-gradient(to right, #f00 0%, #ff0 16.7%, #0f0 33.3%, #0ff 50%, #00f 66.7%, #f0f 83.3%, #f00 100%)'

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
    const open = ref(false)
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
    const toggle = () => {
      open.value = !open.value
      if (open.value) {
        // 每次打开都回到预设表
        view.value = 'presets'
        manage.value = false
        syncFromValue()
      }
    }
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

    return () => {
      const v = props.value
      return (
        <div class={'py-1'} data-color-field>
          <div class={'flex items-center gap-2'}>
            <div class={'w-[88px] shrink-0 text-xs text-gray-600 truncate'} title={props.label}>{props.label}</div>
            <button
              type="button"
              data-color-trigger
              class={'flex-1 min-w-0 h-7 flex items-center gap-2 px-1.5 rounded border border-solid bg-white cursor-pointer outline-none'}
              style={{ borderColor: open.value ? '#2563eb' : '#d1d5db' }}
              onClick={toggle}
            >
              <span class={'w-5 h-5 rounded-sm border border-solid border-gray-300 shrink-0'} style={{ background: v || EMPTY_BG }} />
              <span class={'flex-1 min-w-0 text-left text-xs text-gray-700 truncate font-mono'}>{v || tt('scada.color.none')}</span>
              <span class={'text-[10px] text-gray-400'}>{open.value ? '▲' : '▼'}</span>
            </button>
          </div>
          {open.value ? (
            <div class={'mt-1.5 p-2 rounded border border-solid border-gray-200 bg-gray-50'} data-color-panel>
              <div class={'flex items-center gap-1.5 mb-2'}>
                <span class={'flex-1 text-xs text-gray-500'}>{view.value === 'presets' ? tt('scada.color.presets') : tt('scada.color.palette')}</span>
                {props.clearable && (
                  <NButton size="tiny" quaternary disabled={!v} onClick={() => emit('')}>{tt('scada.color.clear')}</NButton>
                )}
                <NButton size="tiny" secondary type="primary" data-color-switch onClick={() => (view.value = view.value === 'presets' ? 'palette' : 'presets')}>
                  {view.value === 'presets' ? tt('scada.color.palette') : tt('scada.color.presets')}
                </NButton>
              </div>
              {view.value === 'presets' ? renderPresets() : renderPalette()}
            </div>
          ) : null}
        </div>
      )
    }
  }
})
