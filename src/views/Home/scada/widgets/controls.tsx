/**
 * 控制与显示：数值 IO 域 / 字符 IO 域 / 日期时间域 / 按钮 / 位按钮 / 字按钮 / 位状态显示 / 字状态显示 /
 * 文本列表 / 文本开关 / 单选框 / 复选框。
 * 写入类组件通过 useControl() 写回绑定的数据源（目前只有「内部变量」可写；产品分类数据只读，绑定后显示为只读）。
 * 编辑模式下画布把组件内容设为 pointer-events: none，所以这些组件在编辑时不会被误触发。
 */
import { computed, defineComponent, nextTick, ref } from 'vue'
import { callBrige } from '@/utils/callm'
import { callFnName } from '@/utils/enum'
import { isLightColor, normalizeHex } from '../color'
import type { PropField, WidgetDefinition } from '../types'
import { icons } from './icons'
import { pointText, statusColor, tt, widgetProps } from './common'
import { choiceValue, fontSizeOf, formatDate, matchChoice, parseChoices, pointOn, useClock, useControl } from './controlCommon'

const textOn = (bg: string) => {
  const hex = normalizeHex(bg)
  return hex && isLightColor(hex) ? '#111827' : '#ffffff'
}
const justify = (align: string) => (align === 'left' ? 'flex-start' : align === 'right' ? 'flex-end' : 'center')

// ---------------------------------------------------------------- 字段模板
const P = {
  fontSize: (): PropField => ({ key: 'fontSize', label: () => tt('scada.prop.fontSize'), type: 'number', min: 0, max: 300, step: 1, placeholder: '0 = auto' }),
  bg: (): PropField => ({ key: 'bg', label: () => tt('scada.prop.bg'), type: 'color' }),
  fg: (): PropField => ({ key: 'fg', label: () => tt('scada.prop.fg'), type: 'color' }),
  radius: (): PropField => ({ key: 'radius', label: () => tt('scada.prop.radius'), type: 'number', min: 0, max: 100, step: 1 }),
  border: (): PropField => ({ key: 'border', label: () => tt('scada.prop.border'), type: 'boolean' }),
  align: (): PropField => ({
    key: 'align', label: () => tt('scada.prop.align'), type: 'select',
    options: () => [
      { label: tt('scada.prop.alignLeft'), value: 'left' },
      { label: tt('scada.prop.alignCenter'), value: 'center' },
      { label: tt('scada.prop.alignRight'), value: 'right' }
    ]
  }),
  onText: (): PropField => ({ key: 'onText', label: () => tt('scada.prop.onText'), type: 'text' }),
  offText: (): PropField => ({ key: 'offText', label: () => tt('scada.prop.offText'), type: 'text' }),
  onColor: (): PropField => ({ key: 'onColor', label: () => tt('scada.prop.onColor'), type: 'color' }),
  offColor: (): PropField => ({ key: 'offColor', label: () => tt('scada.prop.offColor'), type: 'color' }),
  items: (): PropField => ({ key: 'items', label: () => tt('scada.prop.items'), type: 'textarea', placeholder: () => tt('scada.prop.itemsPlaceholder') }),
  layout: (): PropField => ({
    key: 'layout', label: () => tt('scada.prop.layout'), type: 'select',
    options: () => [
      { label: tt('scada.prop.horizontal'), value: 'horizontal' },
      { label: tt('scada.prop.vertical'), value: 'vertical' }
    ]
  })
}

const def = (type: string, extra: Partial<WidgetDefinition> & { defaultProps: () => Record<string, any>; propSchema: PropField[]; component: any }): WidgetDefinition => ({
  type,
  label: () => tt('scada.widget.' + type),
  description: () => tt('scada.widget.' + type + 'Desc'),
  icon: icons[type],
  category: 'control',
  defaultSize: { w: 160, h: 48 },
  minSize: { w: 30, h: 20 },
  needsBinding: true,
  ...extra
})

/** 共用的外框样式 */
const frame = (p: Record<string, any>, extra: Record<string, any> = {}) => ({
  background: p.bg || 'transparent',
  color: p.fg || '#1f2937',
  borderRadius: (Number(p.radius) || 0) + 'px',
  border: p.border ? `1px solid ${p.borderColor || '#94a3b8'}` : 'none',
  ...extra
})

