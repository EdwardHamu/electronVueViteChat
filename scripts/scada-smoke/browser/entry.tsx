/**
 * 真浏览器验证用的入口（可选，不参与 tsc / 构建）：把数据组态页挂进一个模拟应用布局的页面——
 * 左 3/4 = 标签栏 + 组态页，右 1/4 = 右侧数值区（用来确认全屏能盖住它们）。
 * @/store、@/store/config、@/utils/callm 用冒烟测试的桩（build.mjs 里替换）；没有宿主桥，用「模拟信号」数据源即可。
 * window.__t 暴露 { scada, main, canvasView, widgetDefinitions, pinia } 供 Playwright 脚本直接读写。
 */
import { createPinia } from 'pinia'
import { NConfigProvider, NMessageProvider, useMessage, zhCN } from 'naive-ui'
import { createApp, defineComponent } from 'vue'
import i18n from '@/i18n'
import { useMain } from '@/store'
import Scada from '@/views/Home/scada'
import { canvasView } from '@/views/Home/scada/Canvas'
import { widgetDefinitions } from '@/views/Home/scada/registry'
import { useScadaStore } from '@/views/Home/scada/store'

const pinia = createPinia()
const Inner = defineComponent({
  setup() {
    ;(window as any).$message = useMessage()
    return () => (
      // NConfigProvider 会包一层没有高度的 div，所以根节点直接用 100vh
      <div class={'w-full flex flex-col overflow-hidden'} style={{ height: '100vh' }} id="indexCon">
        <div class={'h-full flex overflow-hidden'}>
          <div class={'w-3/4 flex flex-col'}>
            <div style={{ height: '50px', background: '#dde1e8', display: 'flex', alignItems: 'center', gap: '16px', padding: '0 12px', fontSize: '16px' }} data-fake-tabs>
              <span>实时数据</span>
              <span>趋势图</span>
              <span>统计图</span>
              <span style={{ color: '#2563eb' }}>数据组态</span>
            </div>
            <div class={'flex-1 min-h-0'}>
              <div class={'h-full'}>
                <Scada />
              </div>
            </div>
          </div>
          <div class={'w-1/4'} style={{ background: '#f3f4f6', padding: '12px' }} data-fake-right>
            右侧数值区（RightValueBlock）
          </div>
        </div>
      </div>
    )
  }
})
const Root = defineComponent({
  setup: () => () => (
    <NConfigProvider locale={zhCN}>
      <NMessageProvider>
        <Inner />
      </NMessageProvider>
    </NConfigProvider>
  )
})
createApp(Root).use(pinia).use(i18n).mount('#app')
;(window as any).__t = { scada: useScadaStore(pinia), main: useMain(pinia), canvasView, widgetDefinitions, pinia }
