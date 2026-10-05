/**
 * 「组件属性」浮窗（共享组件）：触发按钮 + 浮窗展示当前组件对象的 JSON 快照。
 * 用在数据处理函数弹窗的工具栏和属性面板右上角。
 *
 * 快照是「打开时冻结」的而不是实时渲染：数据源每秒轮询、runtimeOverrides 跟着变，
 * 实时渲染会每秒重写文本节点、销毁用户刚拖出来的选区；想看最新值点「刷新」。
 * pre 挂 selectable-text 类：main.js 的全局 onselectstart 防误选白名单据此放行鼠标选中复制。
 */
import { NButton, NPopover, NScrollbar } from 'naive-ui'
import { defineComponent, ref, type PropType } from 'vue'
import { runtimeOverrides } from './runtime'
import type { WidgetInstance } from './types'
import { tt } from './widgets/common'

export default defineComponent({
  name: 'ScadaWidgetPropsPopover',
  props: {
    widget: { type: Object as PropType<WidgetInstance | undefined>, default: undefined },
    /** 浮窗弹出方向：数据处理函数弹窗里向右弹，属性面板在屏幕右缘、向左弹 */
    placement: { type: String, default: 'right-start' },
    /** 触发按钮尺寸 */
    size: { type: String as PropType<'tiny' | 'small'>, default: 'small' }
  },
  setup(props) {
    const snapshotText = ref('')

    /** 当前组件对象快照：布局字段 + props + 运行时覆盖（ctx.setProp 的效果） */
    const widgetSnapshot = () => {
      const w = props.widget
      if (!w) return null
      const snap: Record<string, unknown> = {
        id: w.id,
        type: w.type,
        title: w.title || '',
        x: w.x, y: w.y, w: w.w, h: w.h,
        hidden: !!w.hidden,
        binding: w.binding || null,
        props: w.props
      }
      const ov = runtimeOverrides[w.id]
      if (ov && Object.keys(ov).length) snap.runtimeOverrides = ov
      return snap
    }
    const refreshSnapshot = () => {
      snapshotText.value = JSON.stringify(widgetSnapshot(), null, 2)
    }

    /** 一键复制（复制的是浮窗里当前显示的快照） */
    const copySnapshot = () => {
      const text = snapshotText.value || JSON.stringify(widgetSnapshot(), null, 2)
      const done = () => {
        const m = window.$message as unknown as { success?: (t: string) => void } | undefined
        m && m.success && m.success(tt('config.copySuccess'))
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done).catch(() => {})
      } else {
        const ta = document.createElement('textarea')
        ta.value = text
        document.body.appendChild(ta)
        ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
        done()
      }
    }

    return () => (
      <NPopover
        trigger="click"
        placement={props.placement as never}
        disabled={!props.widget}
        style={{ padding: '0' }}
        onUpdateShow={(v: boolean) => {
          if (v) refreshSnapshot()
        }}
      >
        {{
          trigger: () => (
            <NButton size={props.size} disabled={!props.widget} data-widget-props>
              {tt('scada.panel.transformProps')}
            </NButton>
          ),
          default: () => (
            <div style={{ width: '380px' }}>
              <div class={'flex items-center justify-end gap-1 px-2 pt-1'}>
                <NButton size="tiny" quaternary onClick={refreshSnapshot}>
                  {tt('scada.panel.transformPropsRefresh')}
                </NButton>
                <NButton size="tiny" quaternary onClick={copySnapshot}>
                  {tt('config.copy')}
                </NButton>
              </div>
              <NScrollbar style={{ maxHeight: '320px' }}>
                <pre
                  class={'transform-props-pre selectable-text m-0 px-3 pb-2 pt-1 text-xs leading-5'}
                  style={{
                    fontFamily: 'ui-monospace, Consolas, monospace',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all',
                    cursor: 'text'
                  }}
                  onMousedown={(e: MouseEvent) => e.stopPropagation()}
                >
                  {snapshotText.value}
                </pre>
              </NScrollbar>
            </div>
          )
        }}
      </NPopover>
    )
  }
})