// ---------------------------------------------------------------- 数值 / 字符 IO 域
const IOField = defineComponent({
  name: 'ScadaIOField',
  props: widgetProps,
  setup(props) {
    const p = computed(() => props.widget.props)
    const { interactive, write } = useControl(props)
    const isNumber = computed(() => props.widget.type === 'numericIO')
    const editable = computed(() => interactive.value && !p.value.readOnly)
    const draft = ref<string | null>(null)
    const inputRef = ref<HTMLInputElement>()
    const text = computed(() => {
      const point = props.point
      if (isNumber.value) return pointText(point, p.value.decimals) + (p.value.showUnit && point?.unit ? ' ' + point.unit : '')
      if (!point) return '--'
      if (point.text !== undefined && point.text !== '') return point.text
      return point.value !== null && point.value !== undefined ? String(point.value) : '--'
    })
    const begin = () => {
      if (!editable.value || draft.value !== null) return
      const point = props.point
      draft.value = isNumber.value ? (point && point.value !== null ? String(point.value) : '') : point?.text ?? (point && point.value !== null ? String(point.value) : '')
      nextTick(() => {
        inputRef.value?.focus()
        inputRef.value?.select()
      })
    }
    const commit = async () => {
      if (draft.value === null) return
      const v = draft.value
      draft.value = null
      if (isNumber.value) {
        const n = Number(v)
        if (v.trim() === '' || !Number.isFinite(n)) return
        await write(n)
      } else {
        await write(v)
      }
    }
    const cancel = () => (draft.value = null)
    const onKey = (e: KeyboardEvent) => {
      e.stopPropagation()
      if (e.key === 'Enter') commit()
      else if (e.key === 'Escape') cancel()
    }
    const step = async (dir: 1 | -1) => {
      const cur = props.point?.value
      const s = Number(p.value.step) > 0 ? Number(p.value.step) : 1
      let next = (typeof cur === 'number' && Number.isFinite(cur) ? cur : 0) + dir * s
      if (p.value.min !== null && p.value.min !== undefined && p.value.min !== '') next = Math.max(Number(p.value.min), next)
      if (p.value.max !== null && p.value.max !== undefined && p.value.max !== '') next = Math.min(Number(p.value.max), next)
      await write(Number(next.toFixed(6)))
    }
    return () => {
      const fs = fontSizeOf(props.widget, 0.45)
      const align = p.value.align || (isNumber.value ? 'right' : 'left')
      const steppers = isNumber.value && editable.value && p.value.steppers !== false
      const btnCls = 'shrink-0 h-full flex items-center justify-center select-none cursor-pointer opacity-60 hover:opacity-100 active:opacity-100'
      return (
        <div
          class={'w-full h-full flex items-center overflow-hidden'}
          style={frame(p.value, { fontSize: fs + 'px', cursor: editable.value ? 'text' : 'default', fontVariantNumeric: 'tabular-nums' })}
          data-io-field
        >
          {steppers && (
            <div class={btnCls} style={{ width: fs * 1.3 + 'px', borderRight: '1px solid rgba(0,0,0,.08)' }} onClick={() => step(-1)}>－</div>
          )}
          <div class={'flex-1 min-w-0 h-full flex items-center px-2'} style={{ justifyContent: justify(align) }} onClick={begin}>
            {draft.value !== null ? (
              <input
                ref={inputRef}
                class={'w-full h-full bg-transparent border-0 outline-none p-0 m-0'}
                style={{ font: 'inherit', color: 'inherit', textAlign: align as any }}
                value={draft.value}
                inputmode={isNumber.value ? 'decimal' : 'text'}
                onInput={(e: Event) => (draft.value = (e.target as HTMLInputElement).value)}
                onBlur={commit}
                onKeydown={onKey}
              />
            ) : (
              <span class={'truncate'}>{text.value}</span>
            )}
          </div>
          {editable.value && draft.value === null && !steppers && <span class={'pr-1 opacity-40 text-[0.6em]'}>✎</span>}
          {steppers && (
            <div class={btnCls} style={{ width: fs * 1.3 + 'px', borderLeft: '1px solid rgba(0,0,0,.08)' }} onClick={() => step(1)}>＋</div>
          )}
        </div>
      )
    }
  }
})

// ---------------------------------------------------------------- 日期时间域
const DATE_FORMATS = ['YYYY-MM-DD HH:mm:ss', 'YYYY-MM-DD HH:mm', 'YYYY-MM-DD', 'HH:mm:ss', 'HH:mm', 'MM-DD HH:mm:ss']
const DateTimeField = defineComponent({
  name: 'ScadaDateTime',
  props: widgetProps,
  setup(props) {
    const p = computed(() => props.widget.props)
    const now = useClock()
    return () => {
      const fmt = (p.value.format as string) || DATE_FORMATS[0]
      let text: string
      if (p.value.mode === 'data') {
        const ts = props.point?.time
        text = ts ? formatDate(ts, fmt) : '--'
      } else {
        text = formatDate(now.value, fmt)
      }
      const fs = fontSizeOf(props.widget, 0.45)
      return (
        <div class={'w-full h-full flex items-center px-2 overflow-hidden'} style={frame(p.value, { fontSize: fs + 'px', justifyContent: justify(p.value.align || 'center'), fontVariantNumeric: 'tabular-nums' })}>
          <span class={'truncate'}>{text}</span>
        </div>
      )
    }
  }
})

