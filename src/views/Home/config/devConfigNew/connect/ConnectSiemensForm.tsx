import { computed, defineComponent, onMounted, reactive, Ref, ref, watch } from "vue";
import { formListItem, MyFormWrap, MyFormWrapIns } from "@/components/MyFormWrap/MyFormWrap";
import { commonFormItemListMap, propNameEnum, refreshCommonFormItemListMap } from "../../devConfig/enum";
import { useMyI18n } from "@/hooks/useMyI18n";

export type ConnectFormIns = {
  myFormRef: Ref<MyFormWrapIns>,
}

const PLC_MODELS = ["S200Smart", "S200", "S1200", "S1500", "S300", "S400"]

export default defineComponent({
  name: 'ConnectSiemensForm',
  props: {
    show: Boolean,
    updateShowFn: Function,
    connectStr: String,
    updateParentFn: Function,
    getFormRefFn: Function
  },
  setup(props, ctx) {
    const { t, i18nStore } = useMyI18n()
    const myFormRef = ref<MyFormWrapIns>()
    const connectStr = computed(() => props.connectStr)
    const alldata = reactive({
      form: {} as Record<string, any>
    })
    const optionMap = reactive<Record<string, any>>({})

    const buildPlcModelOptions = () => PLC_MODELS.map((model) => ({
      label: model,
      value: model,
    }))

    const buildItemList = (): formListItem[] => [
      { ...commonFormItemListMap[propNameEnum.PlcModel] },
      commonFormItemListMap[propNameEnum.Host],
      commonFormItemListMap[propNameEnum.Port],
      commonFormItemListMap[propNameEnum.Slot],
      commonFormItemListMap[propNameEnum.Rack],
      commonFormItemListMap[propNameEnum.Cycle],
      commonFormItemListMap[propNameEnum.Timeout],
    ]

    const buildDefaultForm = () => ({
      PlcModel: 'S200Smart',
      Host: '192.168.2.1',
      Port: 102,
      Slot: 0,
      Rack: 1,
      Cycle: 100,
      Timeout: 500,
    })

    const refreshFormConfig = () => {
      refreshCommonFormItemListMap()
      optionMap[propNameEnum.PlcModel] = buildPlcModelOptions()
      itemList.value = buildItemList()
    }

    const itemList = ref<formListItem[]>(buildItemList())

    ctx.expose({ myFormRef } as ConnectFormIns)

    watch(() => connectStr.value, (value) => {
      alldata.form = value ? { ...buildDefaultForm(), ...JSON.parse(value) } : buildDefaultForm()
    }, { immediate: true })

    watch(() => i18nStore.langChangeCount, refreshFormConfig)

    onMounted(() => {
      refreshFormConfig()
      props.getFormRefFn && props.getFormRefFn(myFormRef)
    })

    return () => (
      <MyFormWrap
        ref={myFormRef}
        optionMap={optionMap}
        hideBtn={true}
        form={alldata.form}
        labelWidth={150}
        itemList={itemList.value}
      ></MyFormWrap>
    )
  }
})
