
import { DropdownProps, NButton, NDropdown } from "naive-ui";
import { defineComponent, ref, computed, watch, onUnmounted, reactive, PropType, } from "vue";
import activeImg from '@/assets/LineDspButton_inactive.png'
import { useMain } from "@/store";
import { storeToRefs } from "pinia";
import { useRealTimeStore } from "@/store/realtime";
import { EccDataSource, useEccStore } from "@/store/ecc";
import { menuIdSplit, menuPropEnum } from "../curcev/enum";
import { DataGroupEntity, menuOption } from "~/me";
import { useConfigStore } from "@/store/config";
import { buildMenuOpt, sleep } from "@/utils/utils";
import { RightValueType } from "../RightValueBlock";
import { DeviceClassEnum, DeviceClassHasShapeList } from "../config/devConfigNew/enum";
import { useMyI18n } from "@/hooks/useMyI18n";


export default defineComponent({
  name: 'MenuBtn',
  props: {
    propName: {
      type: String as PropType<keyof EccDataSource>,
      required: true
    }
  },
  setup(props, ctx) {
    const store = useMain()
    const eccStore = useEccStore()
    const configStore = useConfigStore()
    const realtimeStore = useRealTimeStore()
    const { t, i18nStore } = useMyI18n()
    const alldata = reactive({
      menuOpt: [] as DropdownProps['options'],
      menuShow: true,
      curOption: {} as RightValueType
    })
    watch(() => eccStore.curEccMenuOption, (val) => {
      if (!val || !val[props.propName]) return
      alldata.curOption = val[props.propName] as RightValueType
    }, {
      immediate: true
    })
    const flashMenu = () => {
      alldata.menuShow = false
      sleep(50).then(() => {
        alldata.menuShow = true
      })
    }

    // 强制依赖 langChangeCount 以在语言切换时重新计算
    const langKey = computed(() => {
      const _ = i18nStore.langChangeCount
      return i18nStore.language
    })
    const dataSourceList = computed(() => configStore.showDataAdressList.filter(e => Number(e.DeviceClass) == DeviceClassEnum.Ecc).map(e => {
      let res = {
        ...buildMenuOpt(e, configStore, true),
        // children: e.children?.map(ee => buildMenuOpt(ee))
      }
      flashMenu()
      return res
    }))

    // const renderLabel: DropdownProps['renderLabel'] = (option) => {
    //   if (!option.trueKey && option.GId) {
    //     option.trueKey = option.GId
    //     option.label = option.DataName
    //   }
    //   let text = option.label
    //   if (option.trueKey && eccStore.curEccMenuOption?.GId == option.trueKey) {
    //     text += ' ✔️'
    //   }

    //   return (
    //     <span>{text}</span>
    //   )
    // }
    // const nodeProps = () => {
    //   return {
    //     style: {
    //       minWidth: '14vh',
    //       fontSize: '1.5rem'
    //     }
    //   }
    // }

    const handleMenuSelect: DropdownProps['onSelect'] = (val, option) => {
      console.log("🪵 [RightValueBlock.tsx:103] ~ token ~ \x1b[0;32mval\x1b[0m = ", val, option);
      let opt = option as any
      let dat: RightValueType = {
        label: opt.DataName,
        title: '',
        value: 0.00000,
        GId: opt.GId,
        unit: opt.Unit,
        Precision: opt.Precision
      }
      alldata.curOption = dat
      let optObj = { ...eccStore.curEccMenuOption }
      optObj[props.propName] = dat
      eccStore.setCurEccMenuOption(optObj)
      // let list: menuOption[] = curCevInnerData.infoList

      // store.addRightBlockData(option, props.x, props.y)
    }


    return () => {
      const _ = langKey.value

      return (
        <div>
          <NDropdown options={dataSourceList.value}
            nodeProps={(option: any) => {
              return {
                style: 'font-size: 1.4rem; width: 12vw;'
              }
            }}
            trigger="click" onSelect={handleMenuSelect} size={'large'} class={'text-lg'}  >
            <NButton style={{ backgroundImage: `url(${activeImg})`, backgroundSize: '100% 100%', color: '#534d62' }} secondary strong={true} type="default" size={'large'} class={'h-10 min-w-[110px] shrink mr-2 '} >   <span class={'text-lg text-ellipsis overflow-hidden'}>{alldata.curOption.label || t('menu.chooseData')}</span>
            </NButton>
            {/* <div class={'p-2 border border-gray-400 border-solid'}>
              <span class={'text-lg'}>选择数据</span>
            </div> */}
          </NDropdown>
        </div>

      )
    }
  }

})