// ---------------------------------------------------------------- 按钮（写值 / 取反 / 采集命令）
type ButtonAction = 'none' | 'write' | 'toggle' | 'startCollect' | 'stopCollect' | 'clearCollect' | 'shaftCollect'
const BRIDGE_ACTIONS: Record<string, string> = {
  startCollect: callFnName.StartCollect,
  stopCollect: callFnName.StopCollect,
  clearCollect: callFnName.ClearCollect,
  shaftCollect: callFnName.ShaftCollect
}
const ActionButton = defineComponent({
  name: 'ScadaButton',
  props: widgetProps,
  setup(props) {
    const p = computed(() => props.widget.props)
    const { write, notify } = useControl(props)
    const busy = ref(false)
    const pressed = ref(false)
    const run = async () => {
      if (props.editing || busy.value) return
      const action = (p.value.action as ButtonAction) || 'none'
      busy.value = true
      try {
        if (action === 'write') {
          const raw = String(p.value.value ?? '')
          const n = Number(raw)
          await write(raw.trim() !== '' && Number.isFinite(n) ? n : raw)
        } else if (action === 'toggle') {
          await write(!pointOn(props.point))
        } else if (BRIDGE_ACTIONS[action]) {
          // 开始 / 停止采集优先走首页注册的 window.frontFn（会顺带刷新配置、更新采集状态），没有时直接调桥
          const front = typeof window !== 'undefined' ? (window as any).frontFn : null
          const fn = front && typeof front[action] === 'function' ? front[action] : null
          if (fn) await fn()
          else await callBrige(BRIDGE_ACTIONS[action])
          notify('success', tt('scada.widget.actionDone'))
        }
      } catch (err) {
        console.warn('[scada] button action failed', err)
        notify('error', tt('scada.widget.actionFailed'))
      } finally {
        busy.value = false
      }
    }
    return () => {
      const bg = p.value.bg || '#2563eb'
      const fs = fontSizeOf(props.widget, 0.4)
      const label = (p.value.label as string) || tt('scada.widget.button')
      return (
        <button
          type="button"
          data-scada-button
          class={'w-full h-full flex items-center justify-center px-2 border-0 overflow-hidden select-none'}
          style={{
            background: bg,
            color: p.value.fg || textOn(bg),
            borderRadius: (Number(p.value.radius) || 0) + 'px',
            fontSize: fs + 'px',
            fontWeight: 600,
            cursor: props.editing ? 'default' : 'pointer',
            opacity: busy.value ? 0.7 : 1,
            boxShadow: pressed.value ? 'inset 0 3px 6px rgba(0,0,0,.35)' : 'inset 0 -3px 0 rgba(0,0,0,.18), 0 1px 2px rgba(0,0,0,.2)',
            transform: pressed.value ? 'translateY(1px)' : 'none'
          }}
          onPointerdown={() => (pressed.value = true)}
          onPointerup={() => (pressed.value = false)}
          onPointerleave={() => (pressed.value = false)}
          onPointercancel={() => (pressed.value = false)}
          onClick={run}
        >
          <span class={'truncate'}>{label}</span>
        </button>
      )
    }
  }
})

