/**
 * 应用内虚拟键盘。
 *
 * 输入方式：键盘顶部有一个自己的输入区。点击页面上的输入框弹出键盘时（src/utils/utils.ts 的 listenAllInputFocus，
 * 是否弹出由系统配置 InputType 决定），把该输入框现有的内容带入输入区；之后所有按键（以及实体键盘 / 输入法）只编辑输入区，
 * 按回车（键盘上的 ↩︎ 或实体键盘 Enter）才把输入区的内容覆盖写入真正的输入框（writeValueToInput），✕ / Esc 放弃修改。
 * 目标输入框是数字输入框（NInputNumber 内部 <input> 带 data-num-input 标记，见 utils/virtualKeyboard.ts）时自动切到数字键盘。
 *
 * 以前的做法是每按一个键就经宿主 JsBridge 模拟一次系统按键（KeyPress）打到目标输入框里，现在不再调用宿主。
 */
import { NIcon } from "naive-ui";
import { defineComponent, onMounted, onBeforeUnmount, watch, ref, nextTick, computed, reactive } from "vue";
import { useMain } from "@/store";
import { useConfigStore } from "@/store/config";
import Keyboard from "simple-keyboard";
import "simple-keyboard/build/css/index.css";
import classnames from "classnames";
import { CloseTwotone } from "@vicons/material";
import { installFocusTrapBypass, isNumberInput, isTouchKeyboardEnabled, KEYBOARD_ROOT_CLASS, writeValueToInput } from "@/utils/virtualKeyboard";
import { isKeyboardSuppressed } from "@/utils/utils";

type AreaEl = HTMLInputElement | HTMLTextAreaElement

