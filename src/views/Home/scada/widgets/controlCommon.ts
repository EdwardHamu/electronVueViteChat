/**
 * 控制与显示类组件共用的小工具：可写判断 / 写入、开关量判定、选项列表解析、共享秒表
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { canWrite, writeBinding } from '../dataSource'
import type { DataPoint, WidgetInstance, WriteValue } from '../types'
import { tt } from './common'

export interface ControlProps {
  widget: WidgetInstance
  point?: DataPoint
  editing: boolean
}

const notify = (kind: 'warning' | 'error' | 'success', text: string) => {
  const m = (typeof window !== 'undefined' ? (window as any).$message : null) as Record<string, (t: string) => void> | null
  if (m && typeof m[kind] === 'function') m[kind](text)
}

/**
 * 控制组件的写入封装：编辑模式不响应；绑定不可写（未绑定 / 数据源只读）时提示；
 * 返回 writable（决定是否显示为可操作）与 write()
 */
export const useControl = (props: ControlProps) => {
  const writable = computed(() => canWrite(props.widget.binding))
  const interactive = computed(() => !props.editing && writable.value)
  const write = async (value: WriteValue) => {
    if (props.editing) return false
    if (!writable.value) {
      notify('warning', props.widget.binding ? tt('scada.widget.readonlyHint') : tt('scada.widget.unbound'))
      return false
    }
    try {
      await writeBinding(props.widget.binding, value)
      return true
    } catch (err) {
      console.warn('[scada] write failed', err)
      notify('error', tt('scada.widget.writeFailed'))
      return false
    }
  }
  return { writable, interactive, write, notify }
}

/** 开关量判定：数值非 0 为开；只有文本时 "1"/"true"/"on" 为开 */
export const pointOn = (point?: DataPoint) => {
  if (!point) return false
  if (point.value !== null && point.value !== undefined) return point.value !== 0
  const t = (point.text || '').trim().toLowerCase()
  return t === '1' || t === 'true' || t === 'on'
}

export interface ChoiceItem {
  value: string
  label: string
  color?: string
}

/**
 * 解析选项列表文本，一行一项："值=文字|颜色"、"值=文字" 或只写 "文字"（值为行号）。
 * 例：0=停止|#9ca3af
 */
export const parseChoices = (text: string): ChoiceItem[] => {
  const out: ChoiceItem[] = []
  String(text || '')
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean)
    .forEach((line, i) => {
      let value = String(i)
      let rest = line
      const eq = line.indexOf('=')
      if (eq > -1) {
        value = line.slice(0, eq).trim()
        rest = line.slice(eq + 1)
      }
      const bar = rest.lastIndexOf('|')
      let color: string | undefined
      let label = rest
      if (bar > -1) {
        color = rest.slice(bar + 1).trim() || undefined
        label = rest.slice(0, bar)
      }
      out.push({ value, label: label.trim() || value, color })
    })
  return out
}

/** 当前数据点对应的选项：优先按数值相等，其次按文本相等 */
export const matchChoice = (items: ChoiceItem[], point?: DataPoint) => {
  if (!point) return undefined
  if (point.value !== null && point.value !== undefined) {
    const v = point.value
    const hit = items.find(it => Number(it.value) === v)
    if (hit) return hit
  }
  if (point.text !== undefined) return items.find(it => it.value === point.text)
  return undefined
}

/** 选项值写回数据源：能转成数字就写数字 */
export const choiceValue = (item: ChoiceItem): WriteValue => {
  const n = Number(item.value)
  return item.value.trim() !== '' && Number.isFinite(n) ? n : item.value
}

/** 字号：props.fontSize > 0 用固定值，否则按组件高度估算 */
export const fontSizeOf = (widget: WidgetInstance, ratio = 0.4, min = 11, max = 72) => {
  const fs = Number(widget.props.fontSize)
  if (fs > 0) return fs
  return Math.max(min, Math.min(max, Math.round(widget.h * ratio)))
}

// ---------------------------------------------------------------- 共享秒表（日期时间域用，多个实例共用一个定时器）
const nowRef = ref(Date.now())
let tickTimer: ReturnType<typeof setInterval> | null = null
let tickUsers = 0
export const useClock = () => {
  onMounted(() => {
    if (tickUsers++ === 0) {
      nowRef.value = Date.now()
      tickTimer = setInterval(() => (nowRef.value = Date.now()), 1000)
    }
  })
  onBeforeUnmount(() => {
    if (--tickUsers <= 0) {
      tickUsers = 0
      if (tickTimer) clearInterval(tickTimer)
      tickTimer = null
    }
  })
  return nowRef
}

const pad = (n: number) => (n < 10 ? '0' + n : String(n))
/** 简单日期格式化：YYYY MM DD HH mm ss */
export const formatDate = (ts: number, fmt: string) => {
  const d = new Date(ts)
  return fmt
    .replace(/YYYY/g, String(d.getFullYear()))
    .replace(/MM/g, pad(d.getMonth() + 1))
    .replace(/DD/g, pad(d.getDate()))
    .replace(/HH/g, pad(d.getHours()))
    .replace(/mm/g, pad(d.getMinutes()))
    .replace(/ss/g, pad(d.getSeconds()))
}