// ---------------------------------------------------------------- 位按钮
const BitButton = defineComponent({
  name: 'ScadaBitButton',
  props: widgetProps,
  setup(props) {
    const p = computed(() => props.widget.props)
    const { interactive, write } = useControl(props)
    const on = computed(() => pointOn(props.point))
    const held = ref(false)
    const click = () => {
      const mode = p.value.mode || 'toggle'
      if (mode === 'toggle') write(!on.value)
      else if (mode === 'set') write(true)
      else if (mode === 'reset') write(false)
    }
    const down = () => {
      if (p.value.mode !== 'momentary' || props.editing) return
      held.value = true
      write(true)
    }
    const up = () => {
      if (p.value.mode !== 'momentary' || !held.value) return
      held.value = false
      write(false)
    }
    return () => {
      const bg = on.value ? p.value.onColor || '#22c55e' : p.value.offColor || '#94a3b8'
      const fs = fontSizeOf(props.widget, 0.4)
      const label = (p.value.label as string) || (on.value ? p.value.onText || 'ON' : p.value.offText || 'OFF')
      return (
        <button
          type="button"
          data-scada-bit-button
          class={'w-full h-full flex items-center justify-center gap-2 px-2 border-0 overflow-hidden select-none'}
          style={{
            background: bg,
            color: p.value.fg || textOn(bg),
            borderRadius: (Number(p.value.radius) || 0) + 'px',
            fontSize: fs + 'px',
            fontWeight: 600,
            cursor: interactive.value ? 'pointer' : 'default',
            opacity: interactive.value || props.editing ? 1 : 0.8,
            boxShadow: held.value ? 'inset 0 3px 6px rgba(0,0,0,.35)' : 'inset 0 -3px 0 rgba(0,0,0,.18)'
          }}
          onClick={click}
          onPointerdown={down}
          onPointerup={up}
          onPointerleave={up}
          onPointercancel={up}
        >
          <span class={'rounded-full shrink-0'} style={{ width: fs * 0.6 + 'px', height: fs * 0.6 + 'px', background: on.value ? '#ffffff' : 'rgba(255,255,255,.45)', boxShadow: on.value ? '0 0 6px #fff' : 'none' }} />
          <span class={'truncate'}>{label}</span>
        </button>
      )
    }
  }
})

// ---------------------------------------------------------------- 字按钮
const WordButton = defineComponent({
  name: 'ScadaWordButton',
  props: widgetProps,
  setup(props) {
    const p = computed(() => props.widget.props)
    const { interactive, write } = useControl(props)
    const click = () => {
      const mode = p.value.mode || 'set'
      const v = Number(p.value.value) || 0
      const cur = typeof props.point?.value === 'number' && Number.isFinite(props.point.value) ? props.point.value : 0
      let next = mode === 'add' ? cur + v : mode === 'sub' ? cur - v : v
      if (p.value.min !== null && p.value.min !== undefined && p.value.min !== '') next = Math.max(Number(p.value.min), next)
      if (p.value.max !== null && p.value.max !== undefined && p.value.max !== '') next = Math.min(Number(p.value.max), next)
      write(Number(next.toFixed(6)))
    }
    return () => {
      const bg = p.value.bg || '#0ea5e9'
      const fs = fontSizeOf(props.widget, 0.4)
      const mode = p.value.mode || 'set'
      const label = (p.value.label as string) || `${mode === 'add' ? '+' : mode === 'sub' ? '−' : '='} ${p.value.value ?? 0}`
      return (
        <button
          type="button"
          data-scada-word-button
          class={'w-full h-full flex items-center justify-center px-2 border-0 overflow-hidden select-none'}
          style={{
            background: bg,
            color: p.value.fg || textOn(bg),
            borderRadius: (Number(p.value.radius) || 0) + 'px',
            fontSize: fs + 'px',
            fontWeight: 600,
            cursor: interactive.value ? 'pointer' : 'default',
            opacity: interactive.value || props.editing ? 1 : 0.8,
            boxShadow: 'inset 0 -3px 0 rgba(0,0,0,.18)'
          }}
          onClick={click}
        >
          <span class={'truncate'}>{label}</span>
        </button>
      )
    }
  }
})

// ---------------------------------------------------------------- 位状态显示
const BitStatus = defineComponent({
  name: 'ScadaBitStatus',
  props: widgetProps,
  setup(props) {
    const p = computed(() => props.widget.props)
    return () => {
      const point = props.point
      const offline = !point || point.status === 'offline'
      const on = pointOn(point)
      const color = offline ? '#9ca3af' : on ? p.value.onColor || '#22c55e' : p.value.offColor || '#64748b'
      const text = offline ? '--' : on ? p.value.onText || 'ON' : p.value.offText || 'OFF'
      const fs = fontSizeOf(props.widget, 0.42)
      const style: string = p.value.style || 'lamp'
      if (style === 'fill') {
        return (
          <div class={'w-full h-full flex items-center justify-center px-2 overflow-hidden font-bold'} style={frame(p.value, { background: color, color: p.value.fg || textOn(color), fontSize: fs + 'px' })}>
            <span class={'truncate'}>{text}</span>
          </div>
        )
      }
      const lamp = Math.min(props.widget.h * 0.6, fs * 1.2)
      return (
        <div class={'w-full h-full flex items-center gap-2 px-2 overflow-hidden'} style={frame(p.value, { fontSize: fs + 'px', justifyContent: justify(p.value.align || 'left') })}>
          <span class={'rounded-full shrink-0'} style={{ width: lamp + 'px', height: lamp + 'px', background: color, boxShadow: `inset 0 -${lamp * 0.12}px ${lamp * 0.25}px rgba(0,0,0,.3), 0 0 ${lamp * 0.35}px ${color}` }} />
          <span class={'truncate font-bold'}>{text}</span>
        </div>
      )
    }
  }
})

