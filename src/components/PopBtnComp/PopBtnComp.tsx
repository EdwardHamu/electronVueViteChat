import { NTabs, NTabPane, NPopselect, NButton, NIcon, PopselectProps, popselectProps, NDropdown, dropdownProps } from "naive-ui";
import { computed, defineComponent, onMounted, onUnmounted, ref } from "vue";
import activeImg from '@/assets/LineDspButton_inactive.png'
import { useMyI18n } from "@/hooks/useMyI18n";
import { watch } from "original-fs";
import classNames from "classnames";
import { useMain } from "@/store";
export default defineComponent({
  name: 'BtnComp',
  props: {
    name: String,
    clickFn: {
      type: Function,
    },
    ...dropdownProps
  },
  setup(props, ctx) {
    const store = useMain()
    const { t, i18nStore, locale } = useMyI18n()
    let { name, ...pop } = props
    const dropProps = computed(() => {
      let { name, ...pop } = props
      return pop
    })
    onMounted(() => {
      // console.log("🪵 [PopBtnComp.tsx:15] ~ token ~ \x1b[0;32monMounted\x1b[0m = ", 'BtnComp重新挂在');

    })
    return () => {
      return (
        // <NDropdown options={commonData.menuOpt} renderLabel={renderLabel} onSelect={handleSelect} trigger="click" placement="bottom-start" size={'large'} class={'text-2xl'} nodeProps={nodeProps} ></NDropdown>
        <div class={' basis-[20%] min-w-0'}>
          <NDropdown  {...dropProps.value} trigger="click" size={'large'} class={'text-2xl my-pop-select btm-menu'}
            nodeProps={(option: any) => {
              return {
                // class: 'w-[17vw]',
                style: 'min-width: 17vw; font-size: 1.4rem;'
              }
            }
            }
          >
            <div class={'mr-2'} title={props.name} >
              <NButton secondary strong={true} onClick={() => { props.clickFn && props.clickFn() }} type="primary" size={'large'} class={'h-16  w-full '} style={{ backgroundImage: `url(${activeImg})`, backgroundSize: '100% 100%', color: '#534d62' }}
                v-slots={{
                  icon: () => {
                    return <NIcon class={'text-3xl'}>
                      {ctx.slots.icon && ctx.slots.icon()}
                    </NIcon>
                  }
                }} >
                <span class={'text-2xl ml-2  w-full ' + classNames({ 'truncate ': locale.value !== 'zh-CN', 'text-xl': !store.isLandscape })} >{props.name}</span>
              </NButton>
            </div>

          </NDropdown>
        </div>
      )
    }
  }
})
