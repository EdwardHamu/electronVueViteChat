import { computed, defineComponent, onMounted, reactive, Ref, ref, watch } from "vue";
import { formListItem, MyFormWrap, MyFormWrapIns } from "@/components/MyFormWrap/MyFormWrap";
import { commonMap2, refreshCommonMap2 } from "../../proto/proto";
import { commonFormItemListMap, propNameEnum, refreshCommonFormItemListMap } from "../../devConfig/enum";
import { DataAddressEntity } from "~/me";
import { useConfigStore } from "@/store/config";
import { callBrige } from "@/utils/callm";
import { callFnName } from "@/utils/enum";
import { useMyI18n } from "@/hooks/useMyI18n";

export type AddressFormIns = {
  myFormRef: Ref<MyFormWrapIns>,
}

const DATA_TYPE_LENGTH_MAP: Record<number, number> = {
  0: 1,
  1: 1,
  2: 2,
  3: 2,
  4: 2,
  6: 1,
}

const toNumber = (value: unknown, fallback: number) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export default defineComponent({
  name: 'ConnectModbusAddressForm',
  props: {
    getFormRefFn: Function,
    getSubmitFn: Function,
  },
  setup(props, ctx) {
    const { t, i18nStore } = useMyI18n()
    const configStore = useConfigStore()
    const myFormRef = ref<MyFormWrapIns>()
    const curRow = computed(() => configStore.curAddressRow)
    const addressStr = computed(() => configStore.curAddressRow?.AddressString || '')
    const isAdd = computed(() => configStore.addressFormIsAdd)
    const isAddMore = computed(() => configStore.isAdressAddMore)
    const alldata = reactive({
      form: {} as DataAddressEntity & Record<string, any>,
    })
    const optionMap = ref<Record<string, any>>({})

    const buildExchangeItem = (): formListItem => ({
      ...commonFormItemListMap[propNameEnum.Exchange],
      type: 'radio',
      radioType: 'btn',
      radioList: [
        { label: t('config.valueMultiplyThenAdd'), value: 0 },
        { label: t('config.valueAddThenMultiply'), value: 1 },
      ],
      rule: ['mustNum'],
    })

    const buildItemList = (): formListItem[] => [
      commonFormItemListMap[propNameEnum.Name],
      commonFormItemListMap[propNameEnum.Permission],
      commonFormItemListMap[propNameEnum.State],
      commonFormItemListMap[propNameEnum.SlaveId],
      commonFormItemListMap[propNameEnum.Area],
      commonFormItemListMap[propNameEnum.Index],
      commonFormItemListMap[propNameEnum.DataType],
      commonFormItemListMap[propNameEnum.Length],
      buildExchangeItem(),
      commonFormItemListMap[propNameEnum.Rate],
      commonFormItemListMap[propNameEnum.Offset],
    ]

    const itemList = ref<formListItem[]>(buildItemList())

    const buildDefaultForm = () => ({
      DeviceId: configStore.curDevConfigRow?.GId || '',
      Permission: 0,
      State: 1,
      AddressString: '',
      SlaveId: undefined,
      Area: 4,
      Index: 0,
      Length: 2,
      DataType: 4,
      Exchange: 0,
      Rate: 1,
      Offset: 0,
    })

    const submit = (data: any) => {
      const addressConfig = {
        SlaveId: data.SlaveId === '' || data.SlaveId === undefined || data.SlaveId === null
          ? null
          : toNumber(data.SlaveId, 1),
        Area: toNumber(data.Area, 4),
        Index: toNumber(data.Index, 0),
        Length: toNumber(data.Length, 2),
        DataType: toNumber(data.DataType, 4),
        Exchange: toNumber(data.Exchange, 0),
        Rate: toNumber(data.Rate, 1),
        Offset: toNumber(data.Offset, 0),
      }
      data.AddressString = JSON.stringify(addressConfig)
      callBrige(callFnName.SaveDataAddress, data).then(() => {
        window.$message.success(t('config.saveSuccess'))
        if (!isAddMore.value) {
          configStore.setAddressFormShow(false)
        } else {
          alldata.form.Name = ''
          alldata.form.Index = addressConfig.Index + addressConfig.Length
        }
        configStore.updateAdressRowFn && configStore.updateAdressRowFn()
      })
    }

    const refreshFormConfig = () => {
      refreshCommonFormItemListMap()
      const refreshedMap = refreshCommonMap2()
      optionMap.value = {
        ...refreshedMap,
        [propNameEnum.Area]: refreshedMap[propNameEnum.Area],
        [propNameEnum.DataType]: refreshedMap[propNameEnum.DataType],
        [propNameEnum.Permission]: commonMap2[propNameEnum.Permission],
      }
      itemList.value = buildItemList()
    }

    ctx.expose({ myFormRef } as AddressFormIns)

    watch(() => addressStr.value, (value) => {
      if (value && !isAdd.value) {
        alldata.form = { ...buildDefaultForm(), ...curRow.value, ...JSON.parse(value) }
      } else {
        alldata.form = buildDefaultForm()
      }
    }, { immediate: true })

    watch(() => alldata.form.DataType, (dataType) => {
      const length = DATA_TYPE_LENGTH_MAP[Number(dataType)]
      if (length !== undefined) {
        alldata.form.Length = length
      }
      itemList.value = buildItemList()
    })

    watch(() => i18nStore.langChangeCount, refreshFormConfig)

    onMounted(() => {
      refreshFormConfig()
      props.getFormRefFn && props.getFormRefFn(myFormRef)
      props.getSubmitFn && props.getSubmitFn(submit)
    })

    return () => (
      <MyFormWrap ref={myFormRef} optionMap={optionMap.value} hideBtn={true} form={alldata.form} itemList={itemList.value}></MyFormWrap>
    )
  }
})