// ---------------------------------------------------------------- 字状态显示
const WordStatus = defineComponent({
  name: 'ScadaWordStatus',
  props: widgetProps,
  setup(props) {
    const p = computed(() => props.widget.props)
    const items = computed(() => parseChoices(p.value.states))
    return () => {
      const point = props.point
      const hit = matchChoice(items.value, point)
      const offline = !point || point.status === 'offline'
      const color = offline ? '#9ca3af' : hit?.color || p.value.fallbackColor || '#64748b'
      const text = offline ? '--' : hit ? hit.label : p.value.fallbackText || pointText(point, 0)
      const fs = fontSizeOf(props.widget, 0.42)
      const showValue = p.value.showValue && !offline && point && point.value !== null
      return (
        <div class={'w-full h-full flex items-center justify-center gap-2 px-2 overflow-hidden font-bold'} style={frame(p.value, { background: color, color: p.value.fg || textOn(color), fontSize: fs + 'px' })}>
          <span class={'truncate'}>{text}</span>
          {showValue && <span class={'opacity-70 text-[0.7em]'}>({pointText(point, p.value.decimals)})</span>}
        </div>
      )
    }
  }
})

// ---------------------------------------------------------------- 文本列表
const TextList = defineComponent({
  name: 'ScadaTextList',
  props: widgetProps,
  setup(props) {
    const p = computed(() => props.widget.props)
    const { interactive, write } = useControl(props)
    const items = computed(() => parseChoices(p.value.items))
    return () => {
      const hit = matchChoice(items.value, props.point)
      const fs = fontSizeOf(props.widget, 0.12, 11, 40)
      const active = p.value.activeColor || '#2563eb'
      return (
        <div class={'w-full h-full flex flex-col overflow-y-auto overflow-x-hidden'} style={frame({ border: true, ...p.value }, { fontSize: fs + 'px' })} data-scada-text-list>
          {items.value.map(it => {
            const selected = hit === it
            return (
              <div
                key={it.value}
                class={'px-2 flex items-center shrink-0 truncate select-none'}
                style={{
                  minHeight: fs * 1.9 + 'px',
                  background: selected ? active : 'transparent',
                  color: selected ? textOn(active) : it.color || 'inherit',
                  cursor: interactive.value ? 'pointer' : 'default',
                  borderBottom: '1px solid rgba(0,0,0,.06)'
                }}
                onClick={() => interactive.value && write(choiceValue(it))}
              >
                {it.label}
              </div>
            )
          })}
          {items.value.length === 0 && <div class={'p-2 text-gray-400 text-xs'}>{tt('scada.prop.itemsPlaceholder')}</div>}
        </div>
      )
    }
  }
})

// ---------------------------------------------------------------- 文本开关
const TextSwitch = defineComponent({
  name: 'ScadaTextSwitch',
  props: widgetProps,
  setup(props) {
    const p = computed(() => props.widget.props)
    const { interactive, write } = useControl(props)
    const on = computed(() => pointOn(props.point))
    return () => {
      const h = Math.min(props.widget.h * 0.7, props.widget.w * 0.35)
      const trackW = h * 1.9
      const color = on.value ? p.value.onColor || '#22c55e' : p.value.offColor || '#cbd5e1'
      const fs = fontSizeOf(props.widget, 0.36)
      const text = on.value ? p.value.onText || 'ON' : p.value.offText || 'OFF'
      return (
        <div
          class={'w-full h-full flex items-center gap-2 px-2 overflow-hidden select-none'}
          style={frame(p.value, { fontSize: fs + 'px', justifyContent: justify(p.value.align || 'center'), cursor: interactive.value ? 'pointer' : 'default' })}
          data-scada-text-switch
          onClick={() => write(!on.value)}
        >
          <span class={'relative shrink-0 rounded-full transition-colors duration-200'} style={{ width: trackW + 'px', height: h + 'px', background: color, boxShadow: 'inset 0 1px 3px rgba(0,0,0,.25)' }}>
            <span
              class={'absolute top-1/2 rounded-full bg-white shadow transition-all duration-200'}
              style={{ width: h * 0.8 + 'px', height: h * 0.8 + 'px', transform: 'translateY(-50%)', left: (on.value ? trackW - h * 0.9 : h * 0.1) + 'px' }}
            />
          </span>
          {p.value.showText !== false && <span class={'truncate font-bold'}>{text}</span>}
        </div>
      )
    }
  }
})

