import { DropdownProps, NButton, NDropdown } from "naive-ui";
import { defineComponent, computed, watch, reactive, PropType } from "vue";
import activeImg from '@/assets/LineDspButton_inactive.png'
import { useLineShapeStore, LineShapeDataSource } from "@/store/lineShape";
import { useConfigStore } from "@/store/config";
import { buildMenuOpt, sleep } from "@/utils/utils";
import { RightValueType } from "../RightValueBlock";
import { DeviceClassEnum } from "../config/devConfigNew/enum";
import { useMyI18n } from "@/hooks/useMyI18n";

export default defineComponent({
  name: 'LineShapeMenuBtn',
  props: {
    propName: {
      type: String as PropType<keyof LineShapeDataSource>,
      required: true
    }
  },
  setup(props, ctx) {
    const lineShapeStore = useLineShapeStore()
    const configStore = useConfigStore()
    const alldata = reactive({
      menuShow: true,
      curOption: {} as RightValueType
    })
    const { t } = useMyI18n()

    watch(() => lineShapeStore.curLineShapeMenuOption, (val) => {
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

    // 数据类型都属于 DeviceClassEnum.OD
    const dataSourceList = computed(() => configStore.showDataAdressList.filter(e => Number(e.DeviceClass) == DeviceClassEnum.OD).map(e => {
      let res = {
        ...buildMenuOpt(e, configStore, true),
      }
      flashMenu()
      return res
    }))

    const handleMenuSelect: DropdownProps['onSelect'] = (val, option) => {
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
      let optObj = { ...lineShapeStore.curLineShapeMenuOption }
      optObj[props.propName] = dat
      lineShapeStore.setCurLineShapeMenuOption(optObj)
    }

    return () => {
      return (
        <div>
          <NDropdown options={dataSourceList.value}
            nodeProps={(option: any) => {
              return {
                style: 'font-size: 1.4rem; width: 12vw;'
              }
            }}
            trigger="click" onSelect={handleMenuSelect} size={'large'} class={'text-lg'}>
            <NButton style={{ backgroundImage: `url(${activeImg})`, backgroundSize: '100% 100%', color: '#534d62' }} secondary strong={true} type="default" size={'large'} class={'h-10 min-w-[110px] shrink mr-2'}>
              <span class={'text-lg text-ellipsis overflow-hidden'}>{alldata.curOption.label || t('menu.chooseData')}</span>
            </NButton>
          </NDropdown>
        </div>
      )
    }
  }
})
