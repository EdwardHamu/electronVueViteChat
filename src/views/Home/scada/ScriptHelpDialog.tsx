/**
 * 脚本帮助弹窗（任务：js 脚本相关的功能说明全部集中到这里）：
 * 左侧章节目录 + 右侧章节内容，全局脚本 / 数据处理函数弹窗里原先的内联说明文字已移除，
 * 统一从各处的「帮助」按钮打开本弹窗（openScriptHelp 可指定落在哪一章）。
 * 状态是模块级的：任何组件 import openScriptHelp 即可打开，弹窗实例挂在 scada/index.tsx。
 */
import { NModal, NScrollbar } from 'naive-ui'
import { defineComponent, reactive } from 'vue'
import { tt } from './widgets/common'

export interface HelpChapter {
  key: string
  /** 章节标题 locale key */
  titleKey: string
  /** 内容 locale key 列表（多段拼接，段间空行） */
  textKeys: string[]
}

export const HELP_CHAPTERS: HelpChapter[] = [
  { key: 'global', titleKey: 'scada.scriptHelp.chGlobal', textKeys: ['scada.panel.scriptHint', 'scada.panel.scriptWhen'] },
  { key: 'transform', titleKey: 'scada.scriptHelp.chTransform', textKeys: ['scada.panel.transformHint'] },
  { key: 'editor', titleKey: 'scada.scriptHelp.chEditor', textKeys: ['scada.scriptHelp.editorText'] },
  { key: 'variables', titleKey: 'scada.scriptHelp.chVariables', textKeys: ['scada.scriptHelp.variablesText'] }
]

export const scriptHelp = reactive({ show: false, chapter: 'global' })
/** 打开脚本帮助弹窗，可指定章节（global / transform / editor / variables） */
export const openScriptHelp = (chapter?: string) => {
  if (chapter && HELP_CHAPTERS.some(c => c.key === chapter)) scriptHelp.chapter = chapter
  scriptHelp.show = true
}

export default defineComponent({
  name: 'ScadaScriptHelpDialog',
  setup() {
    return () => {
      const cur = HELP_CHAPTERS.find(c => c.key === scriptHelp.chapter) || HELP_CHAPTERS[0]
      return (
        <NModal
          show={scriptHelp.show}
          preset="card"
          title={tt('scada.scriptHelp.title')}
          closable
          maskClosable
          autoFocus={false}
          style={{ width: 'min(780px, 96vw)' }}
          contentStyle={{ padding: '0' }}
          onUpdateShow={(v: boolean) => (scriptHelp.show = v)}
        >
          <div class={'flex'} style={{ height: 'min(480px, 64vh)' }} data-script-help>
            {/* 左侧章节目录 */}
            <div class={'w-[150px] shrink-0 border-0 border-r border-solid border-gray-200 py-2 bg-gray-50'}>
              {HELP_CHAPTERS.map(c => (
                <div
                  key={c.key}
                  data-help-chapter={c.key}
                  class={[
                    'px-3 py-2 text-xs cursor-pointer leading-4 border-0 border-l-2 border-solid',
                    c.key === cur.key ? 'bg-white text-[#4d75a1] font-bold border-[#4d75a1]' : 'text-gray-600 border-transparent hover:bg-gray-100'
                  ]}
                  onClick={() => (scriptHelp.chapter = c.key)}
                >
                  {tt(c.titleKey)}
                </div>
              ))}
            </div>
            {/* 右侧章节内容 */}
            <NScrollbar class={'flex-1 min-w-0'}>
              <div class={'px-4 py-3'}>
                <div class={'text-sm font-bold text-gray-700 mb-2'}>{tt(cur.titleKey)}</div>
                {cur.textKeys.map(k => (
                  <div key={k} class={'text-xs text-gray-600 leading-5 whitespace-pre-line mb-3 selectable-text'}>
                    {tt(k)}
                  </div>
                ))}
              </div>
            </NScrollbar>
          </div>
        </NModal>
      )
    }
  }
})