export default defineComponent({
  name: 'GlobalKeyBoard',
  setup() {
    const store = useMain()
    const configStore = useConfigStore()
    const commonData = reactive({
      isCapLock: false,
      /** Shift：只对下一个字符生效 */
      isShift: false,
      isNum: false,
      /** 目标是密码框：输入区也遮住 */
      isPassword: false,
      /** 目标是多行文本框：输入区用 textarea（保留换行） */
      isTextarea: false,
      /** 目标输入框的 maxlength（没有 = undefined） */
      maxLength: undefined as number | undefined,
    })
    /** 输入区的内容（回车时写回目标输入框） */
    const areaValue = ref('')
    const keyborardShow = computed(() => store.globalKeyBoardShow)
    const isMounted = ref(false)
    const areaRef = ref<AreaEl>()
    let keyboardIns: Keyboard | undefined

    const layoutName = () => (commonData.isNum ? 'num' : commonData.isCapLock !== commonData.isShift ? 'lock' : 'default')
    const applyLayout = () => {
      keyboardIns?.setOptions({ layoutName: layoutName() })
    }

    /** 输入区当前的选区（没聚焦 / 取不到时视为光标在末尾） */
    const areaSelection = () => {
      const el = areaRef.value
      const len = areaValue.value.length
      if (!el || document.activeElement !== el) return { start: len, end: len }
      const start = el.selectionStart ?? len
      const end = el.selectionEnd ?? start
      return { start: Math.min(start, end), end: Math.max(start, end) }
    }
    /** 更新输入区内容与光标，并同步给 simple-keyboard（它按自己记录的光标位置插入字符） */
    const setArea = (value: string, caret: number = value.length) => {
      areaValue.value = value
      const el = areaRef.value
      if (el) {
        if (el.value !== value) el.value = value
        if (document.activeElement === el) {
          try {
            el.setSelectionRange(caret, caret)
          } catch {
            /* 个别 input type 不支持选区 */
          }
        }
      }
      if (keyboardIns) {
        keyboardIns.setInput(value)
        keyboardIns.setCaretPosition(caret)
      }
    }
    /** 聚焦输入区并全选带入的内容：直接输入即可整体替换，无需先清空；选区同步给 simple-keyboard（虚拟按键也按替换选区处理） */
    const focusArea = () => {
      const el = areaRef.value
      if (!el || !keyborardShow.value) return
      el.focus({ preventScroll: true })
      const len = areaValue.value.length
      try {
        el.setSelectionRange(0, len)
      } catch {
        /* 个别 input type 不支持选区 */
      }
      keyboardIns?.setCaretPosition(0, len)
    }

    /**
     * 点击输入框打开键盘时，focusin 发生在 mousedown 阶段，loadFromTarget 的 nextTick 聚焦输入区后，
     * naive 的 NInput / NInputNumber 在随后的 click 阶段会把焦点再 focus() 回它内部的 input，
     * 键盘输入区刚拿到的焦点又被抢走（数字输入框 NInputNumber 必现）。
     * 这里在本次点击手势结束（pointerup → click 处理完）之后把焦点补回输入区；
     * 非指针方式触发（没有 pointerup）时用定时器兜底。只在焦点确实不在输入区时才补。
     */
    let cancelRefocus: (() => void) | undefined
    const scheduleRefocusAfterClick = () => {
      cancelRefocus?.()
      const tryRefocus = () => {
        const el = areaRef.value
        if (keyborardShow.value && el && document.activeElement !== el) focusArea()
      }
      let t1: ReturnType<typeof setTimeout> | undefined
      const onPointerUp = () => {
        // click 在 pointerup 之后同步派发，setTimeout(0) 保证排在 naive 的 click 聚焦之后
        t1 = setTimeout(tryRefocus, 0)
      }
      document.addEventListener('pointerup', onPointerUp, { once: true, capture: true })
      const t2 = setTimeout(() => {
        document.removeEventListener('pointerup', onPointerUp, true)
        tryRefocus()
      }, 200)
      cancelRefocus = () => {
        document.removeEventListener('pointerup', onPointerUp, true)
        if (t1) clearTimeout(t1)
        clearTimeout(t2)
        cancelRefocus = undefined
      }
    }

    /** 打开键盘：把目标输入框现有的内容带入输入区，数字输入框切到数字键盘 */
    const loadFromTarget = () => {
      const target = store.keyboardTarget
      commonData.isNum = !!target && isNumberInput(target)
      commonData.isPassword = !!target && target.tagName === 'INPUT' && (target as HTMLInputElement).type === 'password'
      commonData.isTextarea = !!target && target.tagName === 'TEXTAREA'
      commonData.isShift = false
      // 只认显式的 maxlength 属性（没有属性时各环境的 maxLength 默认值不同：Chromium -1，部分实现 524288）
      const maxAttr = target && target.hasAttribute('maxlength') ? Number(target.getAttribute('maxlength')) : NaN
      commonData.maxLength = Number.isInteger(maxAttr) && maxAttr > 0 ? maxAttr : undefined
      keyboardIns?.setOptions({ maxLength: commonData.maxLength })
      applyLayout()
      // 输入区的元素可能刚从 input 换成 textarea，等渲染完再写值、聚焦
      nextTick(() => {
        setArea(target ? String(target.value ?? '') : '')
        focusArea()
        // 点击打开的场景：click 阶段原输入框会把焦点抢回去，点击结束后再补一次聚焦
        scheduleRefocusAfterClick()
      })
    }

    /** 回车：把输入区内容覆盖写入真正的输入框并收起键盘 */
    const commit = () => {
      const target = store.keyboardTarget
      const value = areaValue.value
      if (target && target.isConnected && !target.disabled && !target.readOnly) {
        store.setKeyboardCommitting(true)
        try {
          writeValueToInput(target, value)
        } finally {
          store.setKeyboardCommitting(false)
        }
      }
      closeKeyboard()
    }
    /** 放弃输入区的修改 */
    const closeKeyboard = () => {
      store.setGlobalKeyBoardShow(false)
    }
    const resetVal = () => {
      setArea('')
    }
    /** 退格：有选区删选区，否则删光标前一个字符 */
    const backspace = () => {
      const { start, end } = areaSelection()
      const v = areaValue.value
      if (start !== end) setArea(v.slice(0, start) + v.slice(end), start)
      else if (start > 0) setArea(v.slice(0, start - 1) + v.slice(start), start - 1)
    }

    const onChange = (value: string) => {
      const caret = keyboardIns?.getCaretPosition()
      setArea(value, typeof caret === 'number' ? caret : value.length)
    }
    const onKeyPress = (button: string) => {
      switch (button) {
        case '{enter}':
          commit()
          return
        case '{esc}':
          closeKeyboard()
          return
        case '{bksp2}':
          backspace()
          return
        case '{reset}':
        case '{clear}':
          resetVal()
          return
        case '{123}':
        case '{abc}':
          commonData.isNum = !commonData.isNum
          commonData.isShift = false
          applyLayout()
          return
        case '{lock}':
          commonData.isCapLock = !commonData.isCapLock
          commonData.isShift = false
          applyLayout()
          return
        case '{shift}':
          commonData.isShift = !commonData.isShift
          applyLayout()
          return
      }
      // 普通字符（simple-keyboard 自己按光标位置插入，随后触发 onChange）；Shift 只管一个字符
      if (commonData.isShift && !button.startsWith('{')) {
        commonData.isShift = false
        applyLayout()
      }
    }

    /** 实体键盘 / 输入法直接在输入区里打字 */
    const onAreaInput = (e: Event) => {
      const el = e.target as AreaEl
      areaValue.value = el.value
      if (keyboardIns) {
        keyboardIns.setInput(el.value)
        keyboardIns.setCaretPosition(el.selectionStart ?? el.value.length)
      }
    }
    const onAreaKeydown = (e: KeyboardEvent) => {
      if (e.isComposing) return
      if (e.key === 'Enter' && !(commonData.isTextarea && e.shiftKey)) {
        e.preventDefault()
        commit()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        closeKeyboard()
      }
    }
    /** 点输入区移动光标：同步给 simple-keyboard */
    const syncCaretFromArea = () => {
      const el = areaRef.value
      if (el && keyboardIns) keyboardIns.setCaretPosition(el.selectionStart ?? areaValue.value.length, el.selectionEnd ?? undefined)
    }

    const winScale = computed(() => {
      let val = window.innerWidth / 1920 * 1.3
      if (val < 0.7 && store.isLandscape) {
        return 0.7
      }
      if (val < 0.8 && !store.isLandscape) {
        return 0.8
      }
      return val
    })

    const leftMove = computed(() => {
      let val = (window.innerWidth / 1920) * 440 * 1.5
      return -val
    })

    // 打开键盘、以及每次为某个输入框打开（同一个输入框再次打开、键盘开着时点了另一个输入框）都重新带入内容
    watch(() => [store.keyboardSeq, keyborardShow.value] as const, ([, show]) => {
      if (show) loadFromTarget()
    })
    // 回到被屏蔽的状态（数据组态 tab 激活时关掉了系统配置 / 产品配方 / 产品历史页面）：已经开着的键盘收起
    watch(() => isKeyboardSuppressed(store, configStore), (v) => {
      if (v && keyborardShow.value) closeKeyboard()
    })
    // 系统配置里关掉「触摸键盘输入」：已经开着的键盘也收起
    watch(() => configStore.sysConfig?.InputType, (v) => {
      if (keyborardShow.value && !isTouchKeyboardEnabled(v)) closeKeyboard()
    })

    let removeFocusTrapBypass: (() => void) | undefined
    onMounted(() => {
      // 弹窗（NModal / useDialog）的焦点陷阱不能把焦点从键盘输入区抢回去，否则会和键盘来回抢焦点卡死页面
      removeFocusTrapBypass = installFocusTrapBypass()
      isMounted.value = true
      nextTick(() => {
        keyboardIns = new Keyboard({
          mergeDisplay: true,
          theme: 'hg-theme-default hg-layout-default myTheme industrialKeyboardTheme',
          display: {
            '{bksp2}': '←',
            '{123}': '123',
            '{clear}': '清空',
            '{bksp}': '←',
            '{enter}': '↩︎',
            '{esc}': '❌',
            '{reset}': 'CE',
            '{abc}': 'abc'
          },
          layout: {
            'default': [
              '` 1 2 3 4 5 6 7 8 9 0 - = {bksp2}',
              'q w e r t y u i o p [ ] \\',
              '{lock} a s d f g h j k l ; \' {enter}',
              '{shift} z x c v b n m , . /',
              '{123} {space}'
            ],
            'lock': [
              '~ ! @ # $ % ^ & * ( ) _ + {bksp2}',
              'Q W E R T Y U I O P { } |',
              '{lock} A S D F G H J K L : " {enter}',
              '{shift} Z X C V B N M < > ?',
              '{123} {space}'
            ],
            'num': [
              '1 2 3',
              '4 5 6',
              '7 8 9',
              '. 0 -',
              '{abc} {bksp2} {enter}',
            ]
          },
          buttonTheme: [
            {
              class: "no-grow-style",
              buttons: "{bksp2} {123} {abc} {esc}"
            },
          ],
          onChange: input => onChange(input),
          onKeyPress: button => onKeyPress(button)
        });
        applyLayout()
        if (keyborardShow.value) loadFromTarget()
      })
    })
    onBeforeUnmount(() => {
      cancelRefocus?.()
      removeFocusTrapBypass?.()
      keyboardIns?.destroy()
      keyboardIns = undefined
    })

    /* 亮色工业风输入区：白色凹槽显示屏质感，等宽字体 + 钢蓝光标 */
    const areaStyle = {
      width: '100%',
      boxSizing: 'border-box' as const,
      fontSize: '22px',
      lineHeight: '30px',
      padding: '8px 12px',
      color: '#1f2933',
      background: '#ffffff',
      border: '1px solid #b9c2cc',
      borderRadius: '4px',
      boxShadow: 'inset 0 2px 4px rgba(71,85,105,0.16)',
      fontFamily: 'Consolas, Menlo, "Courier New", monospace',
      caretColor: '#4d75a1',
      outline: 'none',
      userSelect: 'text' as const,
      resize: 'none' as const,
    }

    const renderArea = () => {
      const common = {
        ref: areaRef,
        value: areaValue.value,
        style: areaStyle,
        'data-keyboard-area': '',
        autocomplete: 'off',
        spellcheck: false,
        maxlength: commonData.maxLength,
        onInput: onAreaInput,
        onKeydown: onAreaKeydown,
        onKeyup: syncCaretFromArea,
        onMouseup: syncCaretFromArea,
        onSelect: syncCaretFromArea,
        // 面板根元素 mousedown 时 preventDefault（按键不抢焦点），输入区要能点进去移动光标，所以这里拦住冒泡
        onMousedown: (e: MouseEvent) => e.stopPropagation(),
      }
      return commonData.isTextarea
        ? <textarea {...common} rows={2} />
        : <input {...common} type={commonData.isPassword ? 'password' : 'text'} inputmode={commonData.isNum ? 'decimal' : undefined} />
    }

    return () => {

      return (
        <div class={'absolute right-4 bottom-8 h-[10vh] w-[10vh] flex flex-col items-center justify-center'} onMousedown={(e) => { e.preventDefault() }} >
          {
            /* 不使用弹出 / 位移动画：面板直接 v-show 显示隐藏 */
            isMounted.value &&
            <>
              {/* 亮色工业风面板：铝面板浅灰、小圆角、细边框，不用毛玻璃 / 渐变 */}
              <div v-drag={'.global-keyboard-value'} data-num-mode={commonData.isNum ? 'true' : 'false'} style={{ zIndex: 3000, willChange: 'transform', contain: 'layout style paint', transform: `scale(${winScale.value})`, left: leftMove.value + 'px', background: '#e9edf1', border: '1px solid #c2cbd4', borderRadius: '8px', boxShadow: '0 16px 40px rgba(15,23,42,0.22), 0 4px 12px rgba(15,23,42,0.12)', padding: '0 10px 14px' }} class={classnames(KEYBOARD_ROOT_CLASS, 'absolute bottom-40 flex flex-col items-center justify-end', { 'w-[354px]': commonData.isNum, 'w-[1000px]': !commonData.isNum, 'h-[540px]': !commonData.isTextarea, 'h-[570px]': commonData.isTextarea })} v-show={keyborardShow.value}>
                {/* 标题栏：背景透明，底部分隔线用 borderBottom（2px 钢蓝）实现，不再用 boxShadow */}
                <div class={'w-full global-keyboard-value flex justify-between items-center shrink-0 drag-handle'} style={{ background: 'transparent', borderRadius: '8px 8px 0 0', padding: '8px 12px', marginBottom: '8px', borderBottom: '2px solid #4d75a1', cursor: 'move' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: commonData.isNum ? '#4d75a1' : '#22c55e', border: commonData.isNum ? '1px solid #3a5a7e' : '1px solid #15803d', boxShadow: commonData.isNum ? '0 0 6px rgba(77,117,161,0.7)' : '0 0 6px rgba(34,197,94,0.6)', display: 'inline-block', flexShrink: 0, boxSizing: 'border-box' as const }}></span>
                    <span style={{ color: '#5b6670', fontSize: '11px', letterSpacing: '0.22em', fontFamily: 'Consolas, Menlo, monospace', fontWeight: 700 as const, userSelect: 'none' as const }}>{commonData.isNum ? 'NUM PAD' : 'KEYBOARD'}</span>
                  </div>
                  <div data-keyboard-close style={{ background: '#eef1f4', border: '1px solid #c2cbd4', borderRadius: '4px', width: '26px', height: '26px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#5b6670', flexShrink: 0 }} onClick={closeKeyboard}>
                    <NIcon size={16}>  <CloseTwotone /> </NIcon>
                  </div>
                </div>
                {/* 输入区：带入目标输入框的内容，回车才写回 */}
                <div class={'w-full shrink-0 px-1 mb-2'}>
                  {renderArea()}
                </div>
                <div class={'simple-keyboard w-full h-full shrink'}></div>
              </div>
            </>
          }
        </div>
      )
    }
  },
})
