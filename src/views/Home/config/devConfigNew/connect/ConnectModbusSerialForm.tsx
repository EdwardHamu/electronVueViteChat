import { computed, defineComponent, onMounted, reactive, Ref, ref, watch } from "vue";
import { formListItem, MyFormWrap, MyFormWrapIns } from "@/components/MyFormWrap/MyFormWrap";
import { commonFormItemListMap, propNameEnum, refreshCommonFormItemListMap } from "../../devConfig/enum";
import { useMyI18n } from "@/hooks/useMyI18n";

export type ConnectFormIns = {
  myFormRef: Ref<MyFormWrapIns>,
}

const buildOptions = (values: Array<string | number>) => values.map((value) => ({
  label: value,
  value,
}))

export default defineComponent({
  name: 'ConnectModbusSerialForm',
  props: {
    show: Boolean,
    updateShowFn: Function,
    connectStr: String,
    updateParentFn: Function,
    getFormRefFn: Function
  },
  setup(props, ctx) {
    const { i18nStore } = useMyI18n()
    const myFormRef = ref<MyFormWrapIns>()
    const connectStr = computed(() => props.connectStr)
    const alldata = reactive({
      form: {} as Record<string, any>
    })
    const optionMap: any = reactive({})

    const buildOptionMap = () => ({
      [propNameEnum.BaudRate]: buildOptions([4800, 9600, 19200, 38400, 57600, 115200]),
      [propNameEnum.DataBits]: buildOptions([8, 7]),
      [propNameEnum.StopBits]: buildOptions([1, 2]),
      [propNameEnum.Parity]: buildOptions(['N', 'O', 'E', 'M', 'S']),
      [propNameEnum.Endian32bit]: buildOptions(['3412', '1234', '2143', '4321']),
      [propNameEnum.Endian16bit]: buildOptions(['12', '21']),
      [propNameEnum.EndianString]: buildOptions(['12', '21']),
    })

    const buildItemList = (): formListItem[] => [
      commonFormItemListMap[propNameEnum.PortName],
      commonFormItemListMap[propNameEnum.BaudRate],
      commonFormItemListMap[propNameEnum.DataBits],
      commonFormItemListMap[propNameEnum.StopBits],
      commonFormItemListMap[propNameEnum.Parity],
      commonFormItemListMap[propNameEnum.SlaveId],
      commonFormItemListMap[propNameEnum.Cycle],
      commonFormItemListMap[propNameEnum.Timeout],
      commonFormItemListMap[propNameEnum.Endian32bit],
      commonFormItemListMap[propNameEnum.Endian16bit],
      commonFormItemListMap[propNameEnum.EndianString],
    ]

    const buildDefaultForm = () => ({
      PortName: 'COM1',
      BaudRate: 9600,
      DataBits: 8,
      StopBits: 1,
      Parity: 'N',
      SlaveId: 1,
      Cycle: 100,
      Timeout: 500,
      Endian32bit: '3412',
      Endian16bit: '12',
      EndianString: '21',
    })

    const itemList = ref<formListItem[]>(buildItemList())

    const refreshFormConfig = () => {
      refreshCommonFormItemListMap()
      Object.assign(optionMap, buildOptionMap())
      itemList.value = buildItemList()
    }

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