// ---------------------------------------------------------------- 单选框
const RadioGroup = defineComponent({
  name: 'ScadaRadio',
  props: widgetProps,
  setup(props) {
    const p = computed(() => props.widget.props)
    const { interactive, write } = useControl(props)
    const items = computed(() => parseChoices(p.value.items))
    return () => {
      const hit = matchChoice(items.value, props.point)
      const vertical = (p.value.layout || 'vertical') === 'vertical'
      const fs = fontSizeOf(props.widget, vertical ? 0.14 : 0.4, 11, 40)
      const active = p.value.activeColor || '#2563eb'
      return (
        <div class={['w-full h-full flex overflow-auto gap-x-4 px-2 select-none', vertical ? 'flex-col justify-center' : 'flex-row items-center flex-wrap']} style={frame(p.value, { fontSize: fs + 'px' })} data-scada-radio>
          {items.value.map(it => {
            const selected = hit === it
            return (
              <div key={it.value} class={'flex items-center gap-1.5 shrink-0'} style={{ minHeight: fs * 1.7 + 'px', cursor: interactive.value ? 'pointer' : 'default' }} onClick={() => interactive.value && write(choiceValue(it))}>
                <span class={'rounded-full shrink-0 flex items-center justify-center'} style={{ width: fs + 'px', height: fs + 'px', border: `2px solid ${selected ? active : '#94a3b8'}`, background: '#fff' }}>
                  {selected ? <span class={'rounded-full'} style={{ width: fs * 0.45 + 'px', height: fs * 0.45 + 'px', background: active }} /> : null}
                </span>
                <span class={'truncate'}>{it.label}</span>
              </div>
            )
          })}
        </div>
      )
    }
  }
})

// ---------------------------------------------------------------- 复选框
const CheckBox = defineComponent({
  name: 'ScadaCheckbox',
  props: widgetProps,
  setup(props) {
    const p = computed(() => props.widget.props)
    const { interactive, write } = useControl(props)
    const on = computed(() => pointOn(props.point))
    return () => {
      const fs = fontSizeOf(props.widget, 0.4)
      const active = p.value.activeColor || '#2563eb'
      const label = (p.value.label as string) || props.widget.title || props.point?.name || ''
      return (
        <div
          class={'w-full h-full flex items-center gap-2 px-2 overflow-hidden select-none'}
          style={frame(p.value, { fontSize: fs + 'px', justifyContent: justify(p.value.align || 'left'), cursor: interactive.value ? 'pointer' : 'default' })}
          data-scada-checkbox
          onClick={() => write(!on.value)}
        >
          <span class={'shrink-0 flex items-center justify-center rounded-sm'} style={{ width: fs + 'px', height: fs + 'px', border: `2px solid ${on.value ? active : '#94a3b8'}`, background: on.value ? active : '#fff', color: '#fff' }}>
            {on.value ? (
              <svg viewBox="0 0 24 24" width="80%" height="80%"><path d="M5 12.5 L10 17 L19 7" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" /></svg>
            ) : null}
          </span>
          {label && <span class={'truncate'}>{label}</span>}
        </div>
      )
    }
  }
})

// ---------------------------------------------------------------- 定义
const bool = { bg: '', fg: '', radius: 6, fontSize: 0 }

export const controlDefinitions: WidgetDefinition[] = [
  def('numericIO', {
    defaultSize: { w: 180, h: 48 },
    defaultProps: () => ({ decimals: null, showUnit: true, align: 'right', fontSize: 0, readOnly: false, steppers: true, step: 1, min: null, max: null, bg: '#ffffff', fg: '#1f2937', border: true, radius: 4 }),
    propSchema: [
      { key: 'decimals', label: () => tt('scada.prop.decimals'), type: 'number', min: 0, max: 8, step: 1, placeholder: 'auto' },
      { key: 'showUnit', label: () => tt('scada.prop.showUnit'), type: 'boolean' },
      { key: 'readOnly', label: () => tt('scada.prop.readOnly'), type: 'boolean' },
      { key: 'steppers', label: () => tt('scada.prop.steppers'), type: 'boolean' },
      { key: 'step', label: () => tt('scada.prop.step'), type: 'number', min: 0, step: 1 },
      { key: 'min', label: () => tt('scada.prop.minValue'), type: 'number', placeholder: '-' },
      { key: 'max', label: () => tt('scada.prop.maxValue'), type: 'number', placeholder: '-' },
      P.align(), P.fontSize(), P.border(), P.radius(), P.bg(), P.fg()
    ],
    component: IOField
  }),
  def('stringIO', {
    defaultSize: { w: 200, h: 48 },
    defaultProps: () => ({ align: 'left', fontSize: 0, readOnly: false, bg: '#ffffff', fg: '#1f2937', border: true, radius: 4 }),
    propSchema: [{ key: 'readOnly', label: () => tt('scada.prop.readOnly'), type: 'boolean' }, P.align(), P.fontSize(), P.border(), P.radius(), P.bg(), P.fg()],
    component: IOField
  }),
  def('datetime', {
    defaultSize: { w: 240, h: 48 },
    needsBinding: false,
    defaultProps: () => ({ mode: 'now', format: DATE_FORMATS[0], align: 'center', fontSize: 0, bg: '', fg: '#1f2937', border: false, radius: 0 }),
    propSchema: [
      {
        key: 'mode', label: () => tt('scada.prop.timeSource'), type: 'select',
        options: () => [
          { label: tt('scada.prop.timeNow'), value: 'now' },
          { label: tt('scada.prop.timeData'), value: 'data' }
        ]
      },
      { key: 'format', label: () => tt('scada.prop.format'), type: 'select', options: () => DATE_FORMATS.map(f => ({ label: f, value: f })) },
      P.align(), P.fontSize(), P.border(), P.radius(), P.bg(), P.fg()
    ],
    component: DateTimeField
  }),
  def('button', {
    defaultSize: { w: 140, h: 52 },
    needsBinding: false,
    defaultProps: () => ({ label: '', action: 'write', value: '1', ...bool }),
    propSchema: [
      { key: 'label', label: () => tt('scada.prop.label'), type: 'text' },
      {
        key: 'action', label: () => tt('scada.prop.action'), type: 'select',
        options: () => [
          { label: tt('scada.prop.actionWrite'), value: 'write' },
          { label: tt('scada.prop.actionToggle'), value: 'toggle' },
          { label: tt('scada.prop.actionStart'), value: 'startCollect' },
          { label: tt('scada.prop.actionStop'), value: 'stopCollect' },
          { label: tt('scada.prop.actionClear'), value: 'clearCollect' },
          { label: tt('scada.prop.actionShaft'), value: 'shaftCollect' },
          { label: tt('scada.prop.actionNone'), value: 'none' }
        ]
      },
      { key: 'value', label: () => tt('scada.prop.writeValue'), type: 'text' },
      P.fontSize(), P.radius(), P.bg(), P.fg()
    ],
    component: ActionButton
  }),
  def('bitButton', {
    defaultSize: { w: 140, h: 52 },
    defaultProps: () => ({ mode: 'toggle', label: '', onText: 'ON', offText: 'OFF', onColor: '#22c55e', offColor: '#94a3b8', fg: '', radius: 6, fontSize: 0 }),
    propSchema: [
      {
        key: 'mode', label: () => tt('scada.prop.bitMode'), type: 'select',
        options: () => [
          { label: tt('scada.prop.bitToggle'), value: 'toggle' },
          { label: tt('scada.prop.bitSet'), value: 'set' },
          { label: tt('scada.prop.bitReset'), value: 'reset' },
          { label: tt('scada.prop.bitMomentary'), value: 'momentary' }
        ]
      },
      { key: 'label', label: () => tt('scada.prop.label'), type: 'text', placeholder: () => tt('scada.prop.labelAuto') },
      P.onText(), P.offText(), P.onColor(), P.offColor(), P.fontSize(), P.radius(), P.fg()
    ],
    component: BitButton
  }),
  def('wordButton', {
    defaultSize: { w: 140, h: 52 },
    defaultProps: () => ({ mode: 'set', value: 1, min: null, max: null, label: '', bg: '#0ea5e9', fg: '', radius: 6, fontSize: 0 }),
    propSchema: [
      {
        key: 'mode', label: () => tt('scada.prop.wordMode'), type: 'select',
        options: () => [
          { label: tt('scada.prop.wordSet'), value: 'set' },
          { label: tt('scada.prop.wordAdd'), value: 'add' },
          { label: tt('scada.prop.wordSub'), value: 'sub' }
        ]
      },
      { key: 'value', label: () => tt('scada.prop.writeValue'), type: 'number' },
      { key: 'min', label: () => tt('scada.prop.minValue'), type: 'number', placeholder: '-' },
      { key: 'max', label: () => tt('scada.prop.maxValue'), type: 'number', placeholder: '-' },
      { key: 'label', label: () => tt('scada.prop.label'), type: 'text', placeholder: () => tt('scada.prop.labelAuto') },
      P.fontSize(), P.radius(), P.bg(), P.fg()
    ],
    component: WordButton
  }),
  def('bitStatus', {
    defaultSize: { w: 160, h: 48 },
    defaultProps: () => ({ style: 'lamp', onText: '', offText: '', onColor: '#22c55e', offColor: '#64748b', align: 'left', fontSize: 0, bg: '', fg: '#1f2937', border: false, radius: 4 }),
    propSchema: [
      {
        key: 'style', label: () => tt('scada.prop.style'), type: 'select',
        options: () => [
          { label: tt('scada.prop.styleLamp'), value: 'lamp' },
          { label: tt('scada.prop.styleFill'), value: 'fill' }
        ]
      },
      P.onText(), P.offText(), P.onColor(), P.offColor(), P.align(), P.fontSize(), P.border(), P.radius(), P.bg(), P.fg()
    ],
    component: BitStatus
  }),
  def('wordStatus', {
    defaultSize: { w: 160, h: 48 },
    defaultProps: () => ({ states: '', fallbackText: '', fallbackColor: '#64748b', showValue: false, decimals: 0, fontSize: 0, fg: '', radius: 4 }),
    propSchema: [
      { key: 'states', label: () => tt('scada.prop.states'), type: 'textarea', placeholder: () => tt('scada.prop.statesPlaceholder') },
      { key: 'fallbackText', label: () => tt('scada.prop.fallbackText'), type: 'text', placeholder: () => tt('scada.prop.fallbackAuto') },
      { key: 'fallbackColor', label: () => tt('scada.prop.fallbackColor'), type: 'color' },
      { key: 'showValue', label: () => tt('scada.prop.showValue'), type: 'boolean' },
      { key: 'decimals', label: () => tt('scada.prop.decimals'), type: 'number', min: 0, max: 8, step: 1 },
      P.fontSize(), P.radius(), P.fg()
    ],
    component: WordStatus
  }),
  def('textList', {
    defaultSize: { w: 160, h: 140 },
    defaultProps: () => ({ items: '', activeColor: '#2563eb', fontSize: 0, bg: '#ffffff', fg: '#1f2937', radius: 4, borderColor: '#94a3b8' }),
    propSchema: [P.items(), { key: 'activeColor', label: () => tt('scada.prop.activeColor'), type: 'color' }, P.fontSize(), P.radius(), P.bg(), P.fg()],
    component: TextList
  }),
  def('textSwitch', {
    defaultSize: { w: 160, h: 48 },
    defaultProps: () => ({ onText: 'ON', offText: 'OFF', onColor: '#22c55e', offColor: '#cbd5e1', showText: true, align: 'center', fontSize: 0, bg: '', fg: '#1f2937', border: false, radius: 0 }),
    propSchema: [P.onText(), P.offText(), P.onColor(), P.offColor(), { key: 'showText', label: () => tt('scada.prop.showText'), type: 'boolean' }, P.align(), P.fontSize(), P.border(), P.radius(), P.bg(), P.fg()],
    component: TextSwitch
  }),
  def('radio', {
    defaultSize: { w: 160, h: 100 },
    defaultProps: () => ({ items: '', layout: 'vertical', activeColor: '#2563eb', fontSize: 0, bg: '', fg: '#1f2937', border: false, radius: 0 }),
    propSchema: [P.items(), P.layout(), { key: 'activeColor', label: () => tt('scada.prop.activeColor'), type: 'color' }, P.fontSize(), P.border(), P.radius(), P.bg(), P.fg()],
    component: RadioGroup
  }),
  def('checkbox', {
    defaultSize: { w: 160, h: 44 },
    defaultProps: () => ({ label: '', activeColor: '#2563eb', align: 'left', fontSize: 0, bg: '', fg: '#1f2937', border: false, radius: 0 }),
    propSchema: [
      { key: 'label', label: () => tt('scada.prop.label'), type: 'text', placeholder: () => tt('scada.prop.labelAuto') },
      { key: 'activeColor', label: () => tt('scada.prop.activeColor'), type: 'color' },
      P.align(), P.fontSize(), P.border(), P.radius(), P.bg(), P.fg()
    ],
    component: CheckBox
  })
]

export { IOField, DateTimeField, ActionButton, BitButton, WordButton, BitStatus, WordStatus, TextList, TextSwitch, RadioGroup, CheckBox, DATE_FORMATS }
